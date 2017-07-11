function parseURL(url){
	url = url.replace(/:/g,"%3A")
	return url.replace(/[/]/g,"%2F")
}
module.exports = parseURL