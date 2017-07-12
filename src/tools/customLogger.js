var debug = require("bug-killer");
var fs = require('fs')
var secrets = require('../../secrets.js').mail
const LOG_FILE = './log.txt'
const LOG_STACK_FILE = './errorlog.txt'

function error(msg){
		debug.error(debug.getDate().concat(" ").concat(msg))
		fileLogger(msg)
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
function stacktrace(message){
	console.log(message)
	var date = debug.getDate()
	message = date + '\n' + message + '\n\n'
	fs.appendFile(LOG_STACK_FILE, message, function(err) {
	    if(err) {
	        error("Can't log stack trace to file : " + LOG_STACK_FILE)
	    }
	});
	sendMail(message) 
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
	        "Text-part":msg +"\n vist: ec2-34-210-148-97.us-west-2.compute.amazonaws.com:9000/control",
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
module.exports.stack = stacktrace
module.exports.fileerror = fileerror
module.exports.fileinfo = fileinfo