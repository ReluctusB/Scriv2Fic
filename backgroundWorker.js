

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(sender.tab ?
                "from a content script:" + sender.tab.url :
                "from the extension");
    makeChapter(1);
    if (request.greeting == "url")
      sendResponse({farewell: chrome.identity.getRedirectURL()});
  }
);



function makeChapter(storyID) {

	const apiURL = "https://www.fimfiction.net/developers/api/v2";
	const reDirURL = chrome.identity.getRedirectURL();
	const clientID = "mGzeZKcuYZZtaOvOW361xC3qlHPnLriw";
	const rArray = new Uint8Array();
	const state = window.crypto.getRandomValues(rArray);

	function authorize() {
		let authURL = "https://www.fimfiction.net/authorize-app?"
		authURL += "client_id=" + clientID;
		authURL += "&response_type=token";
		authURL += "&scope=read_stories+write_stories";
		authURL += "&state=" + state;
		authURL += "&redirect_uri=" + reDirURL;
		return chrome.identity.launchWebAuthFlow({
			url: authURL,
			interactive: true
		}, validate);
	}

	function validate(tokenURL) {
		const params = new URLSearchParams(tokenURL);
		const token = params.get("token");
		const returnState = params.get("state");
		if (returnState === state) {
			return token;
		} else {
			console.error("State mismatch in authorization response!");
			return null;
		}
	}

	function getToken() {
		console.log("Getting token!");
		return authorize();
	}

	getToken();
	
}


/*

//API stuff


function getAuth() {
	const reDir

}

function makeChapter(storyid) {
	const postURL = apiURL + storyid + "/chapters";
	fetch(postURL, {
		method:"POST",
		
	});
}

*/