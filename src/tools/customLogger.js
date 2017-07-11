var debug = require("bug-killer");
var fs = require('fs')
var secrets = require('../../secrets.js').mail
const LOG_FILE = '../log.txt'

function error(msg){
		debug.error(debug.getDate().concat(" ").concat(msg))
		sendMail(msg)
}
function info(msg){
		debug.info(debug.getDate().concat(" ").concat(msg))
}
function warn(msg){
		debug.warn(debug.getDate().concat(" ").concat(msg))
}
function fileerror(msg){
	var massage = debug.getDate() + ' ' + msg
	error(msg)
	fileLogger(massage)
	sendMail(msg)
}
function fileinfo(msg){
	var massage = debug.getDate() + ' ' + msg
	info(msg)
	fileLogger(massage)
}
function fileLogger(message){
	message = message + '\n'
	fs.appendFile(LOG_FILE, message, function(err) {
	    if(err) {
	        error("Can't log to file : " + LOG_FILE)
	    }
	}); 
}
function sendMail(msg){
var mailjet = require('node-mailjet')
    .connect(secrets.PB_KEY, secrets.PR_KEY)

var request = mailjet
    .post("send")
    .request({
        "FromEmail":"info@sandhooraholdings.lk",
        "FromName":"fb_youtube_bot",
        "Subject":"fb_youtube_bot",
        "Text-part":msg,
        "Recipients":[
                {
                        "Email": secrets.to
                }
        ]
       });
}


module.exports.info = info
module.exports.error = error
module.exports.warn = warn
module.exports.fileerror = fileerror
module.exports.fileinfo = fileinfo