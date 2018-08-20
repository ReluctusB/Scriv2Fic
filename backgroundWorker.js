function getToken() {
	const reDirURL = chrome.identity.getRedirectURL();
	const clientID = "mGzeZKcuYZZtaOvOW361xC3qlHPnLriw";
	const rArray = new Uint32Array(8);
	const state = window.crypto.getRandomValues(rArray).join("");
	console.log("Getting token!");
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
			setTokenDecay()
			authToken = token;
		} else if (returnState){
			console.error("State mismatch in authorization response!");
		} else {
			console.error("Authorization response was not recieved or invalid!");
		}
	});	
}

async function setTokenDecay() {
	setTimeout(()=>window.localStorage.removeItem("scriv2fic_token"), 600000);
}

function makeChapter(chapterTitle, chapterBody) {

	function createChapter(title) {	
		fetch(apiURL + "stories/"+storyID+"/chapters" + "?fields[chapter]", {
			method: "POST",
			headers: {
				"Authorization": "Bearer " + authToken,
			},
			body: `{"data": {"type": "chapter","attributes": {"title": "${title}"}}}`
		})
		.then(response => {
			response.json().then(respData=>{console.log(respData);writeToChapter(respData.data.id);});
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
		.then(response => {response.json().then(respData=>{console.log(respData); queueDown(); console.log("Successfully created chapter " + id);})})
		.catch(error => console.error(error));
	}

	const apiURL = "https://www.fimfiction.net/api/v2/";
	createChapter(chapterTitle);
}

function queueDown() {
	if (queue.length) {
		makeChapter(queue[0].title, queue[0].body);
		queue.shift();
	} else {
		return;
	}
}

async function convertCompile(xmlString) {

	function waitForAuth() {
		if (authToken) {
			console.log("Authorization granted!");
			return;
		} else {
			console.log("Waiting for authorization");
			setTimeout(waitForAuth, 2000);
		}
	}

	function queueUp(chapterTitle, chapterBody, i) {
		queue.push({title:chapterTitle, body:chapterBody});
		if (queue.length === i) {
			queueDown();	
		}
	}
	
	const storedToken = window.localStorage.getItem("scriv2fic_token");
	if (storedToken) {
		authToken = storedToken;
		console.log("Pulling token from storage");
	} else {
		getToken();
		await waitForAuth();
	}

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
		}
		queueUp(chapterTitle, chapterBody, chapters.length);
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

				contents = contents.replace(/(?<!\\)\\tab /g, "		");
				contents = contents.replace(/(?<!\\)\\line /g, "\\n");
				contents = contents.replace(/\\hich\\f\d \\emdash \\loch\\f\d /g,"—");
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

let authToken = null;
let queue = [];
let storyID = 0;


chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
	    console.log(sender.tab ?
	                "from a content script:" + sender.tab.url :
	                "from the extension");
	    if (request.xmlString && request.storyID) {
	    	storyID = request.storyID;
		    convertCompile(request.xmlString);
		    sendResponse({farewell: "Document recieved!"});
		}
	}
);