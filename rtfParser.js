//Design inspired by: https://github.com/iarna/rtf-parser

const win_1252 = ` !"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\`abcdefghijklmnopqrstuvqxyz{|}~ €�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ`

class RTFObj {
	constructor(parent) {
		this.parent = parent;
		this.style = {};
		this.attributes = {};
		this.contents = [];
		this.type = "";
	}
	get curstyle() {
		return JSON.parse(JSON.stringify(this.style));
	}
	get curattributes() {
		return JSON.parse(JSON.stringify(this.attributes));
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
			style: this.curstyle,
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
		if (this.contents[0] && this.contents.every(entry => typeof entry === "string") && this.contents.every (entry => entry.style === this.contents[0].style)) {
			this.contents = this.contents.join("");
			if (this.type === "span") {this.type = "text";}
		}
		this.parent.contents.push({
			contents: this.contents,
			style: this.curstyle,
			attributes: this.curattributes,
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
		if (this.contents[1] && this.contents.every(entry => typeof entry === "string")) {
			this.contents = this.contents.join("");
		}
		if (this.contents[0]) {
			this.parent[this.param] = this.contents[0].replace(/[;"]/g,"");
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
		this.attributes = {};
		this.contents = [];
	}
	dumpContents() {
		if (!this.table[0] && this.contents[0]) {
			this.table.push ({
				fontname: this.contents[0].replace(";",""),
				attributes: this.attributes
			});
		}
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
			attributes: this.curattributes
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
		this.listname = "";
	}
	dumpContents() {
		this.attributes.listname = this.listname;
		this.parent.table.push({
			templateid: this.templateid,
			id: this.id,
			levels: this.contents,
			attributes: this.curattributes,
		});
	}
}

class ListLevel extends RTFObj{
	constructor (parent) {
		super(parent);
	}
	dumpContents() {
		this.attributes.leveltext = this.leveltext;
		this.attributes.levelnumbers = this.levelnumbers;
		this.parent.contents.push({
			style:this.curstyle,
			attributes: this.curattributes,
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
			attributes: this.curattributes,
			id: this.id,
			ls: this.ls
		});
	}
}

class Field extends RTFObj {
	constructor(parent) {
		super(parent);
		this.fieldInst = "";
		this.contents = "";
		this.type = "field";
	}
	dumpContents() {
		const fieldInstProps = this.fieldInst.split(" ");
		this.attributes.fieldtype = fieldInstProps[0];
		this.attributes.fieldvalue = fieldInstProps[1];
		this.parent.contents.push({
			attributes: this.curattributes,
			contents: this.contents,
			style: this.curstyle,
			type: this.type
		});
	}
}
class Fldrslt extends RTFObj {
	constructor(parent) {
		super(parent);
	}
	dumpContents() {
		this.parent.style = this.style;
		this.parent.contents = this.contents[0];
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
		return this.output;
	}
	advancePos() {
		this.curIndex++;
		if (this.curIndex < this.rtfString.length) {
			this.curChar = this.rtfString.charAt(this.curIndex);
		} else {
			this.setInstruction({type:"documentEnd"});
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
			case "\r":
				this.setInstruction();
				this.setInstruction({type:"break"});
				break;
			default: 
				this.curInstruction.type = "text";
				this.curInstruction.value += char;
		}
	}
	parseEscape(char) {
		if (char.search(/[ \\{}\n\r]/) === -1) {
			this.setInstruction();
			this.operation = this.parseControl;
			this.parseControl(char);
		} else if (char.search(/[\n\r]/) !== -1){
			this.curInstruction.value += char + char;
			this.parseText(char);
			this.operation = this.parseText;
		} else {
			this.operation = this.parseText;
			this.curInstruction.type = "text";
			this.curInstruction.value += char;
		}
	}
	parseControl(char) {
		if (char.search(/[ \\{}\t'\n;]/) === -1) {
			this.curInstruction.type = "control";
			this.curInstruction.value += char;
		} else if (char === "'") {
			this.operation = this.parseHex;
			this.curInstruction.type = "control";
			this.curInstruction.value += "hex";
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
		if (this.curInstruction.value.length >= 5) {
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
		this.curIndex = 0;
		this.defState = {font:0,fontsize:22,bold:false,italics:false};
		this.doc = new RTFDoc;
		this.curGroup = this.doc;
		this.paraTypes = ["paragraph", "listitem"];
		this.textTypes = ["text", "listtext", "field", "fragment"];
		this.working = false;
	}
	synthesize(rtfInstructions) {
		this.instructions = rtfInstructions;
		this.output = {};
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
		return this.output;
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
				if (this.curGroup.type !== "paragraph") {
					this.curGroup.contents.push(instruction.value);
				} else {
					this.newGroup("fragment");
					this.curGroup.contents.push(instruction.value);
				}		
				break;
			case "groupStart":
				this.newGroup("span");
				break;
			case "groupEnd":
				this.endGroup();
				break;
			case "break":
				if (this.curGroup.type === "fragment") {this.endGroup();}
				break;
			case "documentEnd":
				while (this.curGroup !== this.doc) {this.endGroup();}
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
		this.curGroup.style = this.curGroup.parent.style ? this.curGroup.parent.curstyle : this.defState;
	}
	endGroup() {
		this.curGroup.dumpContents();
		if (this.curGroup.parent) {
			this.curGroup = this.curGroup.parent;
		} else {
			this.curGroup = this.doc;
		}
	}

	/* Paragraphs */
	cmd$par() {
		if (this.paraTypes.includes(this.curGroup.type)) {
			const prevStyle = this.curGroup.curstyle;
			this.endGroup()
			this.newGroup("paragraph");
			this.curGroup.style = prevStyle;
		} else {
			this.newGroup("paragraph");
		}	
	}
	cmd$pard() {
		if (this.paraTypes.includes(this.curGroup.type)) {
			this.curGroup.style = JSON.parse(JSON.stringify(this.defState));
		} else {
			this.newGroup("paragraph");
			this.curGroup.style = JSON.parse(JSON.stringify(this.defState));
		}
	}
	cmd$plain() {
		Object.keys(this.defState).forEach(key => {
			this.curGroup.style[key] = this.defState[key];
		});
	}

	/* Alignment */
	cmd$qc() {
		this.curGroup.style.alignment = "center";
	}
	cmd$qj() {
		this.curGroup.style.alignment = "justified";
	}
	cmd$qr() {
		this.curGroup.style.alignment = "right";
	}
	cmd$ql() {
		this.curGroup.style.alignment = "left";
	}

	/* Text Direction */
	cmd$rtlch() {
		this.curGroup.style.direction = "rtl";
	}
	cmd$ltrch() {
		this.curGroup.style.direction = "ltr";
	}

	/* Character Stylings */
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
	cmd$sub() {
		this.curGroup.style.subscript = true;
	}
	cmd$super() {
		this.curGroup.style.superscript = true;
	}
	cmd$nosupersub() {
		this.curGroup.style.subscript = false;
		this.curGroup.style.superscript = false;
	}
	cmd$cf(val) {
		this.curGroup.style.foreground = this.doc.colourTable[val - 1];
	}
	cmd$cb(val) {
		this.curGroup.style.background = this.doc.colourTable[val - 1];
	}

	/* Lists */
	cmd$ilvl(val) {
		this.curGroup.style.ilvl = val;
		this.curGroup.type = "listitem";
	}
	cmd$listtext(val) {
		this.curGroup.type = "listtext";
	}

	/* Special Characters */
	cmd$emdash() {
		this.curGroup.contents.push("—");
	}
	cmd$endash() {
		this.curGroup.contents.push("–");
	}
	cmd$tab() {
		this.curGroup.contents.push("\t");
	}
	cmd$line() {
		this.curGroup.contents.push("\n");
	}
	cmd$hrule() {
		this.curGroup.contents.push({type:"hr"});
	}

	/* Unicode Characters */
	cmd$uc(val) {
		if (this.curGroup.type !== "span") {
			this.curGroup.uc = val
		} else {
			this.curGroup.parent.uc = val
		}
	}
	cmd$u(val) {
		if (!this.paraTypes.includes(this.curGroup.type)) {
			this.curGroup.contents.push(String.fromCharCode(parseInt(val)));			
		} else {
			this.newGroup("fragment");
			this.curGroup.contents.push(String.fromCharCode(parseInt(val)));
			this.endGroup();
		}
		if(this.curGroup.uc) {
			this.curIndex += this.curGroup.uc;
		} else if (this.curGroup.parent.uc) {
			this.curIndex += this.curGroup.parent.uc;
		} else {
			this.curIndex += 1;
		}
	}

	/* Ascii Extended Characters (Windows 1252) */
	cmd$hex(val) {
		if (!this.paraTypes.includes(this.curGroup.type)) {
			this.curGroup.contents.push(win_1252.charAt(parseInt(val, 16) - 32));		
		} else {
			this.newGroup("fragment");
			this.curGroup.contents.push(win_1252.charAt(parseInt(val, 16) - 32));
			this.endGroup();
		}
	}

	/* Fonts */
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

	/* Fields */
	cmd$field() {
		this.curGroup = new Field(this.curGroup.parent);
	}
	cmd$fldinst() {
		this.curGroup = new parameterGroup(this.curGroup.parent, "fieldInst");
	}
	cmd$fldrslt() {
		this.curGroup = new Fldrslt(this.curGroup.parent);
	}

	/* Font Table */
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

	/* Colour Table */
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

	/* List Table */
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

	/* List Override Table */
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

class BBCodeBuilder {
	constructor() {
		this.dom = {};
		this.curGroup = {};
		this.stack = [];
		this.curStyle = {};
		this.curIndex = 0;
		this.output = "";
		this.working = false;
		this.tagTable = {
			italics: "i",
			bold: "b",
			underline: "u",
			strikethrough: "s",
			smallcaps: "smcaps",
			superscript: "sup",
			subscript: "sub",
			foreground: "color",
			hyperlink: "url"
		}
	}
	rgbToHex(rgbObject) {
	 	let outStr = "#"
	 	let rgbArray = [rgbObject.red, rgbObject.green, rgbObject.blue];
	 	rgbArray.forEach(val => {
	 		let hex = parseInt(val).toString(16);
	 		outStr += hex.length == 1 ? "0" + hex : hex;
	 	});
	 	return outStr;
	}
	build(rtfDom) {
		this.dom = rtfDom;
		this.curGroup = this.dom.contents[0];
		this.stack = [];
		this.curStyle = {alignment: "left", listlevel:-1, foreground:{}};
		this.curIndex = 0;
		this.output = "";
		this.working = true;
		while (this.working === true) {
			this.output += this.processSupergroup(this.curGroup);
			this.advancePos();
		}
		return this.output;
	}
	advancePos() {
		this.curIndex++;
		if (this.curIndex < this.dom.contents.length) {
			this.curGroup = this.dom.contents[this.curIndex];
		} else {
			this.working = false;
		}
	}
	processSupergroup(group) {
		let groupString = "";

		/* Open alignment tags */
		if (group.style.alignment) {
			if (group.style.alignment !== "left" && group.style.alignment !== "justified") {
				groupString += "[" + group.style.alignment + "]"
			}
		}

		/* List handling */
		if (group.style.ilvl >= 0) {
			if (group.style.ilvl > this.curStyle.listlevel) {
				const style = this.dom.listtable[group.style.ls - 1].levels[group.style.ilvl].attributes.nfc;
				if (style === 23 || style > 4) {
					groupString += "[list]\n";
				} else {
					const listTypes = "1IiAa";
					groupString += "[list=" + listTypes.charAt(style) + "]\n";
				}				
			} else if (group.style.ilvl < this.curStyle.listlevel) {
				for (let i=0;i<this.curStyle.listlevel-group.style.ilvl;i++) {
					groupString += "[/list]";
				}		
			}
			groupString += "[*]";
			this.curStyle.listlevel = group.style.ilvl
		} else if (this.curStyle.listlevel !== -1) {
			while (this.curStyle.listlevel > -1) {
				groupString += "[/list]";
				this.curStyle.listlevel--;
			}
		}

		/* Subgroup processing */
		if (typeof group.contents !== "string") {
			group.contents.forEach(subgroup => {
				groupString += this.processSubgroup(subgroup);
			});
		} else {
			groupString += this.processSubgroup(group);
		}

		/* Closing remaining character tags */
		if (this.stack.length) {
			let stackLevel = this.stack.length;
 			while (stackLevel > 0) {
 				if (this.stack[stackLevel-1] === "foreground") {this.curStyle.foreground = {}}
 				groupString += "[/" + this.tagTable[this.stack[stackLevel-1]] + "]";
 				this.stack.splice(stackLevel-1, 1);
				stackLevel --;
			}
		}

		/* Closing alignment */
		if (group.style.alignment) {
			if (group.style.alignment !== "left" && group.style.alignment !== "justified") {
				groupString += "[/" + group.style.alignment + "]"
			}
		}

		/* Make string JSON friendly */
		groupString = groupString.replace(/\\/g, "⚐Ï⚑")
								.replace(/\n/g, "\\n")
								.replace(/\t/g, "\\t")
								.replace(/\r/g, "\\r")
								.replace(/\f/g, "\\f")
								.replace(/"/g, `\\"`)
								.replace(/}/g, `\\\\}`)
								.replace(/(⚐Ï⚑){1,2}/g, "\\\\");

		/* Insert newlines */
		if (group.type === "paragraph") {
			groupString += "\\n\\n";
		} else if (group.type === "listitem") {
			groupString += "\\n";
		}

		return groupString;
	}
	processSubgroup(group) {
		let groupString = "";

		/* Closing tags from previous subgroup */
		if (this.stack.length) {
			let stackLevel = this.stack.length;
 			while (stackLevel > 0) {
 				if (this.stack[stackLevel-1] === "foreground" && group.style.foreground !== this.curStyle.foreground) {
 					groupString += "[/color]";
 					this.stack.splice(stackLevel-1, 1);
 				} else if (!group.style[this.stack[stackLevel-1]]) {
 					if (this.stack[stackLevel-1] === "foreground") {this.curStyle.foreground = {}}
 					groupString += "[/" + this.tagTable[this.stack[stackLevel-1]] + "]";
 					this.stack.splice(stackLevel-1, 1);
 				}		
				stackLevel --;
			}
		}

		/* Opening tags */
		Object.keys(this.tagTable).forEach(tag => {
			if (group.style[tag] && !this.stack.includes(tag)) {
				if (tag === "foreground") {
					groupString += "[color=" + this.rgbToHex(group.style.foreground) + "]";
					this.curStyle.foreground = group.style.foreground;
					this.stack.push("foreground");
				} else {
					this.stack.push(tag);
					groupString += "[" + this.tagTable[tag] + "]";
				}
			}			
		});

		/* Handling contents */
		if (typeof group.contents === "string") {
			if (group.type === "field" && group.attributes.fieldtype === "HYPERLINK") {
				if (group.attributes.fieldvalue.includes("scrivcmt:")) {
					//hopefully something will go here one day
					groupString += group.contents;
				} else if (group.attributes.fieldvalue.includes("mailto:")){
					groupString += "[email]"
								+ group.attributes.fieldvalue.replace("mailto:","")
								+ "[/email]";
				} else {
					groupString += "[url=" + group.attributes.fieldvalue + "]"
								+ group.contents
								+ "[/url]";
				}			
			} else if (group.type != "listtext") {
				groupString += group.contents;
			}
		} else {
			group.contents.forEach(subgroup => {
				groupString += this.processSubgroup(subgroup);
			});
		}

		return groupString;
	}
}

function rtfToBBCode(rtfString) {
	const reader = new SmallRTFRibosomalSubunit;
	const writer = new LargeRTFRibosomalSubunit;
	const builder = new BBCodeBuilder;
	//builder.build(writer.synthesize(reader.spool));
	reader.spool(rtfString);
	console.log(reader.output);
	writer.synthesize(reader.output);
	console.log(writer.output);
	builder.build(writer.output);
	console.log(builder.output);
	return builder.output;
}