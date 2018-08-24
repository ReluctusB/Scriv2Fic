/* --Globals-- */
let authToken = null;
let queue = [];
let storyID = 0;
let requestNo = 0;

function getToken(callback) {

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

	function setTokenDecay() {
		setTimeout(()=>window.localStorage.removeItem("scriv2fic_token"), 600000);
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

function makeChapter(chapterTitle, chapterBody) {

	function handleErrors(errorData) {
		console.error(errorData.code + ": " + errorData.title + ":\nDetails: " + errorData.detail);
		switch(errorData.code) {
			case 4040: //Resource unavailable
				notify("Error: 404! Fimfiction may be down. Try again later!", "error", true);
				break;
			case 4001: //Bad JSON
				notify(`Error: Invalid JSON! There's something about your chapter (${chapterTitle}) that we just didn't like. Please send an error report to user RB_ with your chapter's text and title.`, "error", true);
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
				notify("Error: Rate limited! We made too many requests too quickly. This shouldn't happen, so please contact user RB_.", "error", true);
				break;
			case 5000: //Internal server error
				notify("Error: Internal Error! Something went wrong on Fimfiction's end. Try again, and if the problem persists, please contact user RB_.", "error", true);
				break;
			default:
				notify(`Error: Critical faliure! Something has gone horribly wrong. Please contact user RB_ and give him this: "${errorData.code}: ${errorData.detail}"`, "error", true);
		}
	}

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
					setTimeout(()=>writeToChapter(respData.data.id), Math.pow(1.00910841119455, requestNo));
				}
			});
		})
		.catch(error => {console.error(error);});
	}

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
	setTimeout(()=>createChapter(chapterTitle), Math.pow(1.00910841119455, requestNo));
	//console.log(chapterBody);
}

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

function queueDown() {
	if (queue.length) {
		makeChapter(queue[0].title, queue[0].body);
		queue.shift();
	} else {
		notify("Mission success! Your story has been uploaded to Fimfiction.", "Completed");
		return;
	}
}

function convertCompile(xmlString, dividerString) {

	function queueUp(chapterTitle, chapterBody, i) {
		queue.push({title:chapterTitle, body:chapterBody});
		if (queue.length === i) {
			queueDown();	
		}
	}

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
-Colour (have to get colour table first)
-Size? How do we handle that if we don't know default? Average out the default first? Guess??
	-Also, don't forget: there are max and min values for size. 32 to 8, looks like. Not sure if that's in pt or not.
-Lists
-Links (mail and http)
-Proper footnote/comment handling

*/
function rtfToBBCode (rtfIn) {
	/* Table processing will go here eventually*/

	const splitRTF = rtfIn.split("\\pgnstarts0", 2);

	let outputString = "";
	const rtfParagraphs = splitRTF[1].match(/\\par.*$/gm);

	let alignment = "left";
	let nest = [];
	for (let p=0;p<rtfParagraphs.length;p++) {
		let paragraphString = "\\n\\n";

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
				
				/* -Unicode- */
				const unicodeChars = contents.match(/\\u\d+\\/g);
				if (unicodeChars) {
					contents = contents.replace(/\\loch\\af\d\\hich\\af\d\\dbch\\af\d\\uc1|(?<=\\u\d\d\d\d\\)'\w\w/g, "");
					unicodeChars.forEach(uniCode => {
						contents = contents.replace(uniCode, String.fromCharCode(parseInt(uniCode.slice(2))));
					});
				}

				contents = contents.replace(/\\hich\\f\d \\emdash \\loch\\f\d /g,"—");
				contents = contents.replace(/(?<!\\)\\tab /g, "\\t");
				contents = contents.replace(/(?<!\\)\\line /g, "\\n");

				// Make me ignore escape chars!
				contents = contents.replace(/\\(\\\\)*/g, `\\\\`);

				contents = contents.replace(/"/g, `\\"`);				

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
	    	storyID = request.storyID;
		    convertCompile(request.xmlString, request.divider);
		    sendResponse({farewell: "Document recieved!"});
		}
	}
);