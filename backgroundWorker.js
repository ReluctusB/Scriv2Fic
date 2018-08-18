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
			let scriveningText = scrivenings[l].textContent;
			chapterBody += rtfToBBCode(scriveningText);
		}
		//makeChapter(storyID, chapterTitle, chapterBody);
		console.log(chapterBody);
	}
}

function rtfToBBCode (rtfIn) {
	/* Table processing will go here eventually*/

	const splitRTF = rtfIn.split("\\pgnstarts0", 2)

	let outputString = ""
	const rtfParagraphs = splitRTF[1].match(/\\par.*$/gm);

	let alignment = "left";
	let nest = [];
	for (let p=0;p<rtfParagraphs.length;p++) {
		let paragraphString = "\n\n"

		const alignmentQuantifier = rtfParagraphs[p].match(/\\(q[lcrj]\\)?ltrch\\loch/);
		if (alignmentQuantifier) {
			if (!alignmentQuantifier[0].match(/qc|qr/)) {
				alignment = "left";
			} else if (alignmentQuantifier[0].includes("\\qc\\")) {
				alignment = "center";
			} else if (alignmentQuantifier[0].includes("\\qr\\")) {
				alignment = "right";
			}
		}

		if (alignment === "left") {
			//pass;
		} else if (alignment === "center") {
			paragraphString += "[center]";
		} else if (alignment === "right") {
			paragraphString += "[right]";
		}

		const rtfGroups = rtfParagraphs[p].match(/(?<!\\){\\f\d.*?}/g);
		
		if (rtfGroups) {		
			for (let i=0;i<rtfGroups.length;i++) {
				const args = rtfGroups[i].substring(0,rtfGroups[i].indexOf(" "))
				let contents = rtfGroups[i].substring(rtfGroups[i].indexOf(" ")).slice(1).replace(/}$/gm,"")
				let groupString = "";

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
						} else if (nest[nestLevel-1] === "underline" && !args.includes("\\ul\\ulc0")) {
							groupString += "[/u]";
							nest.splice(nestLevel-1, 1)
							nestLevel--;
						} else if (nest[nestLevel-1] === "strikethrough" && !args.includes("\\strike\\strikec0")) {
							groupString += "[/s]";
							nest.splice(nestLevel-1, 1)
							nestLevel--;
						} else if (nest[nestLevel-1] === "smallcaps" && !args.includes("\\scaps")) {
							groupString += "[/smcaps]";
							nest.splice(nestLevel-1, 1)
							nestLevel--;
						} else if (nest[nestLevel-1] === "superscript" && !args.includes("\\super")) {
							groupString += "[/sup]";
							nest.splice(nestLevel-1, 1)
							nestLevel--;
						} else if (nest[nestLevel-1] === "subscript" && !args.includes("\\sub")) {
							groupString += "[/sub]";
							nest.splice(nestLevel-1, 1)
							nestLevel--;
						} else {
							nestLevel--;
						}						
					}
				}

				if (args.includes("\\b1") && !nest.includes("bold")) {
					groupString += "[b]";
					nest.push("bold");
				} 

				if (args.includes("\\i1") && !nest.includes("italic")) {
					groupString += "[i]";
					nest.push("italic");
				}

				if (args.includes("\\ul\\ulc0") && !nest.includes("underline")) {
					groupString += "[u]";
					nest.push("underline");
				}

				if (args.includes("\\ul\\ulc0") && !nest.includes("underline")) {
					groupString += "[u]";
					nest.push("underline");
				}

				if (args.includes("\\strike\\strikec0") && !nest.includes("strikethrough")) {
					groupString += "[s]";
					nest.push("strikethrough");
				}

				if (args.includes("\\scaps") && !nest.includes("smallcaps")) {
					groupString += "[smcaps]";
					nest.push("smallcaps");
				}

				if (args.includes("\\super") && !nest.includes("superscript")) {
					groupString += "[sup]";
					nest.push("superscript");
				}

				if (args.includes("\\sub") && !nest.includes("subscript")) {
					groupString += "[sub]";
					nest.push("subscript");
				}

				/*
				-colour (have to get colour table first)
				-size? How do we handle that if we don't know default? Average out the default first? Guess??
					-Also, don't forget: there are max and min values for size. 32 to 8, looks like. Not sure if that's in pt or not.
				*/	

				contents = contents.replace(/(?<!\\)\\tab /g, "		");
				contents = contents.replace(/(?<!\\)\\line /g, "\n");
				contents = contents.replace(/\\hich\\f\d \\emdash \\loch\\f\d /g,"—")
				/* -Unicode- */
				const unicodeChars = contents.match(/\\u\d+\\/g);
				if (unicodeChars) {
					contents = contents.replace(/\\loch\\af\d\\hich\\af\d\\dbch\\af\d\\uc1|(?<=\\u\d+\\)'\d\d/g, "");
					unicodeChars.forEach(uniCode => {
						contents = contents.replace(uniCode, String.fromCharCode(parseInt(uniCode.slice(2))));
					});
				}
				
				groupString += contents;
				paragraphString += groupString;
			}
		}

		if (nest.length) {
			let nestLevel = nest.length;
			while (nestLevel > 0) {
				if (nest[nestLevel-1] === "bold") {
					paragraphString += "[/b]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "italic") {
					paragraphString += "[/i]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else if (nest[nestLevel-1] === "underline") {
					paragraphString += "[/u]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else if (nest[nestLevel-1] === "strikethrough") {
					paragraphString += "[/s]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else if (nest[nestLevel-1] === "smallcaps") {
					paragraphString += "[/smcaps]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else if (nest[nestLevel-1] === "superscript") {
					paragraphString += "[/sup]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else if (nest[nestLevel-1] === "subscript") {
					paragraphString += "[/sub]";
					nest.splice(nestLevel-1, 1)
					nestLevel--;
				} else {
					nestLevel--;
				}
			}
		}

		if (alignment === "left") {
			//pass;
		} else if (alignment === "center") {
			paragraphString += "[/center]";
		} else if (alignment === "right") {
			paragraphString += "[/right]";
		}

		outputString += paragraphString;
	}
	return outputString;
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