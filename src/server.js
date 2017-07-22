var graph = require('fbgraph')
var jsonfile = require('jsonfile')
var youtube = require('youtube-api')
var fs = require('fs')
var prettybytes = require('pretty-bytes')
var debug = require('bug-killer')
var log = require('./tools/customLogger.js')
var urlparser = require('./tools/urlParser.js')
var Lien = require("lien")
var progress = require('request-progress');
var request = require('request');
var mkpath = require('mkpath')

const LOG_FILE = './log.txt'
const HISTORY_FILE = './history.json'
const QUOTA_FILE = './quota.json'
const FACEBOOK_ACCESS_TOKEN = require('../secrets.js').facebook_token
const SERVER_URL = "ec2-34-210-148-97.us-west-2.compute.amazonaws.com"
const SERVER_PORT = 9000
const YOUTUBE_CREDENTIALS = require('../secrets.js').youtube_credentials

var STOP = false
var STOPPED = true

jsonfile.spaces = 4
var quota = jsonfile.readFileSync(QUOTA_FILE)
//for Facebook
graph.setAccessToken(FACEBOOK_ACCESS_TOKEN)

//For YouTube
var server = new Lien({
    host: SERVER_URL
  , port: SERVER_PORT
});

var oauth = youtube.authenticate({
    type: "oauth",
    client_id: YOUTUBE_CREDENTIALS.web.client_id,
    client_secret: YOUTUBE_CREDENTIALS.web.client_secret,
    redirect_url: YOUTUBE_CREDENTIALS.web.redirect_uris[0]
});

var authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/youtube.upload"]
});

log.info('Authorize this app by visiting this url: ' + authUrl);

// Handle oauth2 callback
server.addPage("/oauth2callback", lien => {
    log.info("Trying to get the token using the following code: " + lien.query.code);
    oauth.getToken(lien.query.code, (err, tokens) =>{
    	if (err) {
        	log.stack(err)
	    }else{
	    	oauth.setCredentials(tokens);
	    	if(STOPPED){
	    		STOPPED = false
	    		STOP = false
				log.info("Got the tokens.");
				lien.end("<h1> Done ! , STARTED </h1> <br> <a href='/control'> Controler </a>");
				var counters = [0,0]
				var history = jsonfile.readFileSync(HISTORY_FILE)
				var pages = require('./pageURLs')
				bootstrap(counters, pages ,history)
			}else{
				lien.end(`<h1> ALREADY RUNNING ! , BUT SET THE NEW TOKEN</h1> <br> <a href='/control'> Controler </a>`)
			}
		}

    });
});
//control stuff
server.addStaticPath('/history.json', "./history.json")
server.addStaticPath('/log.txt', "./log.txt")
server.addStaticPath('/errorlog.txt', "./errorlog.txt")
server.addPage("/control", lien => {
		lien.end(`<h1> CONTROLLER </h1> <a href="/history.json">history.json</a> <br> <a href="/log.txt">log.txt</a> <br> <a href="/errorlog.txt">errorlog.txt</a> <br> to stop visit <a href="/stop">STOP</a> <br> to start visit <a href="/start">START</a>`);
});

server.addPage("/stop", lien => {
	if(STOPPED){
		lien.end(`<h1> ALREADY STOPED ! </h1> <br> <a href='/control'> Controler </a>`);
	}else{
		STOP = true
		lien.end(`<h1> STOPING!!!! ! </h1> <br> <a href='/control'> Controler </a>`);
	}
});


server.addPage("/start", lien => {
	if(STOPPED){
		lien.end(`<h1> Visit to authorize and start </h1> <br> <a href=${authUrl} > GO !<a>`);
	}else{
		if(STOP){
			lien.end(`<h1> TRYING TO STOP ! </h1> <br> <a href='/control'> Controler </a>`);
		}else{
			lien.end(`<h1> ALREADY RUNNING ! </h1> <br> <a href='/control'> Controler </a>`)
		};
	}
});


//life cycles
function bootstrap(counters, pages, history) {

	if(counters[0] < pages.length){
		var page = pages[counters[0]]
		counters[0]++
		graph.get("?id=" + urlparser(page.url), function(err,req){
			if(err){
				log.fileerror('cannot get page id of ' + page.url, true)
				log.stack(err)
				bootstrap(counters, pages, history)
			}else{
				var passdown={pages:pages}
				processPage(counters, req , page.parameters, history, passdown)
			}
    	})
	}else{
		STOPPED = true
		log.fileerror("Done !", true)
	}
}


function processPage(counters, page , parameters, history, passdown){
	var { name,id } = page
	log.fileinfo('procesessing page : ' + id + ' | ' + name)
	if(history[id] == null){
		history[id] = {name: name, processed_on: debug.getDate(), videos: {}}
	}
	graph.get(id + "/videos", function(err, req){
		if(err){
			log.fileerror('cannot get videos of page with id : ' + id, true)
			log.stack(err)
			bootstrap(counters, passdown.pages, history)
		}else{
			
			counters[1] = 0
			processList(counters, id, req, parameters, history, passdown)
		}
	})
	
}

function processList(counters, pageId, list, parameters, history, passdown){
	var {data , paging} = list
	passdown.list = list
	if(counters[1] < data.length){
		var video = data[counters[1]]
		counters[1]++
		processVideo(counters, pageId, video, parameters, history, passdown)
	} else if(paging['next'] != null){
		graph.get(paging.next, function(err, req){
			if(err){
				log.fileerror('error getting next video page with id : ' + pageId, true)
				log.stack(err)
				bootstrap(counters, passdown.pages, history)
			}else{
				counters[1]=0
				processList(counters, pageId, req, parameters, history, passdown)
			}
		})
	}else{
		bootstrap(counters, passdown.pages, history)
	}
}

function processVideo(counters, pageId , video, parameters, history, passdown){
	if(STOP){
		log.fileerror(" Stoped by master ", true)
		counters[0] = passdown.pages.length
		bootstrap(counters, passdown.pages, history)
	}else{
		var { id,description } = video
		log.info('procesessing video : ' + id + ' | ' + description)
		if(history[pageId].videos[id] == null){
			history[pageId].videos[id] = {description: description, processing: false ,downloaded: false, uploaded: false, time_processed: debug.getDate() }
		}
		if(!history[pageId].videos[id].processing){
			history[pageId].videos[id].processing = true
			var fields = {fields : "content_tags,description,content_category,length,title,source"}
			graph.get(id,fields, function(err,req){
				if(err){
					history[pageId].videos[id].processing = false
					log.fileerror('error getting info video with id : ' + id, true)
					log.stack(err)
					processList(counters, pageId, passdown.list, parameters, history, passdown)
				}else{
					var tags = parameters.tags
					var title = parameters.title
					var description = parameters.description
					var catogoryId = parameters.catogoryId
					if(req['description'] != null){
						if(req['description'].length > parameters.minDescriptionLength){
							description = req['description']
							if(req['description'].length < parameters.maxTitleLength){
								title = req['description']
							}
						}
					}
					if(req['title'] != null){
						if(req['title'].length > parameters.minTitleLength){
							title = req['title']
							if(req['description'] === null){
								description = req['title']
							}
						}
					}
					if(req['content_tags'] != null){
						tags = tags.concat(req['content_tags'])
					}
					if(req['content_category'] != null){
					}

					if(history[pageId].videos[id].uploadError != null){
						console.log("######################----###################")
						console.log(history[pageId].videos[id])
						console.log(history[pageId].videos[id].uploadError)
						if(history[pageId].videos[id].uploadError == "invalidTitle" || history[pageId].videos[id].uploadError == "invalidDescription"){
							title = parameters.title
							description = parameters.description
						}else if(history[pageId].videos[id].uploadError == "invalidTags"){
							tags = parameters.tags
						}
					}

					var videoOptions = {tags:tags,title:title,description:description,catogoryId:catogoryId,url:req['source']}
					if(req['length'] < parameters.maxVideoLength && req['source'] != null){
						passdown.parameters = parameters
						downloadVideo(counters, pageId, id, videoOptions, history, passdown)
					}
					else{
						history[pageId].videos[id].passed = true
						history[pageId].videos[id].processing = false
						log.fileinfo('video too long video with id : ' + id)
						processList(counters, pageId, passdown.list, parameters, history, passdown)
					}
				}
			})
		}else{
			log.warn("Video " + id + " already processing")
			processList(counters, pageId, passdown.list, parameters, history, passdown)
		}
	}
}


function downloadVideo(counters, pageId, videoId, videoOptions, history, passdown){
	if(!history[pageId].videos[videoId].downloaded && (quota.downloaded < quota.maxdownload || quota.maxdownload == 0 || quota.downloaded == null) && !STOP){
		var  directory = "./videos/" + pageId + '/'
		var filename = videoId + '.mp4'
		videoOptions.file = directory + filename
		if (!fs.existsSync(directory)) {
	         mkpath.sync(directory, 0700);
	    }
		log.info("downloading video id : " + videoId + " file : " + videoOptions.file)
		progress(request(videoOptions.url)
		).on('progress', function (state){
			videoOptions.size = state.size.total
			log.info(`downloading video id : ${videoId} | ${prettybytes(state.size.transferred)} / ${prettybytes(state.size.total)} ${Math.round(state.percent*100)}% @ ${state.speed}s`)
		}).on('error', function (err) {
			log.fileerror('error downloading video with id : ' + videoId, true)
			log.stack(err)
			if(quota.downloaded == null){
				quota.downloaded = jsonfile.readFileSync(QUOTA_FILE).downloaded
			}
			if(videoOptions.size > 0){
				quota.downloaded += videoOptions.size
	    	}
	    	history[pageId].videos[videoId].downloadFailed = true
	    	history[pageId].videos[videoId].processing = false
	    	history[pageId].videos[videoId].time_processed = debug.getDate()
		    jsonfile.writeFileSync(HISTORY_FILE, history)
	    	processList(counters, pageId, passdown.list, passdown.parameters, history, passdown)  
		}).on('end', function () {
			if(quota.downloaded == null){
				quota.downloaded = jsonfile.readFileSync(QUOTA_FILE).downloaded
			}
			if(videoOptions.size > 0){
				quota.downloaded += videoOptions.size
	    	}
			jsonfile.writeFileSync(QUOTA_FILE, quota)
	    	log.info("video downloaded id : " + videoId + " file : " + videoOptions.file)
		    history[pageId].videos[videoId].downloaded = true
		    history[pageId].videos[videoId].file = videoOptions.file
		    history[pageId].videos[videoId].time_processed = debug.getDate()
		    jsonfile.writeFileSync(HISTORY_FILE, history)
		    if(quota.uploaded >= quota.maxupload && quota.maxupload > 0){
		    		log.fileerror("max upload limit met", true)
		    	}
		    uploadVideo(counters, pageId, videoId, videoOptions, history, passdown)
		}).pipe(fs.createWriteStream(videoOptions.file));
	}else{
		log.warn("video already downloaded id : " + videoId + " file : " + videoOptions.file)
		videoOptions.file = history[pageId].videos[videoId].file
		uploadVideo(counters, pageId, videoId, videoOptions, history, passdown)
	}
}

function uploadVideo(counters, pageId, videoId, videoOptions, history, passdown){
	if(!history[pageId].videos[videoId].uploaded && (quota.uploaded < quota.maxupload || quota.maxupload == 0 || quota.uploaded == null) && !STOP){
		var req = youtube.videos.insert({
		    resource: {
		        snippet: {
		            title: videoOptions.title,
		            description: videoOptions.description,
		            tags: videoOptions.tags
		        },
		        status: {
		            privacyStatus: "public",
		            license:"youtube",
		            embeddable:true
		        }
		    },
		    part: "snippet,status",
		    media: {
		        body: fs.createReadStream(videoOptions.file)
		    }
		}, function(err, data){
			history[pageId].videos[videoId].processing = false
			if(err){
		    	if(err['errors'][0]['reason'] == "invalidTitle" || err['errors'][0]['reason'] == "invalidDescription"){
		    		history[pageId].videos[videoId].uploadError = err['errors'][0]['reason']
		    		log.fileerror('error uploading video with id : ' + videoId)
					log.stack(err)
					console.log("########################################")
		    		console.log(videoOptions)
					history[pageId].videos[videoId].uploadFailed = true
					history[pageId].videos[videoId].time_processed = debug.getDate()
		    		jsonfile.writeFileSync(HISTORY_FILE, history)
		    		//processList(counters, pageId, passdown.list, passdown.parameters, history, passdown)
		    	}else if(err['errors'][0]['reason'] == "quotaExceeded" || err['errors'][0]['reason'] == "uploadLimitExceeded" || err['errors'][0]['reason'] == "rateLimitExceeded"){
		    		log.fileerror("STOPED PROCESSING for 24 hours ", true)
		    		setTimeout(
		    			function (){
		    				log.fileerror("STARTED PROCESSING", true)
		    				var counters = [0,0]
							var history = jsonfile.readFileSync(HISTORY_FILE)
							var pages = require('./pageURLs')
							bootstrap(counters, pages ,history)
		    			}, 86400000);

		    	}else if(err['errors'][0]['reason'] == "authorizationRequired" || err['errors'][0]['reason'] == "forbidden"){
		    		log.fileerror('Reaouthorize from ' + authUrl, true)
		    	}else{
		    		log.fileerror('error uploading video with id : ' + videoId, true)
					log.stack(err)
					history[pageId].videos[videoId].uploadFailed = true
					history[pageId].videos[videoId].time_processed = debug.getDate()
			    	jsonfile.writeFileSync(HISTORY_FILE, history)
		    		processList(counters, pageId, passdown.list, passdown.parameters, history, passdown)
		    	}
			}
		    else{
		    	if(quota.uploaded == null){
					quota.uploaded = jsonfile.readFileSync(QUOTA_FILE).uploaded
				}
				if(videoOptions.size > 0){
					quota.uploaded += videoOptions.size
		    	}
		    	log.info("video uploaded id : " + videoId + " file : " + videoOptions.file)
		    	history[pageId].videos[videoId].uploaded = true
		    	history[pageId].videos[videoId].time_processed = debug.getDate()
		    	jsonfile.writeFileSync(HISTORY_FILE, history)
		    	if(quota.uploaded >= quota.maxupload && quota.maxupload > 0){
		    		log.fileerror("max upload limit met", true)
		    	}
		    	processList(counters, pageId, passdown.list, passdown.parameters, history, passdown)
		    }
		})
		setTimeout(function (){uploadspeed()}, 2000);
	}else{
		history[pageId].videos[videoId].processing = false
		log.warn("video already uploaded id : " + videoId + " file : " + videoOptions.file)
		processList(counters, pageId, passdown.list, passdown.parameters, history, passdown)
	}

	function uploadspeed(){
		var total = videoOptions.size
		var trasfered = req.req.connection._bytesDispatched
        if (trasfered < total) {
        	log.info(`uploading video id : ${videoId} | ${prettybytes(trasfered)} / ${prettybytes(total)} ${Math.round(trasfered/total*100)}%`);
	        setTimeout(function (){uploadspeed()}, 1000);
        }
	}
	
}
