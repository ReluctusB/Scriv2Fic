//Design inspired by: https://github.com/iarna/rtf-parser

class RTFObj {
	constructor(parent) {
		this.parent = parent;
		this.style = {};
		this.attributes = {};
		this.contents = [];
		this.type = "";
	}
}

class RTFDoc extends RTFObj {
	constructor(parent) {
		super(null);
		this.colourTable = [];
		this.fontTable = [];
		this.listTable = [];
		this.listOverrideTable = [];
		this.type = "Document";
	}
	dumpContents() {
		return {
			colourtable: this.colourTable,
			fonttable: this.fontTable,
			listtable: this.listTable,
			listoverridetable: this.listOverrideTable,
			style: this.style,
			contents: this.contents
		};
	}
}

class RTFGroup extends RTFObj {
	constructor(parent, type) {
		super(parent);
		this.type = type;
	}
	dumpContents() {
		if (this.contents.length === 1 && typeof this.contents[0] === "string") {
			this.contents = this.contents[0];
			if (this.type === "span") {this.type = "text";}
		}
		this.parent.contents.push({
			contents: this.contents,
			style: JSON.parse(JSON.stringify(this.style)),
			attributes: this.attributes,
			type: this.type
		});
	}
}

class parameterGroup extends RTFObj {
	constructor (parent, parameter) {
		super(parent);
		this.param = parameter;
	}
	dumpContents() {
		if (this.contents[0]) {
			this.parent.attributes[this.param] = this.contents[0].replace(";","");
		}		
	}
}

class DocTable {
	constructor(doc) {
		this.doc = doc;
		this.table = [];
	}
}

class ColourTable extends DocTable {
	constructor(doc) {
		super(doc);
		this.rgb = {};
	}
	addColour(colour, value) {
		this.rgb[colour] = value;
		if (Object.keys(this.rgb).length === 3) {
			this.table.push(this.rgb);
			this.rgb = {};
		}
	}
	dumpContents() {
		this.doc.colourTable = this.table;
	}
}

class FontTable extends DocTable {
	constructor(doc) {
		super(doc);
	}
	dumpContents() {
		this.doc.fontTable = this.table;
	}
}

class Font extends RTFObj{
	constructor(parent) {
		super(parent);
	}
	dumpContents() {
		this.parent.table.push({
			fontname: this.contents[0].replace(";",""),
			attributes: this.attributes
		});
	}
}

class ListTable extends DocTable {
	constructor(doc) {
		super(doc);
	}
	dumpContents() {
		this.doc.listTable = this.table;
	}
}

class List extends RTFObj {
	constructor (parent) {
		super(parent);
		this.templateid = null;
		this.id = null;
	}
	dumpContents() {
		this.parent.table.push({
			templateid: this.templateid,
			id: this.id,
			levels: this.contents,
			attributes: this.attributes,
		});
	}
}

class ListLevel extends RTFObj{
	constructor (parent) {
		super(parent);
	}
	dumpContents() {
		this.parent.contents.push({
			style:this.style,
			attributes: this.attributes,
		});
	}
}

class ListOverrideTable extends DocTable {
	constructor(doc) {
		super(doc);
	}
	dumpContents() {
		this.doc.listOverrideTable = this.table;
	}
}

class ListOverride extends RTFObj {
	constructor(parent) {
		super(parent);
		this.id = null;
		this.ls = null;
	}
	dumpContents() {
		this.parent.table.push({
			attributes: this.attributes,
			id: this.id,
			ls: this.ls
		});
	}
}

class SmallRTFRibosomalSubunit {
	constructor() {
		this.rtfString = "";
		this.curInstruction = {type: "", value: ""};
		this.curChar = "";
		this.curIndex = 0;
		this.output = [];
		this.operation = this.parseText;
		this.working = false;
	}
	spool(rtfStringIn) {
		this.working = true;
		this.rtfString = rtfStringIn;
		this.curIndex = 0;
		this.operation = this.parseText;
		this.curChar = this.rtfString.charAt(0);
		this.curInstruction = {type: "", value: ""};		
		while (this.working === true){
			this.operation(this.curChar);
			this.advancePos();
		}
	}
	advancePos() {
		this.curIndex++;
		if (this.curIndex < this.rtfString.length) {
			this.curChar = this.rtfString.charAt(this.curIndex);
		} else {
			this.working = false;
		}
	}
	parseText(char) {
		switch(char) {
			case "\\": 
				this.operation = this.parseEscape;
				break;
			case "{": 
				this.setInstruction();
				this.setInstruction({type:"groupStart"});
				break;
			case "}": 
				this.setInstruction();
				this.setInstruction({type:"groupEnd"});
				break;
			case "\n": 
				this.setInstruction();
				this.setInstruction({type:"break"});
				break;
			default: 
				this.curInstruction.type = "text";
				this.curInstruction.value += char;
		}
	}
	parseEscape(char) {
		if (char.search(/[ \\{}\n]/) === -1) {
			this.setInstruction();
			this.operation = this.parseControl;
			this.parseControl(char);
		} else {
			this.operation = this.parseText;
			this.parseText(char);
		}
	}
	parseControl(char) {
		if (char.search(/[ \\{}\t'\n;]/) === -1) {
			this.curInstruction.type = "control";
			this.curInstruction.value += char;
		} else if (char === "'") {
			this.operation = this.parseHex;
			this.curInstruction.type = "control";
			this.curInstruction.value += char;
		} else if (char === " " || char === ";") {
			this.setInstruction();
			this.operation = this.parseText;
		} else {
			this.setInstruction();
			this.operation = this.parseText;
			this.parseText(char);
		}
	}
	parseHex(char) {
		if (this.curInstruction.value.length >= 3) {
			this.setInstruction();
			this.operation = this.parseText;
			this.parseText(char);
		} else {
			this.curInstruction.value += char;
		}
	}
	setInstruction(instruction = this.curInstruction) {
		if (instruction.type !== "") {
			this.output.push(instruction);
			this.curInstruction = {type: "", value: ""};
		}
	}
}

class LargeRTFRibosomalSubunit {
	constructor() {
		this.instructions = [];
		this.curInstruction = {};
		this.output = {};
		this.curState = {};
		this.curIndex = 0;
		this.defState = {font:0,fontsize:22,bold:false,italics:false};
		this.doc = new RTFDoc;
		this.curGroup = this.doc;
		this.working = false;
	}
	synthesize(rtfInstructions) {
		this.instructions = rtfInstructions;
		this.output = {};
		this.curState = {};
		this.curIndex = 0;
		this.defState = {font:0,fontsize:22,bold:false,italics:false};
		this.doc = new RTFDoc;
		this.curGroup = this.doc;
		this.working = true;
		while (this.working === true) {
			this.followInstruction(this.curInstruction);
			this.advancePos();
		}
		this.output = this.doc.dumpContents();
	}
	advancePos() {
		this.curIndex++;
		if (this.curIndex < this.instructions.length) {
			this.curInstruction = this.instructions[this.curIndex];
		} else {
			this.working = false;
		}
	}
	followInstruction(instruction) {
		switch(instruction.type) {
			case "control":
				this.parseControl(instruction.value);
				break;
			case "text":
				this.curGroup.contents.push(instruction.value);
				break;
			case "groupStart":
				this.newGroup("span");
				break;
			case "groupEnd":
				this.endGroup();
				break;
			case "break":
				break;
		}
	}
	parseControl(instruction) {
		const numPos = instruction.search(/\d/);
		let val = null;
		if (numPos !== -1) {
			val = parseInt(instruction.substr(numPos));
			instruction = instruction.substr(0,numPos);
		}
		const command = "cmd$" + instruction;
		if (this[command]) {
			this[command](val);
		}
	}
	newGroup(type) {
		this.curGroup = new RTFGroup(this.curGroup, type);
		this.curGroup.style = this.getStyle(this.curGroup.parent);
	}
	endGroup() {
		this.curGroup.dumpContents();
		if (this.curGroup.parent) {
			this.curGroup = this.curGroup.parent;
		} else {
			this.curGroup = this.doc;
		}
	}
	setStyle(style) {
		this.curGroup.style = style;
		this.curState = style;
	}
	getStyle(group) {
		if (group.style) {
			return JSON.parse(JSON.stringify(group.style));
		} else {
			return this.defState;
		}	
	}

	cmd$par() {
		if (this.curGroup.type === "paragraph") {
			const prevStyle = this.getStyle(this.curGroup);
			this.endGroup()
			this.newGroup("paragraph");
			this.setStyle(prevStyle);
		} else {
			this.newGroup("paragraph");
		}	
	}
	cmd$pard() {
		if (this.curGroup.type === "paragraph") {
			this.setStyle(this.defState);
		} else {
			this.newGroup("paragraph");
			this.setStyle(this.defState);
		}
	}
	cmd$plain() {
		this.setStyle(this.defState);
	}

	cmd$qc() {
		this.curGroup.style.align = "center";
	}
	cmd$qj() {
		this.curGroup.style.align = "justify";
	}
	cmd$qr() {
		this.curGroup.style.align = "right";
	}
	cmd$ql() {
		this.curGroup.style.align = "left";
	}

	cmd$i(val) {
		this.curGroup.style.italics = val !== 0;
	}
	cmd$b(val) {
		this.curGroup.style.bold = val !== 0;
	}
	cmd$strike(val) {
		this.curGroup.style.strikethrough = val !== 0;
	}
	cmd$scaps(val) {
		this.curGroup.style.smallcaps = val !== 0;
	}
	cmd$ul(val) {
		this.curGroup.style.underline = val !== 0;
	}
	cmd$ulnone(val) {
		this.curGroup.style.underline = false;
	}

	cmd$ilvl(val) {
		this.curGroup.style.ilvl = val;
	}
	cmd$listtext(val) {
		this.curGroup.type = "listtext";
	}

	cmd$f(val) {
		if (this.curGroup.parent instanceof RTFObj) {
			this.curGroup.style.font = val;
		} else if (this.curGroup.parent instanceof FontTable) {
			this.curGroup = new Font(this.curGroup.parent);
			this.curGroup.attributes.font = val;
		}
		
	}
	cmd$fs(val) {
		this.curGroup.style.fontsize = val;
	}

	cmd$fonttbl() {
		this.curGroup = new FontTable(this.doc);
	}
	cmd$fcharset(val) {
		this.curGroup.attributes.charset = val;
	}
	cmd$fprq(val) {
		this.curGroup.attributes.pitch = val;
	}
	cmd$fbias(val) {
		this.curGroup.attributes.bias = val;
	}
	cmd$fnil() {
		this.curGroup.attributes.family = "nil";
	}
	cmd$froman() {
		this.curGroup.attributes.family = "roman";
	}
	cmd$fswiss() {
		this.curGroup.attributes.family = "swiss";
	}
	cmd$fmodern() {
		this.curGroup.attributes.family = "modern";
	}
	cmd$fscript() {
		this.curGroup.attributes.family = "script";
	}
	cmd$fdecor() {
		this.curGroup.attributes.family = "decor";
	}
	cmd$ftech() {
		this.curGroup.attributes.family = "tech";
	}
	cmd$fbidi() {
		this.curGroup.attributes.family = "bidi";
	}

	cmd$colortbl() {
		this.curGroup = new ColourTable(this.doc);
	}
	cmd$red(val) {
		if (this.curGroup instanceof ColourTable) {
			this.curGroup.addColour("red", val);
		}
	}
	cmd$blue(val) {
		if (this.curGroup instanceof ColourTable) {
			this.curGroup.addColour("blue", val);
		}
	}
	cmd$green(val) {
		if (this.curGroup instanceof ColourTable) {
			this.curGroup.addColour("green", val);
		}
	}

	cmd$listtable() {
		this.curGroup = new ListTable(this.doc);
	}

	cmd$list() {
		this.curGroup = new List(this.curGroup.parent);
	}
	cmd$listid(val) {
		this.curGroup.id = val;
	}
	cmd$listtemplateid(val) {
		this.curGroup.templateid = val;
	}
	cmd$listsimple(val) {
		this.curGroup.attributes.simple = val;
	}
	cmd$listhybrid(val) {
		this.curGroup.attributes.hybrid = true;
	}
	cmd$listname() {
		this.curGroup = new parameterGroup(this.curGroup.parent, "listname");
	}
	cmd$liststyleid(val) {
		this.curGroup.attributes.styleid = val;
	}
	cmd$liststylename(val) {
		this.curGroup.attributes.stylename = val;
	}
	cmd$liststartat(val) {
		this.curGroup.attributes.startat = val;
	}
	cmd$lvltentative() {
		this.curGroup.attributes.lvltentative = true;
	}

	cmd$listlevel() {
		this.curGroup = new ListLevel(this.curGroup.parent);
	}
	cmd$levelstartat(val) {
		this.curGroup.attributes.startat = val;
	}
	cmd$levelnfc(val) {
		this.curGroup.attributes.nfc = val;
	}
	cmd$levelnfcn(val) {
		this.curGroup.attributes.nfcn = val;
	}
	cmd$leveljc(val) {
		this.curGroup.attributes.jc = val;
	}
	cmd$leveljcn(val) {
		this.curGroup.attributes.jcn = val;
	}
	cmd$leveltext() {
		this.curGroup = new parameterGroup(this.curGroup.parent, "leveltext");
	}
	cmd$levelnumbers(val) {
		this.curGroup = new parameterGroup(this.curGroup.parent, "levelnumbers");
	}
	cmd$levelfollow(val) {
		this.curGroup.attributes.follow = val;
	}
	cmd$levellegal(val) {
		this.curGroup.attributes.legal = val;
	}
	cmd$levelnorestart(val) {
		this.curGroup.attributes.norestart = val;
	}
	cmd$levelold(val) {
		this.curGroup.attributes.old = val;
	}
	cmd$levelprev(val) {
		this.curGroup.attributes.prev = val;
	}
	cmd$levelprevspace(val) {
		this.curGroup.attributes.prevspace = val;
	}
	cmd$levelindent(val) {
		this.curGroup.attributes.indent = val;
	}
	cmd$levelspace(val) {
		this.curGroup.attributes.space = val;
	}

	cmd$listoverridetable() {
		this.curGroup = new ListOverrideTable(this.doc);
	}
	cmd$listoverride() {
		this.curGroup = new ListOverride(this.curGroup.parent);
	}
	cmd$ls(val) {
		if (this.curGroup instanceof ListOverride) {
	      	this.curGroup.ls = val;
	    } else {
	      	this.curGroup.style.ls = val;
	    }
	}
	cmd$listoverridecount(val) {
		this.curGroup.attributes.overridecount = val;
	}
	cmd$listoverridestartat() {
		this.curGroup.attributes.overridestartat = true;
	}
	cmd$listoverrideformat(val) {
		this.curGroup.attributes.overrideformat = val;
	}
}




function rtfToBBCode(rtfString) {
	reader = new SmallRTFRibosomalSubunit;
	writer = new LargeRTFRibosomalSubunit;
	reader.spool(rtfString);
	console.log(reader.output);
	writer.synthesize(reader.output);
	const rtfDOM = writer.output;
	console.log(rtfDOM);
}



// /* Converts RTF document strings into BBCode. */
// function rtfToBBCode (rtfIn) {
// 	hello();
// 	if (rtfIn.includes("\\pgnstarts0")) {
// 		const splitRTF = rtfIn.split("\\pgnstarts0", 2);
// 		return bbConvertWin(splitRTF);
// 	} else {
// 		const splitRTF = rtfIn.split(/\\pard.*$/m, 2);
// 		return bbConvertMac(splitRTF);
// 	}	
// }

// /* Converts RGB arrays ([R, G, B]) into hex colour values */
// function rgbToHex(rgbArray) {
// 	outStr = "#"
// 	rgbArray.forEach(val => {
// 		let hex = parseInt(val).toString(16);
// 		outStr += hex.length == 1 ? "0" + hex : hex;
// 	});
// 	return outStr;
// }

// function bbConvertMac(splitRTF) {
// 	let hexColourTable = [];
// 	splitRTF[0].match(/{\\colortbl;.+(?=;})/)[0].replace("{\\colortbl;","").split(";").forEach(pallet => {
// 		hexColourTable.push(rgbToHex(pallet.replace("\\red","").replace("green","").replace("blue","").split("\\")));
// 	});

// 	let outputString = "";

// 	const paragraphs = splitRTF[1].match(/^.*$/gm);
// 	paragraphs.forEach(paragraph => {
// 		let contents = paragraph;
// 		contents = contents.replace(/\\$/gm, "\\n");

// 		contents = contents.replace(/\\/g, "⚐Ï⚑");

// 		contents = contents
// 			.replace("⚐Ï⚑{⚐Ï⚑⚐Ï⚑Scrv_ps=", "[quote]")
// 			.replace("⚐Ï⚑⚐Ï⚑end_Scrv_ps⚐Ï⚑", "[/quote]")
// 			.replace(/⚐Ï⚑hich⚐Ï⚑f\d ⚐Ï⚑emdash ⚐Ï⚑loch⚐Ï⚑f\d /g,"—")
// 			.replace(/⚐Ï⚑tab /g, "\\t")
// 			.replace(/"/g, `\\"`)
// 			.replace(/}/g, `\\}`);

// 		//Return all remaining instances of the unicode string back to backslashes.
// 		contents = contents.replace(/(⚐Ï⚑){1,2}/g, "\\\\");

// 		outputString += contents;
// 	});	

// 	return outputString;
// }

// function bbConvertWin(splitRTF) {
// 	let hexColourTable = [];
// 	splitRTF[0].match(/{\\colortbl;.+(?=;})/)[0].replace("{\\colortbl;","").split(";").forEach(pallet => {
// 		hexColourTable.push(rgbToHex(pallet.replace("\\red","").replace("green","").replace("blue","").split("\\")));
// 	});

// 	let outputString = "";
// 	const rtfParagraphs = splitRTF[1].match(/\\par.*$/gm);

// 	let alignment = "left";
// 	let listLvl = -1;
// 	let nest = [];
// 	for (let p=0;p<rtfParagraphs.length;p++) {

// 		let paragraphString = ""

// 		if (listLvl > -1 && !rtfParagraphs[p].includes("\\ilvl" + listLvl)) {
// 			if (!rtfParagraphs[p].includes("\\ilvl")) {
// 				while (listLvl > -1) {
// 					paragraphString += "[/list]";
// 					listLvl -= 1;
// 				}
// 			} else {
// 				let curLvl = parseInt(rtfParagraphs[p].match(/\\ilvl\d+/)[0].replace("\\ilvl",""));
// 				while (listLvl > curLvl) {
// 					paragraphString += "[/list]";
// 					listLvl -= 1;
// 				}
// 			}
// 		}

// 		paragraphString += "\\n\\n";

// 		const alignmentQuantifier = rtfParagraphs[p].match(/\\(q[lcrj]\\)?ltrch\\loch/);
// 		if (alignmentQuantifier) {
// 			if (!alignmentQuantifier[0].match(/qc|qr/)) {
// 				alignment = "left";
// 			} else if (alignmentQuantifier[0].includes("\\qc\\")) {
// 				alignment = "center";
// 			} else if (alignmentQuantifier[0].includes("\\qr\\")) {
// 				alignment = "right";
// 			}
// 		}

// 		if (alignment === "left") {
// 			//pass;
// 		} else if (alignment === "center") {
// 			paragraphString += "[center]";
// 		} else if (alignment === "right") {
// 			paragraphString += "[right]";
// 		}

// 		if (rtfParagraphs[p].includes("\\ls")) {
// 			if (parseInt(rtfParagraphs[p].match(/\\ilvl\d+/)[0].replace("\\ilvl","")) > listLvl) {
// 				let listType = rtfParagraphs[p].match(/{\\listtext\\f0\\fs22\\b0\\i0\s.(?=\.\s})/);
// 				if (listType) {
// 					paragraphString += "[list=" + listType[0].replace(/{\\listtext\\f0\\fs22\\b0\\i0\s/,"") + "]";
// 				} else {
// 					paragraphString += "[list]";
// 				}	
// 				listLvl += 1;
// 			}	
// 		}

// 		if (listLvl > -1) {
// 			paragraphString += "[*]";
// 		}

// 		const rtfGroups = rtfParagraphs[p].match(/{\\f.*?}+/g);	
// 		if (rtfGroups) {		
// 			for (let i=0;i<rtfGroups.length;i++) {
// 				const args = rtfGroups[i].substring(0,rtfGroups[i].indexOf(" "));
// 				let contents = rtfGroups[i].substring(rtfGroups[i].indexOf(" ")).slice(1).replace(/}+$/gm,"");
// 				let groupString = "";

// 				if (nest.length) {
// 					let nestLevel = nest.length;
// 					while (nestLevel > 0) {
// 						if (nest[nestLevel-1] === "bold" && args.includes("\\b0")) {
// 							groupString += "[/b]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "italic" && args.includes("\\i0")) {
// 							groupString += "[/i]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "underline" && !args.includes("\\ul\\ulc0")) {
// 							groupString += "[/u]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "strikethrough" && !args.includes("\\strike\\strikec0")) {
// 							groupString += "[/s]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "smallcaps" && !args.includes("\\scaps")) {
// 							groupString += "[/smcaps]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "superscript" && !args.includes("\\super")) {
// 							groupString += "[/sup]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "subscript" && !args.includes("\\sub")) {
// 							groupString += "[/sub]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "color" && !args.includes("\\cf")) {
// 							groupString += "[/color]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "url" && !args.includes("\\fldrslt")) {
// 							groupString += "[/url]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else if (nest[nestLevel-1] === "email" && !args.includes("\\fldrslt")) {
// 							groupString += "[/email]";
// 							nest.splice(nestLevel-1, 1);
// 							nestLevel--;
// 						} else {
// 							nestLevel--;
// 						}						
// 					}
// 				}

// 				if (args.includes("\\b1") && !nest.includes("bold")) {
// 					groupString += "[b]";
// 					nest.push("bold");
// 				} 

// 				if (args.includes("\\i1") && !nest.includes("italic")) {
// 					groupString += "[i]";
// 					nest.push("italic");
// 				}

// 				if (args.includes("\\ul\\ulc0") && !nest.includes("underline")) {
// 					groupString += "[u]";
// 					nest.push("underline");
// 				}

// 				if (args.includes("\\ul\\ulc0") && !nest.includes("underline")) {
// 					groupString += "[u]";
// 					nest.push("underline");
// 				}

// 				if (args.includes("\\strike\\strikec0") && !nest.includes("strikethrough")) {
// 					groupString += "[s]";
// 					nest.push("strikethrough");
// 				}

// 				if (args.includes("\\scaps") && !nest.includes("smallcaps")) {
// 					groupString += "[smcaps]";
// 					nest.push("smallcaps");
// 				}

// 				if (args.includes("\\super") && !nest.includes("superscript")) {
// 					groupString += "[sup]";
// 					nest.push("superscript");
// 				}

// 				if (args.includes("\\sub") && !nest.includes("subscript")) {
// 					groupString += "[sub]";
// 					nest.push("subscript");
// 				}

// 				if (args.includes("\\cf") && !nest.includes("color")) {
// 					tableRef = parseInt(args.match(/\\cf\d+/)[0].replace("\\cf","")) - 1;
// 					groupString += "[color=" + hexColourTable[tableRef] + "]";
// 					nest.push("color");
// 				}

// 				if (args.includes("\\field{\\*\\fldinst")) {
// 					linkURL = contents.replace("HYPERLINK ","").replace(/\"/g,"");
// 					if (linkURL.includes("mailto:")) {
// 						groupString += "[email]";
// 						nest.push("email");
// 						rtfGroups[i+1] = rtfGroups[i+1].replace("mailto:","");
// 					} else if (!contents.includes("scrivcmt")){
// 						groupString += "[url=" + linkURL + "]";
// 						nest.push("url");
// 					}
// 					contents = "";					
// 				}
				
// 				//Replace all backslashes with an arbitrary unicode string: ⚐Ï⚑
// 				//RTF really likes backslashes. JSON, unfortunately, does not.
// 				//Doing this makes dealing with escaped characters a lot easier.
// 				contents = contents.replace(/\\/g, "⚐Ï⚑");

// 				/* -Unicode- */
// 				const unicodeChars = contents.match(/⚐Ï⚑u\d+⚐Ï⚑/g);
// 				if (unicodeChars) {
// 					contents = contents.replace(/⚐Ï⚑loch⚐Ï⚑af\d⚐Ï⚑hich⚐Ï⚑af\d⚐Ï⚑dbch⚐Ï⚑af\d⚐Ï⚑uc1|'\w\w/g, "");
// 					unicodeChars.forEach(uniCode => {
// 						contents = contents.replace(uniCode, String.fromCharCode(parseInt(uniCode.slice(4))));
// 					});
// 				}

// 				contents = contents
// 					.replace("⚐Ï⚑{⚐Ï⚑⚐Ï⚑Scrv_ps=", "[quote]")
// 					.replace("⚐Ï⚑⚐Ï⚑end_Scrv_ps⚐Ï⚑", "[/quote]")
// 					.replace(/⚐Ï⚑hich⚐Ï⚑f\d ⚐Ï⚑emdash ⚐Ï⚑loch⚐Ï⚑f\d /g,"—")
// 					.replace(/⚐Ï⚑tab /g, "\\t")
// 					.replace(/⚐Ï⚑line /g, "\\n")
// 					.replace(/"/g, `\\"`);

// 				//Return all remaining instances of the unicode string back to backslashes.
// 				contents = contents.replace(/(⚐Ï⚑){1,2}/g, "\\\\");

// 				groupString += contents;
// 				paragraphString += groupString;
// 			}
// 		}

// 		if (nest.length) {
// 			let nestLevel = nest.length;
// 			while (nestLevel > 0) {
// 				if (nest[nestLevel-1] === "bold") {
// 					paragraphString += "[/b]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "italic") {
// 					paragraphString += "[/i]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "underline") {
// 					paragraphString += "[/u]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "strikethrough") {
// 					paragraphString += "[/s]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "smallcaps") {
// 					paragraphString += "[/smcaps]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "superscript") {
// 					paragraphString += "[/sup]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "subscript") {
// 					paragraphString += "[/sub]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "color") {
// 					paragraphString += "[/color]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "url") {
// 					paragraphString += "[/url]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else if (nest[nestLevel-1] === "email") {
// 					paragraphString += "[/email]";
// 					nest.splice(nestLevel-1, 1);
// 					nestLevel--;
// 				} else {
// 					nestLevel--;
// 				}
// 			}
// 		}

// 		if (alignment === "left") {
// 			//pass;
// 		} else if (alignment === "center") {
// 			paragraphString += "[/center]";
// 		} else if (alignment === "right") {
// 			paragraphString += "[/right]";
// 		}

// 		outputString += paragraphString;
// 	}
// 	return outputString;
// }