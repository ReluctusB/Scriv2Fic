/* --Globals-- */
let authToken = null;
let queue = [];
let storyID = 0;
let requestNo = 0;

/* Gets an access token via the implicit OAuth2 flow and stores it in localstorage.
Calls callback function once the access token has been recieved. */
function getToken(callback) {

	/* Waits for the access token to arrive, then calls callback. Times out
	if it takes over 30 tries. */
	function waitForAuth(retries) {
		if (authToken) {
			callback();
		} else if (retries >= 30) {
			notify("Error: Couldn't get an authorization token! Request timed out.", "error", true);
		} else {
			console.log("Waiting for authorization...");
			setTimeout(()=>waitForAuth(retries+1), 2000);
		}
	}

	/* Sets a timer to delete the access token from localstorage after 1 hour */
	function setTokenDecay() {
		setTimeout(()=>window.localStorage.removeItem("scriv2fic_token"), 3600000);
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
		const token = redirect_url.match(/(?<=token=).*(?=&)/)[0];
		const returnState = redirect_url.match(/(?<=state=).*/)[0];
		if (returnState && returnState === state) {
			console.log("Token recieved!");
			window.localStorage.setItem("scriv2fic_token", token);
			setTokenDecay();
			authToken = token;
		} else if (returnState){
			console.error("State mismatch in authorization response!");
		} else {
			console.error("Authorization response was invalid!");
		}
	});

	waitForAuth(0);
}

/* Creates chapters and writes their contents to them. */
function makeChapter(chapterTitle, chapterBody) {

	/*handles errors returned in fetch responses. */
	function handleErrors(errorData) {
		console.error(errorData.code + ": " + errorData.title + ": " + errorData.detail);
		switch(errorData.code) {
			case 4040: //Resource unavailable
				notify("Error: 404! Fimfiction may be down. Try again later!", "error", true);
				break;
			case 4001: //Bad JSON
				notify(`Error: Invalid JSON! There's something about your chapter "${chapterTitle}" that we just didn't like. Please send an error report to user RB_ with your chapter's text and title.`, "error", true);
				break;
			case 4030: //Invalid permission (probably switched user)
				notify("Error: Invalid permissions! If you have switched to a different account, please go back to that account and delete the extra session from your session list before trying again.", "error", true);
				break;
			case 4032: //Invalid token
				console.log("Stored token has expired but not decayed. Fetching a new one.");
				authToken = null;
				getToken(()=>makeChapter(chapterTitle, chapterBody));
				break;
			case 4290: //Rate limited
				notify("Error: Rate limited! We made too many requests too quickly. Please try again later.", "error", true);
				break;
			case 5000: //Internal server error
				notify("Error: Internal Error! Something went wrong on Fimfiction's end. Try again, and if the problem persists, please contact user RB_.", "error", true);
				break;
			default:
				notify(`Error: Critical faliure! Something has gone horribly wrong. Please contact user RB_ and give him this: "${errorData.code}: ${errorData.detail}"`, "error", true);
		}
	}

	/* creates a chapter with a title of title, 
	then passes that title's id over to writeToChapter() */
	function createChapter(title) {	
		fetch(apiURL + "stories/"+storyID+"/chapters" + "?fields[chapter]", {
			method: "POST",
			headers: {
				"Authorization": "Bearer " + authToken,
			},
			body: `{"data": {"type": "chapter","attributes": {"title": "${title}"}}}`
		})
		.then(response => {
			response.json().then(respData=>{
				if (respData.errors) {
					handleErrors(respData.errors[0]);
				} else {
					requestNo++;
					setTimeout(()=>writeToChapter(respData.data.id), Math.pow(1.00936093670273, requestNo)+500);
				}
			});
		})
		.catch(error => {console.error(error);});
	}

	/* Writes contents to chapter by id, then queues up the next chapter to be made. */
	function writeToChapter(id) {	
		fetch(apiURL + "chapters/"+ id, {
			method: "PATCH",
			headers: {
				"Authorization": "Bearer " + authToken,
			},
			body: `{"data": {"type": "chapter","attributes": {"content": "${chapterBody}"}}}`
		})
		.then(response => {response.json().then(respData=>{
			if (respData.errors) {
				handleErrors(respData.errors[0]);
			} else {
				queueDown(); 
				console.log("Successfully created chapter " + id);
			}
		});})
		
		.catch(error => console.error(error));
	}

	const apiURL = "https://www.fimfiction.net/api/v2/";
	requestNo++;
	setTimeout(()=>createChapter(chapterTitle), Math.pow(1.00936093670273, requestNo)+500);
	console.log(chapterBody);
}

/* Creates a Chrome notification */
function notify(message, id, persist = false) {
	let notif = chrome.notifications.create(id, {
		"type": "basic",
		"title": "Scriv2Fic",
		"message": message,
		"iconUrl":"fimIcon.png",
		"requireInteraction": persist
	});	
	chrome.notifications.onClicked.addListener(() => window.open('https://www.fimfiction.net/story/'+storyID, '_blank'));
}

/* Unloads the chapter queue. */
function queueDown() {
	if (queue.length) {
		makeChapter(queue[0].title, queue[0].body);
		queue.shift();
	} else {
		notify("Mission success! Your story has been uploaded to Fimfiction.", "Completed");
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
	if (storedToken) {
		authToken = storedToken;
		console.log("Pulling token from storage");
		prepChapters();
	} else {
		getToken(prepChapters);
	}
}

/* Converter Todo:
-Size? How do we handle that if we don't know default? Average out the default first? Guess??
	-Also, don't forget: there are max and min values for size. 32 to 8, looks like. Not sure if that's in pt or not.
-Links (mail and http)
-Proper footnote/comment handling

*/

/* Converts RTF document strings into BBCode. */
function rtfToBBCode (rtfIn) {

	/* Converts RGB arrays ([R, G, B]) into hex colour values */
	function rgbToHex(rgbArray) {
		outStr = "#"
		rgbArray.forEach(val => {
			let hex = parseInt(val).toString(16);
			outStr += hex.length == 1 ? "0" + hex : hex;
		});
		return outStr;
	}

	const splitRTF = rtfIn.split("\\pgnstarts0", 2);

	let hexColourTable = [];
	splitRTF[0].match(/(?<={\\colortbl;).+(?=;})/)[0].split(";").forEach(pallet => {
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
				let curLvl = parseInt(rtfParagraphs[p].match(/(?<=\\ilvl)\d+/)[0])
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
			if (parseInt(rtfParagraphs[p].match(/(?<=\\ilvl)\d+/)[0]) > listLvl) {
				let listType = rtfParagraphs[p].match(/(?<={\\listtext\\f0\\fs22\\b0\\i0\s).(?=\.\s})/);
				if (listType) {
					paragraphString += "[list=" + listType[0]+ "]";
				} else {
					paragraphString += "[list]";
				}	
				listLvl += 1;
			}	
		}

		if (listLvl > -1) {
			paragraphString += "[*]";
		}

		const rtfGroups = rtfParagraphs[p].match(/(?<!\\){\\f.*?}+/g);	
		if (rtfGroups) {		
			for (let i=0;i<rtfGroups.length;i++) {
				const args = rtfGroups[i].substring(0,rtfGroups[i].indexOf(" "));
				let contents = rtfGroups[i].substring(rtfGroups[i].indexOf(" ")).slice(1).replace(/}$/gm,"");
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
					tableRef = parseInt(args.match(/(?<=\\cf)\d+/)[0]) - 1;
					groupString += "[color=" + hexColourTable[tableRef] + "]";
					nest.push("color");
				}
				
				//Replace all backslashes with an arbitrary unicode string: ⚐Ï⚑
				//RTF really likes backslashes. JSON, unfortunately, does not.
				//Doing this makes dealing with escaped characters a lot easier.
				contents = contents.replace(/\\/g, "⚐Ï⚑");

				/* -Unicode- */
				const unicodeChars = contents.match(/⚐Ï⚑u\d+⚐Ï⚑/g);
				if (unicodeChars) {
					contents = contents.replace(/⚐Ï⚑loch⚐Ï⚑af\d⚐Ï⚑hich⚐Ï⚑af\d⚐Ï⚑dbch⚐Ï⚑af\d⚐Ï⚑uc1|(?<=⚐Ï⚑u\d\d\d\d⚐Ï⚑)'\w\w/g, "");
					unicodeChars.forEach(uniCode => {
						contents = contents.replace(uniCode, String.fromCharCode(parseInt(uniCode.slice(4))));
					});
				}

				contents = contents.replace(/⚐Ï⚑hich⚐Ï⚑f\d ⚐Ï⚑emdash ⚐Ï⚑loch⚐Ï⚑f\d /g,"—");

				contents = contents.replace(/(?<!⚐Ï⚑)⚐Ï⚑tab /g, "\\t");
				contents = contents.replace(/(?<!⚐Ï⚑)⚐Ï⚑line /g, "\\n");			
				contents = contents.replace(/"/g, `\\"`);		

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

/* Listens for the content script (addService.js) to give it an xml document it can work on. */
chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
	    console.log(sender.tab ?
	                "from a content script:" + sender.tab.url :
	                "from the extension");
	    if (request.xmlString && request.storyID) {
	    	storyID = request.storyID;
		    convertCompile(request.xmlString, request.divider);
		    sendResponse({
		    	farewell: "<h1 style='font-size:2rem;font-weight:bold;'>Spike, take a letter!</h1>"
		    	+"<span style='font-weight:bold;'>Your document is now being processed into BBCode and sent to Fimfiction.</span><br><br>"
		    	+"This may take a little while, but don't worry! "
		    	+"You can safely navigate away from this page, and we'll alert you when we're done."
		    });
		}
	}
);