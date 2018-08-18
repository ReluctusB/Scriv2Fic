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
		console.log(chapterTitle);
		for (let l=0;l<scrivenings.length;l++) {
			//console.log(scrivenings[l].getAttribute("ID"));
			let scriveningText = scrivenings[l].textContent;
			//console.log(scriveningText);
			chapterBody += rtfToBBCode(scriveningText);
		}
		//makeChapter(storyID, chapterTitle, chapterBody);
		console.log(chapterBody);
	}
}

function rtfToBBCode (rtfIn) {
	/* Table processing will go here eventually*/


	const splitRTF = rtfIn.split("\\pgnstarts0", 2)

	/* Inline elements */
	let outputString = ""
	const rtfGroups = splitRTF[1].match(/(?<!\\){\\f\d.*?}/g);
	let nest = []
	for (let i=0;i<rtfGroups.length;i++) {
		const args = rtfGroups[i].substring(0,rtfGroups[i].indexOf(" "))
		const contents = rtfGroups[i].substring(rtfGroups[i].indexOf(" ")).replace(/}$/gm,"")
		let groupString = ""

		if (args.includes("\\b1") && !nest.includes("bold")) {
			groupString += "[b]";
			nest.push("bold");
		} 

		if (args.includes("\\i1") && !nest.includes("italic")) {
			groupString += "[i]";
			nest.push("italic");
		}

		if (nest.length) {
			let nestLevel = nest.length;
			while (nestLevel > 0) {
				if (nest[nestLevel-1] === "bold" && args.includes("\\b0")) {
					groupString += "[/b]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "italic" && args.includes("\\i0")) {
					groupString += "[/i]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else {
					nestLevel--;
				}
				
			}
		}

		groupString += contents;
		outputString += groupString;
	}

	/*if (nest.length) {
		while (nest.length) {
			if (nest[nest.length-1] === "bold") {
				groupString += "[/b]";
				nest.pop;
			} else if (nest[nest.length-1] === "italics") {
				groupString += "[/i]";
				nest.pop;
			}
		}
	}*/

	return outputString;
}

/*
	-- Pseudocode --
	let outputString = ""
	get rtf groups
	for each rtf group
		let groupContent = content of group
		let groupString = ""
		if \b1 (not\\b1) && !bold:
			groupString += "[b]"
			bold = true
		else if bold && \b0 (not\\b0):
			groupString += "[/b]"
			bold = false	
		--repeat for all inline modifiers--
		groupString += groupContent
		if bold && end of file
			groupString += [/b]
		--repeat for all inline modifiers--
		outputString += groupString

		--repeat for all inline modifiers--
		-bold
		-italic
		-underline
		-strikethrough
		-smallcaps
		-superscript
		-subscript
		-colour (have to get colour table first)
		-size? How do we handle that if we don't know default? Average out the default first? Guess??
			-Also, don't forget: there are max and min values for size. 32 to 8, looks like. Not sure if that's in pt or not.
	*/

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