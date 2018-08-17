let authToken;

function getToken() {
	const reDirURL = chrome.identity.getRedirectURL();
	const clientID = "mGzeZKcuYZZtaOvOW361xC3qlHPnLriw";
	const rArray = new Uint8Array(5);
	const state = window.crypto.getRandomValues(rArray).join("");
	console.log("Getting token!");
	let authURL = "https://www.fimfiction.net/authorize-app?"
	authURL += "client_id=" + clientID;
	authURL += "&response_type=token";
	authURL += "&scope=read_stories+write_stories";
	authURL += "&state=" + state;
	authURL += "&redirect_uri=" + reDirURL;
	chrome.identity.launchWebAuthFlow({
		url: authURL,
		interactive: true
	}, function(redirect_url){
    	const params = new URLSearchParams(redirect_url);
		const token = params.get("token");
		const returnState = params.get("state");
		if (returnState === state) {
			console.log("Token recieved!");
			authToken = token;
		} else {
			console.error("State mismatch in authorization response!");
		}
	});
	
}

function makeChapter(storyID, chapterTitle, chapterBody) {
	if(!authToken) {getToken()}
	const apiURL = "https://www.fimfiction.net/api/v2";
	

	let requestBody = {}

	function makeRequest(token) {
		fetch(apiURL+"/stories/"+storyID+"/chapters", {
			method: "POST",
			header: {
				Authorization: "Bearer " + authToken,
			},
			body: requestBody
		})
		.then(response => {console.log(response); return response;})
		.catch(error => console.error(error));	
	}
}

function convertCompile(xmlString, storyID) {
	const xmlParser = new DOMParser;
	const compiledXML = xmlParser.parseFromString(xmlString, "text/xml");
	const chapters = compiledXML.getElementsByTagName("Chapter");
	for (let i=0;i<chapters.length;i++) {
		let chapterTitle = chapters[i].getAttribute("Title");
		let chapterBody = "";
		const scrivenings = chapters[i].getElementsByTagName("Scrivening");
		for (let l=0;l<scrivenings.length;l++) {
			let scriveningText = scrivenings[l].textContent;
			chapterBody += rtfToBBCode(scriveningText);
		}
		//makeChapter(storyID, chapterTitle, chapterBody);
	}
}

function rtfToBBCode (rtfIn) {
	return rtfIn
}

chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
	    console.log(sender.tab ?
	                "from a content script:" + sender.tab.url :
	                "from the extension");
	    if (request.xmlString && request.storyID) {
		    convertCompile(request.xmlString, request.storyID);
		    sendResponse({farewell: "Document recieved!"});
		}
	}
);