chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(sender.tab ?
                "from a content script:" + sender.tab.url :
                "from the extension");
    makeChapter(417170);
    if (request.greeting == "url")
      sendResponse({farewell: chrome.identity.getRedirectURL()});
  }
);

function makeChapter(storyID) {

	const apiURL = "https://www.fimfiction.net/api/v2";
	const reDirURL = chrome.identity.getRedirectURL();
	const clientID = "mGzeZKcuYZZtaOvOW361xC3qlHPnLriw";
	const rArray = new Uint8Array(5);
	const state = window.crypto.getRandomValues(rArray).join("");
	let authToken;

	function authorize() {
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
				authToken = token
				makeRequest(authToken);
			} else {
				console.error("State mismatch in authorization response!");
			}
		});
	}

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

	authorize();
}
