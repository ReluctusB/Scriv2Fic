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

function findFileByName(fileName, fileList) {
	for (let i=0;i<fileList.length;i++) {
		if (fileList[i].name === fileName) {
			return fileList[i];
		}
	}
	console.log("Couldn't find file " + fileName);
	return null;
}

function addService() {
	if (document.getElementsByClassName("services")[0]) {
		document.querySelector("div[data-element='serviceSelector']").insertAdjacentHTML("afterBegin","<ul class='services'><li id='s2f'>Scriv2Fic (Local)</li></ul>");
		document.getElementById("s2f").addEventListener("click", buildUI);
	} else {
		setTimeout(addService,500);
	}
}

function processFiles(fileList) {
	const scrivx = findScrivx(fileList);
	document.getElementById("scrivTitle").innerHTML = "";
	document.getElementById("scrivDir").innerHTML = "";
	buildDirectory(scrivx);
	document.getElementById("submitScriv").disabled = false;
	document.getElementById("submitScriv").addEventListener("click", ()=>{prepSubmit(scrivx, 0);});

}

function findScrivx(fileList) {
	for (let i=0;i<fileList.length;i++) {
		if (fileList[i].name.endsWith(".scrivx")) {
			return fileList[i];
		}
	}
	window.alert("Couldn't find a .scrivx file!");
	return;
}

function generateListing(file, level) {
	let titleEle = file.getElementsByTagName("Title")[0].childNodes[0];
	const title = titleEle ? titleEle.nodeValue : "Untitled";
	const ident = file.getAttribute("Type") != "Folder" ? file.getAttribute("ID") : "Folder";
	let icon = "file-text";
	let include = file.getElementsByTagName("IncludeInCompile")[0] ? true : false;
	if (file.getAttribute("Type").endsWith("Folder")) {icon = "folder";}
	let listString = `<span class='checkbox' style="margin-left: ${level.toString()}rem">
						<label class='styled-checkbox'>
							<input type='checkbox' class='compileIncludeBox' value = ${ident+"-"+level+"-"+title.replace(/ /g,"_")} ${include?"checked":""}>
							<a></a>
						</label>
					</span> <i class="fa fa-${icon}" style="margin-right:.5rem"></i> ${level>0?title:"<b>"+title+"</b>"}`;
	return eleBuilder("LI",{HTML:listString});
}

function buildHierarchy(fileList, level) {
	for (let i=0;i<fileList.length;i++) {
		document.getElementById("scrivDir").appendChild(generateListing(fileList[i], level));
		let kids = fileList[i].getElementsByTagName("Children")[0];
		if (kids) {buildHierarchy(kids.children, level + 1);}		
	}
}

function buildDirectory(scrivx) {
	const reader = new FileReader();
	reader.readAsText(scrivx, "UTF-8");
	reader.onload = function (evt) {
		const scrivxContents = evt.target.result;
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(scrivxContents, "text/xml");
		document.getElementById("scrivTitle").innerText = scrivx.name.replace(".scrivx","");
		const topLevelFiles = xmlDoc.querySelectorAll("Binder > BinderItem[Type=DraftFolder]");
		buildHierarchy(topLevelFiles, 0);
	};
}

const stringUI = `
	<div class='search-bar'>
		<div class="flex" style="margin-bottom:0.5rem;"></div>
		<div class='styled-input'></div>
	</div>
	<div id="scrivTitle" style="font-weight:bold; font-size:1.1rem;"></div>
	<div class="files-container" style=overflow:auto;">
		<ul class="files" id="scrivDir"></ul>
	</div>
	<div class="footer-bar">
		<button class="styled_button" disabled="false" id="submitScriv">Import Project</button>
	</div>
	`;

function goBack() {
	document.querySelector("div[data-element='serviceSelector']").className = "";	
	document.getElementById("scrivSelector").className = "hidden";
	document.querySelector(".drop-down-pop-up h1 > span").innerText = "Select a Service";
}

function buildUI() {
	const importPopup = document.getElementsByClassName("import-files-popup")[0];
	if (!document.getElementById("scrivSelector")) {
		const scrivSelector = eleBuilder("DIV", {HTML:stringUI, id:"scrivSelector"});
		scrivSelector.innerHTML = stringUI;
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

//ID, level, title

function prepSubmit(scrivx, chapterLevel) {

	function waitForProcess() {
		if (startedOperations === finishedOperations && startedOperations + finishedOperations !== 0) {
			var serializer = new XMLSerializer();
			submitToWorker(serializer.serializeToString(outputXML));
		} else {
			setTimeout(waitForProcess,1000);
		}
	}
	let outputXML = document.implementation.createDocument(null, "Story");
	const includeBoxes = document.getElementsByClassName("compileIncludeBox");
	let curChapterNode = null;
	let startedOperations = 0, finishedOperations = 0;
	for (let i=0;i<includeBoxes.length;i++) {
		if (includeBoxes[i].checked) {
			let valArr = includeBoxes[i].value.split("-");
			if (valArr[1] == chapterLevel) {
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

function getStoryId() {
	return window.location.pathname.match(/(?<=\/story\/)\d*/)[0];
}

function submitToWorker(compiledXML) {
	chrome.runtime.sendMessage({xmlString:compiledXML, storyID:getStoryId()}, function(response) {
		console.log(response.farewell);
	}); 

}

let files;

if (document.getElementsByClassName("fa-upload")[0]) {
	document.querySelector("a[data-click='importChapter']").addEventListener("click", addService);
}