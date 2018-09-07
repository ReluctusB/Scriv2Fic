/* --Globals-- */
let authToken = null;
let queue = [];
let storyID = 0;
const apiURL = "https://www.fimfiction.net/api/v2/";

/* Gets an access token via the implicit OAuth2 flow and stores it in localstorage.
Calls callback function once the access token has been recieved. */
function getToken(callback) {

	/* Waits for the access token to arrive, then calls callback. Times out
	if it takes over a minute.*/
	function waitForAuth(retries) {
		if (authToken) {
			callback();
		} else if (retries >= 60) {
			notify("Error: Couldn't get an authorization token! Request timed out.");
		} else {
			console.log("Waiting for authorization...");
			setTimeout(()=>waitForAuth(retries+1), 2000);
		}
	}

	const reDirURL = chrome.identity.getRedirectURL();
	const clientID = "mGzeZKcuYZZtaOvOW361xC3qlHPnLriw";
	const rArray = new Uint32Array(8);
	const state = window.crypto.getRandomValues(rArray).join("");
	console.log("Getting token...");
	let authURL = "https://www.fimfiction.net/authorize-app?";
	authURL += "client_id=" + clientID;
	authURL += "&response_type=token";
	authURL += "&scope=read_stories+write_stories";
	authURL += "&state=" + state;
	authURL += "&redirect_uri=" + reDirURL;

	chrome.identity.launchWebAuthFlow({
		url: authURL,
		interactive: true
	}, function(redirect_url){
		const params = (new URL(redirect_url.replace("#","?"))).searchParams;
		const token = params.get("token");
		const returnState = params.get("state");
		if (returnState && returnState === state) {
			console.log("Token recieved!");
			window.localStorage.setItem("scriv2fic_token", token);
			window.localStorage.setItem("scriv2fic_token_set", Date.now());
			authToken = token;
		} else if (returnState){
			console.error("State mismatch in authorization response!");
		} else {
			console.error("Authorization response was invalid!");
		}
	});

	waitForAuth(0);
}

/*handles errors returned in fetch responses. */
function handleErrors(errorData, action, rateRemaining, retryFunction) {
	console.error(action + ": " + errorData.code + ": " + errorData.title + ": " + errorData.detail);
	switch(errorData.code) {
		case 4040: //Resource unavailable
			notify("Error: 404! Fimfiction may be down. Try again later!");
			break;
		case 4001: //Bad JSON
			notify(`Error: Invalid JSON! There's something about "${action}" that we just didn't like. Please send an error report to user RB_ with your chapter's text and title.`);
			break;
		case 4030: //Invalid permission (probably switched user)
			notify("Error: Invalid permissions! If you have switched to a different account, please go back to that account and delete the extra session from your session list.");
			break;
		case 4032: //Invalid token
			console.log("Stored token has expired or was invalid. Fetching a new one.");
			authToken = null;
			getToken(retryFunction);
			break;
		case 4225: //Invalid argument (Chapter too long)
			notify(`Error:  Chapter ${action} too long! We're sorry; because of a limitation with the API, we are currently unable to upload chapters beyond a certain length.`);
			break;
		case 4290: //Rate limited
			setTimeout(retryFunction, rateRemaining*1000 + 1000);
			notify(`Warning: The application has been rate limited. Halting progress until limit has expired (${rateRemaining} seconds).`);
			break;
		case 5000: //Internal server error
			notify("Error: Internal Error! Something went wrong on Fimfiction's end. Try again, and if the problem persists, please contact user RB_.");
			break;
		default:
			notify(`Error: Critical faliure! Something has gone horribly wrong. Please contact user RB_ and give him this: "${errorData.code}: ${errorData.detail}"`);
	}
}

/* Deletes all prexisting chapters, then calls callback (The makeChapters function). */
function deleteExistingChapters(callback) {

	/* Gets a list of all existing chapters, then passes them off to deleteChapters. */
	function getExistingChapters() {
		const requestURL = apiURL + "stories/"+storyID+"/chapters";
		var xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		    if (this.readyState == 4) {
		    	const response = JSON.parse(this.response);	
		    	if (response.errors) {
		    		const rateTime = parseInt(this.getResponseHeader("x-rate-limit-reset"));
					handleErrors(response.errors[0], "Chapter get", rateTime, getExistingChapters);
				} else {
					setTimeout(()=>deleteChapters(response.data), 250);
				}
		    }
		};
		xhttp.open("GET", requestURL, true);
		xhttp.setRequestHeader("Authorization", "Bearer " + authToken);
		xhttp.send();
	}

	/* Deletes all chapters on a story. */
	function deleteChapters(chapters) {
		const curChapter = chapters.pop();
		const requestURL = curChapter.links.self;
		var xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		    if (this.readyState == 4) {
		    	if (this.response) {
			    	const response = JSON.parse(this.response);	
			    	if (response.errors) {
			    		chapters.push(curChapter);
			    		const rateTime = parseInt(this.getResponseHeader("x-rate-limit-reset"));
						handleErrors(response.errors[0], "Chapter delete", rateTime, () => deleteChapters(chapters));
					}
				} else {
					console.log("Successfully deleted chapter" + curChapter.attributes.title);
					if (chapters.length) {
						setTimeout(()=>deleteChapters(chapters), 250);
					} else {
						callback();
					}
				}
		    }
		};
		xhttp.open("DELETE", requestURL, true);
		xhttp.setRequestHeader("Authorization", "Bearer " + authToken);
		xhttp.send();
	}

	const storedToken = window.localStorage.getItem("scriv2fic_token");
	const storedTokenDate = window.localStorage.getItem("scriv2fic_token_set");
	if (storedToken && storedTokenDate && parseInt(storedTokenDate) > Date.now() - 86400000) {
		authToken = storedToken;
		console.log("Pulling token from storage");
		getExistingChapters();
	} else {
		if (authToken) {authToken = null;}
		getToken(getExistingChapters);
	}
}

/* Creates chapters and writes their contents to them. */
function makeChapter(chapterTitle, chapterBody) {

	/* Creates a chapter with a title of title, 
	then passes that title's id over to writeToChapter() */
	function createChapter(title) {	
		const requestURL = apiURL + "stories/"+storyID+"/chapters" + "?fields[chapter]";
		const requestBody = `{"data": {"type": "chapter","attributes": {"title": "${title}"}}}`;
		var xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		    if (this.readyState == 4) {
		    	const response = JSON.parse(this.response);	
		    	if (response.errors) {
		    		const rateTime = parseInt(this.getResponseHeader("x-rate-limit-reset"));
					handleErrors(response.errors[0], chapterTitle, rateTime, ()=>createChapter(title));
				} else {
					setTimeout(()=>writeToChapter(response.data.links.self), 250);
				}
		    }
		};
		xhttp.open("POST", requestURL, true);
		xhttp.setRequestHeader("Authorization", "Bearer " + authToken);
		xhttp.send(requestBody);
	}

	/* Writes contents to chapter by id, then queues up the next chapter to be made. */
	function writeToChapter(url) {	
		const requestURL = url;
		const requestBody = `{"data": {"type": "chapter","attributes": {"content": "${chapterBody}"}}}`;
		var xhttp = new XMLHttpRequest();
		xhttp.onreadystatechange = function() {
		    if (this.readyState == 4) {
		    	const response = JSON.parse(this.response);
		    	if (response.errors) {
		    		const rateTime = parseInt(this.getResponseHeader("x-rate-limit-reset"));
					handleErrors(response.errors[0], chapterTitle, rateTime, ()=>writeToChapter(url));
				} else {
					queueDown(); 
					console.log("Successfully created chapter " + chapterTitle);
				}
		    }
		};
		xhttp.open("PATCH", requestURL, true);
		xhttp.setRequestHeader("Authorization", "Bearer " + authToken);
		xhttp.send(requestBody);
	}

	//setTimeout(()=>createChapter(chapterTitle), 250);
	console.log(chapterBody);
}

/* Creates a Chrome notification */
function notify(message) {
	chrome.notifications.create(storyID, {
		"type": "basic",
		"title": "Scriv2Fic",
		"message": message,
		"iconUrl": chrome.extension.getURL("Icons/scriv2ficIcon128.png"),
	});	
	chrome.notifications.onClicked.addListener(id => window.open('https://www.fimfiction.net/story/'+id, '_blank'));
}

/* Unloads the chapter queue. Notifies user when done.*/
function queueDown() {
	if (queue.length) {
		makeChapter(queue[0].title, queue[0].body);
		queue.shift();
	} else {
		notify("Mission success! Your story has been uploaded to Fimfiction.");
		const storyURL = "https://www.fimfiction.net/story/" + storyID + "/*"
		chrome.tabs.query({url:storyURL}, tab => {if (tab[0]) {chrome.tabs.reload(tab[0].id);}})
		return;
	}
}

/* Converts the XML document generated by the content script into BBCode strings,
separated by chapter, and then queues them in the correct order for upload. */
function convertCompile(xmlString, dividerString) {

	/* Builds the chapter queue and triggers downQueing when full. */
	function queueUp(chapterTitle, chapterBody, i) {
		queue.push({title:chapterTitle, body:chapterBody});
		if (queue.length === i) {
			queueDown();
		}
	}

	/* Runs Scrivening XML elements through the bbcode converter and builds them into chapters,
	then queues them. */
	function prepChapters() {
		const xmlParser = new DOMParser();
		const compiledXML = xmlParser.parseFromString(xmlString, "text/xml");
		const chapters = compiledXML.getElementsByTagName("Chapter");
		for (let i=0;i<chapters.length;i++) {
			let chapterTitle = chapters[i].getAttribute("Title").replace(/_/g, " ");
			let chapterBody = "";
			const scrivenings = chapters[i].getElementsByTagName("Scrivening");
			for (let l=0;l<scrivenings.length;l++) {
				let scriveningText = scrivenings[l].textContent;
				chapterBody += rtfToBBCode(scriveningText);
				if (l !== scrivenings.length - 1) {chapterBody += dividerString}
			}
			queueUp(chapterTitle, chapterBody, chapters.length);
		}
	}
	
	const storedToken = window.localStorage.getItem("scriv2fic_token");
	const storedTokenDate = window.localStorage.getItem("scriv2fic_token_set");
	if (storedToken && storedTokenDate && parseInt(storedTokenDate) > Date.now() - 86400000) {
		authToken = storedToken;
		console.log("Pulling token from storage");
		prepChapters();
	} else {
		if (authToken) {authToken = null;}
		getToken(prepChapters);
	}
}

/* Converts RTF document strings into BBCode. */
function rtfToBBCode (rtfIn) {
	if (rtfIn.includes("\\pgnstarts0")) {
		const splitRTF = rtfIn.split("\\pgnstarts0", 2);
		return bbConvertWin(splitRTF);
	} else {
		const splitRTF = rtfIn.split(/\\pard.*$/m, 2);
		return bbConvertMac(splitRTF);
	}	
}

/* Listens for the content script (addService.js) to give it an xml document it can work on. */
chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
	    if (request.xmlString && request.storyID) {
	    	storyID = request.storyID;
	    	if (!request.delete) {
	    		convertCompile(request.xmlString, request.divider);
	    	} else {
	    		deleteExistingChapters(()=>convertCompile(request.xmlString, request.divider));
	    	}
		    sendResponse({
		    	farewell: "<h1 style='font-size:2rem;font-weight:bold;'>Spike, take a letter!</h1>"
		    	+"<span style='font-weight:bold;'>Your document is now being processed into BBCode and sent to Fimfiction.</span><br><br>"
		    	+"This may take a little while, but don't worry! "
		    	+"You can safely navigate away from this page, and we'll alert you when we're done."
		    });
		} else {
			sendResponse({
		    	farewell: "<h1 style='font-size:2rem;font-weight:bold;'>I just don't know what went wrong!</h1>"
		    	+"Something broke somewhere along the line. If you're seeing this, please contact user "
		    	+"<a href='https://www.fimfiction.net/user/34408/RB_>RB_</a> and tell him he messed up."
		    });
		}
	}
);

/* Converts RGB arrays ([R, G, B]) into hex colour values */
	function rgbToHex(rgbArray) {
		outStr = "#"
		rgbArray.forEach(val => {
			let hex = parseInt(val).toString(16);
			outStr += hex.length == 1 ? "0" + hex : hex;
		});
		return outStr;
	}

function bbConvertMac(splitRTF) {
	let hexColourTable = [];
	splitRTF[0].match(/{\\colortbl;.+(?=;})/)[0].replace("{\\colortbl;","").split(";").forEach(pallet => {
		hexColourTable.push(rgbToHex(pallet.replace("\\red","").replace("green","").replace("blue","").split("\\")));
	});

	let outputString = "";

	const paragraphs = splitRTF[1].match(/^.*$/gm);
	paragraphs.forEach(paragraph => {
		let contents = paragraph;
		contents = contents.replace(/\\$/gm, "\\n");

		contents = contents.replace(/\\/g, "⚐Ï⚑");

		contents = contents
			.replace("⚐Ï⚑{⚐Ï⚑⚐Ï⚑Scrv_ps=", "[quote]")
			.replace("⚐Ï⚑⚐Ï⚑end_Scrv_ps⚐Ï⚑", "[/quote]")
			.replace(/⚐Ï⚑hich⚐Ï⚑f\d ⚐Ï⚑emdash ⚐Ï⚑loch⚐Ï⚑f\d /g,"—")
			.replace(/⚐Ï⚑tab /g, "\\t")
			.replace(/"/g, `\\"`)
			.replace(/}/g, `\\}`);

		//Return all remaining instances of the unicode string back to backslashes.
		contents = contents.replace(/(⚐Ï⚑){1,2}/g, "\\\\");

		outputString += contents;
	});	

	return outputString;
}

function bbConvertWin(splitRTF) {
	let hexColourTable = [];
	splitRTF[0].match(/{\\colortbl;.+(?=;})/)[0].replace("{\\colortbl;","").split(";").forEach(pallet => {
		hexColourTable.push(rgbToHex(pallet.replace("\\red","").replace("green","").replace("blue","").split("\\")));
	});

	let outputString = "";
	const rtfParagraphs = splitRTF[1].match(/\\par.*$/gm);

	let alignment = "left";
	let listLvl = -1;
	let nest = [];
	for (let p=0;p<rtfParagraphs.length;p++) {

		let paragraphString = ""

		if (listLvl > -1 && !rtfParagraphs[p].includes("\\ilvl" + listLvl)) {
			if (!rtfParagraphs[p].includes("\\ilvl")) {
				while (listLvl > -1) {
					paragraphString += "[/list]";
					listLvl -= 1;
				}
			} else {
				let curLvl = parseInt(rtfParagraphs[p].match(/\\ilvl\d+/)[0].replace("\\ilvl",""));
				while (listLvl > curLvl) {
					paragraphString += "[/list]";
					listLvl -= 1;
				}
			}
		}

		paragraphString += "\\n\\n";

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

		if (rtfParagraphs[p].includes("\\ls")) {
			if (parseInt(rtfParagraphs[p].match(/\\ilvl\d+/)[0].replace("\\ilvl","")) > listLvl) {
				let listType = rtfParagraphs[p].match(/{\\listtext\\f0\\fs22\\b0\\i0\s.(?=\.\s})/);
				if (listType) {
					paragraphString += "[list=" + listType[0].replace(/{\\listtext\\f0\\fs22\\b0\\i0\s/,"") + "]";
				} else {
					paragraphString += "[list]";
				}	
				listLvl += 1;
			}	
		}

		if (listLvl > -1) {
			paragraphString += "[*]";
		}

		const rtfGroups = rtfParagraphs[p].match(/{\\f.*?}+/g);	
		if (rtfGroups) {		
			for (let i=0;i<rtfGroups.length;i++) {
				const args = rtfGroups[i].substring(0,rtfGroups[i].indexOf(" "));
				let contents = rtfGroups[i].substring(rtfGroups[i].indexOf(" ")).slice(1).replace(/}+$/gm,"");
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
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "underline" && !args.includes("\\ul\\ulc0")) {
							groupString += "[/u]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "strikethrough" && !args.includes("\\strike\\strikec0")) {
							groupString += "[/s]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "smallcaps" && !args.includes("\\scaps")) {
							groupString += "[/smcaps]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "superscript" && !args.includes("\\super")) {
							groupString += "[/sup]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "subscript" && !args.includes("\\sub")) {
							groupString += "[/sub]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "color" && !args.includes("\\cf")) {
							groupString += "[/color]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "url" && !args.includes("\\fldrslt")) {
							groupString += "[/url]";
							nest.splice(nestLevel-1, 1);
							nestLevel--;
						} else if (nest[nestLevel-1] === "email" && !args.includes("\\fldrslt")) {
							groupString += "[/email]";
							nest.splice(nestLevel-1, 1);
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

				if (args.includes("\\cf") && !nest.includes("color")) {
					tableRef = parseInt(args.match(/\\cf\d+/)[0].replace("\\cf","")) - 1;
					groupString += "[color=" + hexColourTable[tableRef] + "]";
					nest.push("color");
				}

				if (args.includes("\\field{\\*\\fldinst")) {
					linkURL = contents.replace("HYPERLINK ","").replace(/\"/g,"");
					if (linkURL.includes("mailto:")) {
						groupString += "[email]";
						nest.push("email");
						rtfGroups[i+1] = rtfGroups[i+1].replace("mailto:","");
					} else if (!contents.includes("scrivcmt")){
						groupString += "[url=" + linkURL + "]";
						nest.push("url");
					}
					contents = "";					
				}
				
				//Replace all backslashes with an arbitrary unicode string: ⚐Ï⚑
				//RTF really likes backslashes. JSON, unfortunately, does not.
				//Doing this makes dealing with escaped characters a lot easier.
				contents = contents.replace(/\\/g, "⚐Ï⚑");

				/* -Unicode- */
				const unicodeChars = contents.match(/⚐Ï⚑u\d+⚐Ï⚑/g);
				if (unicodeChars) {
					contents = contents.replace(/⚐Ï⚑loch⚐Ï⚑af\d⚐Ï⚑hich⚐Ï⚑af\d⚐Ï⚑dbch⚐Ï⚑af\d⚐Ï⚑uc1|'\w\w/g, "");
					unicodeChars.forEach(uniCode => {
						contents = contents.replace(uniCode, String.fromCharCode(parseInt(uniCode.slice(4))));
					});
				}

				contents = contents
					.replace("⚐Ï⚑{⚐Ï⚑⚐Ï⚑Scrv_ps=", "[quote]")
					.replace("⚐Ï⚑⚐Ï⚑end_Scrv_ps⚐Ï⚑", "[/quote]")
					.replace(/⚐Ï⚑hich⚐Ï⚑f\d ⚐Ï⚑emdash ⚐Ï⚑loch⚐Ï⚑f\d /g,"—")
					.replace(/⚐Ï⚑tab /g, "\\t")
					.replace(/⚐Ï⚑line /g, "\\n")
					.replace(/"/g, `\\"`);

				//Return all remaining instances of the unicode string back to backslashes.
				contents = contents.replace(/(⚐Ï⚑){1,2}/g, "\\\\");

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
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "underline") {
					paragraphString += "[/u]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "strikethrough") {
					paragraphString += "[/s]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "smallcaps") {
					paragraphString += "[/smcaps]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "superscript") {
					paragraphString += "[/sup]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "subscript") {
					paragraphString += "[/sub]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "color") {
					paragraphString += "[/color]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "url") {
					paragraphString += "[/url]";
					nest.splice(nestLevel-1, 1);
					nestLevel--;
				} else if (nest[nestLevel-1] === "email") {
					paragraphString += "[/email]";
					nest.splice(nestLevel-1, 1);
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