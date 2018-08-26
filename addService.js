/* --Globals-- */
let files;
let lowLevel = 0;

/* Builds HTML elements according to a properties object (propObj) */
function eleBuilder(eleStr, propObj) {
    const ele = document.createElement(eleStr);
    if (propObj.class) {ele.className = propObj.class;}
    if (propObj.HTML) {ele.innerHTML = propObj.HTML;}
    if (propObj.text) {ele.innerText = propObj.text;}
    if (propObj.id) {ele.id = propObj.id;}
    if (propObj.type) {ele.type = propObj.type;}
    if (propObj.value) {ele.value = propObj.value;}
    if (propObj.style) {ele.style = propObj.style;}
    if (propObj.event) {ele.addEventListener(propObj.event[0], propObj.event[1], false);}
    return ele;
}

/* Finds a file from a filelist by name. If none found, returns null. */
function findFileByName(fileName, fileList) {
	for (let i=0;i<fileList.length;i++) {
		if (fileList[i].name === fileName) {
			return fileList[i];
		}
	}
	console.log("Couldn't find file " + fileName);
	return null;
}

/* Adds the Scriv2Fic service to the Import Chapters services list. */
function addService() {
	if (document.getElementsByClassName("services")[0]) {
		document.querySelector("div[data-element='serviceSelector'] > main").insertAdjacentHTML("afterBegin","<ul class='services' style='flex:0;-webkit-flex:0;'><li id='s2f'>Scriv2Fic (Local)</li></ul>");
		document.getElementById("s2f").addEventListener("click", buildUI);
	} else {
		setTimeout(addService,500);
	}
}

/* Handles processing an incoming filelist */
function processFiles(fileList) {
	const scrivx = findScrivx(fileList);
	document.getElementById("scrivTitle").innerHTML = "";
	document.getElementById("scrivDir").innerHTML = "";
	buildDirectory(scrivx);
	document.getElementById("submitScriv").disabled = false;
	document.getElementById("submitScriv").addEventListener("click", ()=>{
		prepSubmit(scrivx, parseInt(document.getElementById("breakSelector").value));
	});

}

/* Finds a .scrivx file from a filelist */
function findScrivx(fileList) {
	for (let i=0;i<fileList.length;i++) {
		if (fileList[i].name.endsWith(".scrivx")) {
			return fileList[i];
		}
	}
	window.alert("Couldn't find a .scrivx file!");
	return;
}

/* Sets the options for the "Break on chapter level" selector. */
function setLevelSelector() {
	for (let i=0;i<=lowLevel;i++) {
		document.getElementById("breakSelector").innerHTML += `<option value="${i}"">${i}</option>`
	}
}

/* Builds a collapisble filetree element by element based on a filelist */
function buildHierarchy(fileList, level) {

	function generateListing(file, level) {
		let titleEle = file.getElementsByTagName("Title")[0].childNodes[0];
		if (titleEle) {
			title = titleEle.nodeValue;
		} else {
			title = "Untitled-" + untitledNo;
			untitledNo++;
		}
		const ident = file.getAttribute("Type") != "Folder" ? file.getAttribute("ID") : "Folder";
		let icon = "file-text";
		let hierDisplay = level > 1 ? "none" : "flex";
		let include = file.getElementsByTagName("IncludeInCompile")[0] ? true : false;
		let hasChildren = ""
		if (file.getElementsByTagName("Children")[0]) {
			if (level !== 0) {
				hasChildren = "<i class='fa fa-angle-right' style='margin-left:1rem;font-size:1.3rem;'></i>"
			} else {
				hasChildren = "<i class='fa fa-angle-down' style='margin-left:1rem;font-size:1.3rem;'></i>"
			}
		}
		if (file.getAttribute("Type").endsWith("Folder")) {icon = "folder";}
		let listString = `<span class='checkbox' style="margin-left: ${(level*2).toString()}rem">
							<label class='styled-checkbox'>
								<input type='checkbox' class='compileIncludeBox' value = ${ident+"|"+level+"|"+title.replace(/ /g,"_")} ${include?"checked":""}>
								<a></a>
							</label>
						</span> <i class="fa fa-${icon}" style="margin-right:.5rem"></i> ${title}<b>${hasChildren}</b>`;
		return eleBuilder("LI",{HTML:listString, class:title, value:level, style:"display:"+hierDisplay});
	}

	if (level > lowLevel) {lowLevel = level;}
	let untitledNo = 1;
	for (let i=0;i<fileList.length;i++) {
		const listing = generateListing(fileList[i], level);
		listing.addEventListener("click", function() {showHideChildren(this);});
		document.getElementById("scrivDir").appendChild(listing);
		let kids = fileList[i].getElementsByTagName("Children")[0];
		if (kids) {buildHierarchy(kids.children, level + 1);}		
	}
}

/* Processes a scrivx file and generates a directory of documents, 
which is then built by buildHierarchy() */
function buildDirectory(scrivx) {
	document.getElementById("breakSelector").innerHTML = 0;
	const reader = new FileReader();
	reader.readAsText(scrivx, "UTF-8");
	reader.onload = function (evt) {
		const scrivxContents = evt.target.result;
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(scrivxContents, "text/xml");
		document.getElementById("scrivTitle").innerText = scrivx.name.replace(".scrivx","");
		const topLevelFiles = xmlDoc.querySelectorAll("Binder > BinderItem[Type=DraftFolder]");
		buildHierarchy(topLevelFiles, 0);
		const includeBoxes = document.getElementsByClassName("compileIncludeBox");
		for (let i=0;i<includeBoxes.length;i++) {includeBoxes[i].addEventListener("change", function() {checkChildren(this);});}
		setLevelSelector();
	};
}

/* Selects or deselects all children of a file (me) 
in the file tree to be included in the compile */
function checkChildren(me) {
	const includeBoxes = document.getElementsByClassName("compileIncludeBox");
	const thisBox = me.value.split("|");
	const thisIndex = [...includeBoxes].indexOf(me);
	for (let i=thisIndex+1;i<includeBoxes.length;i++) {
		if (parseInt(includeBoxes[i].value.split("|")[1]) > parseInt(thisBox[1])) {
			includeBoxes[i].checked = me.checked;
		} else {
			return;
		}
	}
}

/* Shows or hides all children of a file (me) in the file tree */
function showHideChildren(me) {
	const fileItems = document.querySelectorAll("#scrivDir > li");
	const thisLevel = parseInt(me.value);
	const thisIndex = [...fileItems].indexOf(me);
	const dropIcon = me.getElementsByTagName("I")[1];
	if (dropIcon){
		if (dropIcon.className === "fa fa-angle-right") {
			dropIcon.className = "fa fa-angle-down";
		} else {
			dropIcon.className = "fa fa-angle-right";
		}
	}
	for (let i=thisIndex+1;i<fileItems.length;i++) {
		if (parseInt(fileItems[i].value) > thisLevel) {
			if (fileItems[i].style.display !== "none") {
				fileItems[i].style.display = "none";
			} else if (fileItems[i].style.display === "none" && parseInt(fileItems[i].value) === thisLevel + 1){
				fileItems[i].style.display = "flex";
			}		
		} else {
			return;
		}
	}
}

/* goes back to the Services list */
function goBack() {
	document.querySelector("div[data-element='serviceSelector']").className = "";	
	document.getElementById("scrivSelector").className = "hidden";
	document.querySelector(".drop-down-pop-up h1 > span").innerText = "Select a Service";
}

/* Builds the Scriv2Fic UI. */
function buildUI() {
	const importPopup = document.getElementsByClassName("import-files-popup")[0];
	if (!document.getElementById("scrivSelector")) {
		const stringUI = `
			<main>
				<div class='search-bar'>
					<div class="flex" style="margin-bottom:0.5rem;"></div>
					<div class='styled-input'></div>
					<div id="scrivTitle" style="font-weight:bold; padding:.5rem 0 0 0;"></div>
				</div>	
				<div class="files-container" style=overflow:auto;">
					<ul class="files" id="scrivDir"></ul>
				</div>
				<div class="footer-bar styled-input">
					<label for="breakSelector">Divide chapters on level: </label>
					<select id="breakSelector" style="height: 1.5rem;padding: 0;min-width: 2.5rem;margin-left: .2rem;flex:0;webkit-flex:0;">
					</select>
				</div>
				<div class="footer-bar styled-input">
					<label for="dividerDatalist">Divide adjacent documents using: </label>
					<input list="dividerDatalist" id="dividerInput" value="[hr]" style="height: 1.5rem;padding: 0 0 0 5px;min-width: 10rem;margin-left: .2rem;flex:0;webkit-flex:0;">
					<datalist id="dividerDatalist">
						<option value="[hr]">
						<option value="\\n">
					</datalist>
				</div>
				<div class="footer-bar">
					<button class="styled_button" disabled="false" id="submitScriv">Import Project</button>
				</div>
			</main>`;
		const scrivSelector = eleBuilder("DIV", {HTML:stringUI, id:"scrivSelector"});
		const fileInput = eleBuilder("INPUT",{id:"scrivDrop", type:"file"});
		fileInput.webkitdirectory = "true";
		fileInput.accept = ".scriv";
		fileInput.addEventListener("input",()=>{files=fileInput.files;processFiles(files);});
		scrivSelector.getElementsByClassName("styled-input")[0].append(fileInput);
		const backButton = eleBuilder("A",{HTML:"<i class='fa fa-arrow-left'></i>", event:["click", goBack]});
		backButton.style.marginRight = "0.5rem";
		scrivSelector.getElementsByClassName("flex")[0].appendChild(backButton);
		scrivSelector.getElementsByClassName("flex")[0].appendChild(eleBuilder("SPAN",{text:"Scriv2Fic"}));
		importPopup.appendChild(scrivSelector);
	}	
	document.querySelector(".drop-down-pop-up h1 > span").innerText = "Select a Project Folder";
	document.querySelector("div[data-element='fileSelector']").className = "hidden";
	document.querySelector("div[data-element='serviceSelector']").className = "hidden";	
	document.getElementById("scrivSelector").className = "";
}

//[ID, level, title]

/* Generates an ordered XML document of chapters and scrivenings 
to be passed to the background script. */
function prepSubmit(scrivx, chapterLevel) {

	/* Waits for all documents to have been processed, then serializes and submits the 
	completed XML document to the background script via submitToWorker() */
	function waitForProcess() {
		if (startedOperations === finishedOperations && startedOperations + finishedOperations !== 0) {
			var serializer = new XMLSerializer();
			submitToWorker(serializer.serializeToString(outputXML));
		} else {
			setTimeout(waitForProcess,1000);
		}
	}

	processingUI();
	let outputXML = document.implementation.createDocument(null, "Story");
	const includeBoxes = document.getElementsByClassName("compileIncludeBox");
	let curChapterNode = null;
	let startedOperations = 0, finishedOperations = 0;
	let chapterNo = 0
	for (let i=0;i<includeBoxes.length;i++) {
		if (includeBoxes[i].checked) {
			let valArr = includeBoxes[i].value.split("|");
			if (valArr[1] == chapterLevel) {
				chapterNo++;
				if (chapterNo > 1000) {
					window.alert("Fimfiction does not allow more than 1000 chapters on a story. Check that you have the correct level selected.");
					return;
				}
				curChapterNode = outputXML.createElement("Chapter");
				curChapterNode.setAttribute("Title",valArr[2]);
				outputXML.firstChild.appendChild(curChapterNode);				
			}
			if (curChapterNode) {
				if (valArr[0] === "Folder") {continue;}
				let scrivening = outputXML.createElement("Scrivening");
				scrivening.setAttribute("ID", valArr[0]);
				curChapterNode.appendChild(scrivening);
				const reader = new FileReader();
				reader.onloadstart = () => {startedOperations++;};
				reader.onload = () => {
					const target = [...outputXML.getElementsByTagName("Scrivening")].filter(function(scriv) {
						return scriv.getAttribute("ID") === valArr[0];
					});
					target[0].appendChild(outputXML.createTextNode(reader.result));
					finishedOperations++;
				};
				const foundFile = findFileByName(valArr[0] + ".rtf", files);
				if (foundFile !== null) {
					reader.readAsText(foundFile);
				} else {
					curChapterNode.removeChild(scrivening);
				}
			}
		}
	}
	waitForProcess();
}

/* Gets the story's story ID from the page URL. */
function getStoryId() {
	return window.location.pathname.match(/(?<=\/story\/)\d*/)[0];
}

/* changes the UI to a 'processing' state. */
function processingUI() {
	const submitButton = document.getElementById("submitScriv");
	submitButton.disabled = true;
	submitButton.innerText = "Processing...";
}

/* Displays a message in the UI area. */
function displayMessage(message) {
	dispArea = document.querySelector("#scrivSelector > main");
	dispStr = `
	<main style="display:flex;justify-content:center;align-items:center;">
			<div style="text-align:center;padding:5%;">${message}</div>
	</main>
	`
	dispArea.innerHTML = dispStr;
}

/* Submits an XML document to the background script, 
then displays the response via displayMessage. */
function submitToWorker(compiledXML) {
	chrome.runtime.sendMessage({
		xmlString:compiledXML, 
		storyID:getStoryId(), 
		divider: document.getElementById("dividerInput").value
	}, function(response) {
		displayMessage(response.farewell);
	}); 
}

if (document.getElementsByClassName("fa-upload")[0]) {
	document.querySelector("a[data-click='importChapter']").addEventListener("click", addService);
}