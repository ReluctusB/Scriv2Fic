function eleBuilder(eleStr, propObj) {
    const ele = document.createElement(eleStr);
    if (propObj.class) {ele.className = propObj.class;}
    if (propObj.HTML) {ele.innerHTML = propObj.HTML;}
    if (propObj.text) {ele.innerText = propObj.text;}
    if (propObj.id) {ele.id = propObj.id;}
    if (propObj.type) {ele.type = propObj.type;}
    if (propObj.event) {ele.addEventListener(propObj.event[0], propObj.event[1], false);}
    return ele;
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
	buildDirectory(scrivx);
}

function findScrivx(fileList) {
	for (let i=0;i<fileList.length;i++) {
		if (fileList[i].name.endsWith(".scrivx")) {
			return fileList[i];
		}
	}
	console.log("Couldn't find a scrivx file!");
}

function getDraft(binder) {
	binderItems = binder.getElementsByTagName("BinderItem");
	for (let i=0;i<binderItems.length;i++) {
		if (binderItems[i].getAttribute("type") === "DraftFolder") {
			return binderItems[i];
		}
	}
	console.log("No draft found!");
}

function buildDirectory(scrivx) {
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(scrivx.contents, "application/xml");
	console.log(xmlDoc.documentElement.nodeName);
	const draft = getDraft(xmlDoc.documentElement.getElementsByTagName("binder")[0]);
	console.log(draft.getElementsByTagName("Title")[0].contents);
}

const stringUI = `
	<div class='search-bar'>
		<div class="flex" style="margin-bottom:0.5rem;">
	        <a style="margin-right: 0.5rem;"><i class='fa fa-arrow-left'></i></a>
	        <span data-element="selectedService">Scriv2Fic</span>
	    </div>
	</div>
	<div class='styled-input'></div>
	`

function buildUI() {
	console.log("hello?");
	const fileSelector = document.querySelector("div[data-element='fileSelector']");
	fileSelector.innerHTML = stringUI;
	const fileInput = eleBuilder("INPUT",{id:"scrivDrop", type:"file"});
	fileInput.webkitdirectory = "true";
	fileInput.accept = ".scriv";
	fileInput.addEventListener("input",()=>{files=fileInput.files;processFiles(files);})
	fileSelector.getElementsByClassName("styled-input")[0].append(fileInput);
	
	fileSelector.className = "";
	document.querySelector("div[data-element='serviceSelector']").className = "hidden";	
}

var files;

if (document.getElementsByClassName("fa-upload")[0]) {
	document.querySelector("a[data-click='importChapter']").addEventListener("click", addService);
}
