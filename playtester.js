var fs = require('fs-extra');
var fetch = require('node-fetch');
var trice_xmls = require('./src/trice_xmls.js');
const Jimp = require('jimp');

var DRAFT_PLAYERS = 8;
var SETNAME = "Unnamed Set";
var SETCODE;
var IMGTYPE;
var BRANCHNAME;

var cardDatabase = {};
var sheetMap;
var masterObject;
var config;
var minilibs = {};
var updated_config = false;

var originalFolder = "";
var psFolder;
var ibbFolder;
var triceFolder;
var triceTokensFolder = `Cockatrice/data/pics/downloadedPics/tokens/`;
var wide_types = /Battle/;
var loggerMap = {};
var cursorMax = 0;

var manage_images = true;

var month_ar = ["January", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
// read directory
// find [name]-files folder
// read [name].txt
//// process cards, save database.json for LackeyBot pages
//// create Cockatrice XMLs, which generates imageNames
//// if Draftmancer or Planesculptors, build the sheetMap for packs
//// redistribute and split images as needed
//// create Draftmancer file
//// create Planesculptors files
//// get names from LackeyBot and check for name conflicts

// todo PS file
// todo commentary tag and hidetags on exporter
// todo, give lackeybot set data, img extension and whatever other useful stuff
// todo lackeybot viewer page
// todo make sure this all works
// todo ibb patcher? this might be done now

// general functions
function userLogging(key, str) {
	if(!loggerMap.hasOwnProperty(key)) {
		loggerMap[key] = {cursor:cursorMax};
		process.stdout.cursorTo(0, cursorMax)
		cursorMax++
		console.log(str);
	}else{
		process.stdout.cursorTo(0, loggerMap[key].cursor);
		process.stdout.clearLine();
		process.stdout.write(str);
	}
}
function userCounting(key, str, max, cb) {
	if(!loggerMap.hasOwnProperty(key)) {
		loggerMap[key] = {cursor:cursorMax, current:0, max:max, cb:cb};
		process.stdout.cursorTo(0, cursorMax)
		cursorMax++
		console.log(str + "0/" + max);
	}else{
		if(!loggerMap[key].max) {
			loggerMap[key].max = max;
			loggerMap[key].current = 0;
			loggerMap[key].cb = cb;
		}else{
			loggerMap[key].current++;
		}
		process.stdout.cursorTo(0, loggerMap[key].cursor);
		process.stdout.clearLine();
		process.stdout.write(str + loggerMap[key].current + "/" + loggerMap[key].max);
		if(loggerMap[key].current == loggerMap[key].max && loggerMap[key].cb)
			loggerMap[key].cb();
	}
}
function userWarning(str) {
	process.stdout.cursorTo(0, cursorMax)
	console.log(str);
	cursorMax++;
}
function userError(str) {
	process.stdout.cursorTo(0, cursorMax)
	console.log(str);
	cursorMax++
}
function windex(string) {										//remove illegal characters for windows files
	return string.replace(/[|*<>?":]/g, "")
}
function rand(low, high) { 										//rand(x) or rand(x,y) gets a random number from 0-x or random number from x-y
	if(high == undefined)
		high = 0;
	let dif = Math.abs(low-high)+1;
	let rand = Math.floor(Math.random()*dif);
	rand += Math.min(low, high);
	return rand;
}
function yymmddIntToLongString(num) {
	let str = String(num);
	let year = str[0] + str[1];
	let month = (str[2] == "0" ? "" : str[2]) + str[3];
	let date = (str[4] == "0" ? "" : str[4]) + str[5];
	
	year = "20" + year;
	month = month_ar[month];
	
	return date + " " + month + " " + year;
}
// find and schedule the files
function loadConfig() {
	try{
		fs.readFile('./config.json', 'utf8', (err, data) => {
			if(err) {
				throw err;
			}
			config = JSON.parse(data);
		})
	}catch(e){
		userWarning("Unable to load config. Will attempt to continue, but ensure the config.json file exists and is valid.");
		config = {
			username: "username",
			branch_name: "",
			draft_boosters: 3,
			set_title: "Unnamed set",
			last_update: 0
		}
		updated_config = true;
	}
	findExportedFile();
}
function findExportedFile() {
	let found = false;
	// look in the main_directory for [name]-files folder
	// if we find it, process [name].txt
	// otherwise provide error
	fs.readdir("./", (err, main_directory) => {
		for(let f in main_directory) {
			let fileName = main_directory[f];
			if(!fileName.match(/-files/))
				continue;
			originalFolder = fileName + "/";
			let exportedName = fileName.replace(/-files/, "");
			processExportedFile(`./${exportedName}.txt`);
			found = true;
			break;
		}
		if(!found) {
			userError(`Could not find exported file. Make sure you have an "[name].txt" file and "[name]-files" folder with matching names.`);
		}
	})
}
function processExportedFile(fileName) {
	// try reading [name].txt export file
	// if we have an error, probably from poorly rendered json, throw that
	// otherwise process [name].txt file into cards database
	// then build packs for Draftmancer and/or Planesculptors
	
	fs.readFile(fileName, "utf8", (err, data) => {
		if(err) {
			userError("Error reading exported file:");
			userError(err);
			readline.close();
			return;
		}
		try {
			masterObject = JSON.parse(data);
		}catch(e) {
			userError("Error parsing exported file:");
			userError(e);
		}
		if(!masterObject) {
			userError(`Cards file is empty.`)
			readline.close();
			return;
		}
		// sort our variables out
		SETNAME = masterObject.set_title;
		if(!SETNAME)
			SETNAME = config.set_title;
		SETCODE = masterObject.set_code;
		if(masterObject.branch_name)
			BRANCHNAME = masterObject.branch_name;
		if(!BRANCHNAME)
			BRANCHNAME = config.branch_name;
		IMGTYPE = masterObject.img_type;
		
		verifySetcode();	
	})
}
function verifySetcode() {
	if(SETCODE) {
		verifyBranch();
	}else{
		readline.question("Set code has not been set, please input now:", code => {
			SETCODE = code;
			verifyUsername();
		})
	}
}
function verifyUsername() {
	if(config.username) {
		verifyBranch();
	}else{
		readline.question("What is your GitHub username?", name => {
			config.username = name;
			verifyUsername();
		})
	}
}
function verifyBranch() {
	if(BRANCHNAME) {
		runExporters();
	}else{
		readline.question("What is the name of this branch? If blank, will assume its same as set code.", branch => {
			if(!branch) {
				config.branch_name = SETCODE;
			}else{
				config.branch_name = branch;
			}
			BRANCHNAME = config.branch_name;
			updated_config = true;
			runExporters();
		})
	}
}
function preloadLogs() {
	userLogging("cards", "Cards will be formatted");
	if(masterObject.cockatrice)
		userLogging("xmls", "Cockatrice xmls will be prepared");
	if(masterObject.draftmancer || masterObject.planesculptors)
		userLogging("packs", "Packs will be generated")
	if(masterObject.draftmancer)
		userLogging("dm", "Draftmancer file will be prepared");
	if(masterObject.planesculptors)
		userLogging("ps", "Planesculptors file will be prepared");
	if(masterObject.field_test)
		userLogging("ft", "Field Test file will be prepared");
	if(masterObject.cockatrice || masterObject.draftmancer || masterObject.planesculptors)
		userLogging("images", "Images will be split and arranged")
	if(masterObject.name_check) {
		let msg = "Names will be checked against: ";
		if(masterObject.name_check%2 == 0)
			msg += "Magic, ";
		if(masterObject.name_check%3 == 0)
			msg += "MSEM, ";
		if(masterObject.name_check%2 == 0)
			msg += "Revolution, ";
		msg = msg.replace(/, $/, "");
		userLogging("names", msg);
	}
	userLogging("config", "");
}
function runExporters() {
	readline.close();
	// build cardDatabase
	preloadLogs();
	userLogging("cards", "Formatting cards...");
	processExportedCards();
	userLogging("cards", "Formatting cards... Done");
	
	if(masterObject.field_test) {
		let ftname = originalFolder.replace("-files/", "");
		fs.writeFile(`./${ftname}-field-test.txt`, JSON.stringify(masterObject.cards), () => {
			userLogging("ft", `Field Test files saved. Give the host the "${ftname}-files" folder and "${ftname}-field-test.txt" file.`);
		})
	}

	// build Cockatrice xmls
	// we do this even if we don't export Cockatrice for the imageNames
	// we just only save the files if we export Cockatrice
	var library = {
		cards: cardDatabase,
		setData: {}
	}
	library.setData[SETCODE] = {
		longname: SETNAME,
		releaseDate: 0
	}
	var triceFiles = trice_xmls.generateTriceXMLs(library, {avoidReprints:true, saveImgNames:true});
	if(masterObject.cockatrice) {
		userCounting("xmls", "Making Cockatrice files... ", 2);
		fs.writeFile('./Cockatrice/data/cards.xml', triceFiles.cards, (err) => {
			userCounting("xmls", "Making Cockatrice files... ");
		})
		fs.writeFile("./Cockatrice/data/tokens.xml", triceFiles.tokens, (err) => {
			userCounting("xmls", "Making Cockatrice files... ");
		})
	}
	
	// write file for LackeyBot
	fs.writeFile('./database.json', JSON.stringify({
		meta: {set_code: SETCODE, set_title:config.set_title, designer:config.username, img_ext:IMGTYPE},
		cards: cardDatabase
	}), () => {});


	// process sheet data for packs
	if(masterObject.draftmancer || masterObject.planesculptors) {
		userLogging("packs", "Generating packs... ");
		sheetMap = processPackSheets(masterObject.pack_string, cardDatabase);
		userLogging("packs", "Generating packs... Done");
	}

	// handle images
	if(manage_images)
		imageManager();
	
	if(masterObject.draftmancer) {
		userLogging("dm","Making Draftmancer file... ");
		writeDraftmancer();
	}
	if(masterObject.planesculptors) {
		userLogging("ps","Making planesculptors files... ");	
		writePlanesculptors();
	}
	
	// ping LackeyBot and start namechecking
	if(masterObject.name_check) {
		userLogging("names","Fetching name check data... ");
		fetch(`https://lackeybot.herokuapp.com/api/minilibrary/30/${config.last_update}`, {method: "GET"})
			.then((resp) => resp.json())
			.then(function(resp) {
				processNamecheck(resp);
			})
			.catch(function(err) {
				let previous = ` Will attempt to use previously saved libraries, which were last updated `;
				let failed = " No previous libraries exist, so skipping namecheck.";
				if(config.last_update && config.last_update != 0) {
					previous += yymmddIntToLongString(config.last_update);
				}else{
					previous = failed;
				}
				userLogging("names", "Could not connect to LackeyBot for name checking."+previous);
				if(previous != failed)
					processNamecheck({});
			})
	}else{
		saveConfig();
	}
}
function saveConfig() {
	if(!updated_config)
		return;
	fs.writeFile('./config.json', JSON.stringify(config, null, 2), (err) => {
		userLogging("config", "config updated.");
	});
}
// build cardDatabase
function processExportedCards(nameMap) {
	// given masterObject, which has .cards array and several options
	// convert this into a LackeyBot card database
	// iterate cards to create each entry
	// including processing tokenscripts and fixing notes array etc.
	// then order them by normal cards, special cards, and tokens
	
	let mainset = [];
	let special = [];
	let tokens = [];
	for(let c in masterObject.cards) {
		// arrayify notes
		let card = masterObject.cards[c];
		if(card.notes == "") {
			card.notes = [];
		}else{
			card.notes = card.notes.split(";");
		}
		// arrayify added slots
		if(card.addslots == "") {
			card.addslots = [];
		}else{
			card.addslots = card.addslots.split(";");
		}
		
		if(card.typeLine.match(/Basic Land — /))
			card.rarity = "basic land";
		// add rarity line
		switch(card.rarity) {
			case "basic land":
				card.rarityLine = `*${card.setID} L*`;
				break;
			case "token":
				card.rarityLine = `*${card.setID} Token*`;
				break;
			case "masterpiece":
				card.rarityLine = `*${card.setID} Masterpiece*`;
				break;
			default:
				card.rarityLine = `*${card.setID} ${card.rarity.charAt(0).toUpperCase()}*`;
				break;
		}
		
		// process tokentags system
		if(card.tokenscripts)
			processTokenscripts(card);
		
		if(card.rarity == "token") {
			tokens.push(card);
		}else if(card.rarity == "special") {
			special.push(card);
		}else{
			mainset.push(card);
		}
	}
	
	let chunks = [mainset, special, tokens];
	for(let c in chunks) {
		let group = chunks[c];
		for(let g in group) {
			let card = group[g];
			let fullname = card.cardName;
			if(card.cardName2)
				fullname += "//" + card.cardName2;
			card.fullName = fullname;
			card.prints = [fullname];
			
			let test = cardDatabase[fullname];
			if(test) {
				let tag = "_" + test.prints.length;
				let database_name = fullname + tag;
				cardDatabase[database_name] = card;
				card.key = database_name;
				test.prints.push(database_name);
				for(let p in test.prints) {
					let print_key = test.prints[p];
					cardDatabase[print_key].prints = test.prints;
				}
			}else{
				cardDatabase[fullname] = card;
				card.key = fullname;
			}
		}
	}
	
}
function processTokenscripts(card) {
	if(card.tokenscripts.c) {
		// format spellbook
		card.spellbook = [];
		let names = card.tokenscripts.c.split(";");
		for(let n=0; n<names.length; n+=2) {
			let name = names[n];
			let val = names[n+1];
			if(!name || !val)
				continue;
			val = parseInt(val);
			if(!val)
				val = 1;
			for(let i=0; i<val; i++) {
				card.spellbook.push(name);
			}
		}
	}
	if(card.tokenscripts.rr) {
		// format replace script
		card.tokenscripts.r = [];
		let names = card.tokenscripts.rr.split(";");
		for(let n=0; n<names.length; n+=2) {
			let name = names[n];
			let val = names[n+1];
			if(!name || !val)
				continue;
			let conj = false;
			let ctest = val.match(/conjured?: ?(.*)/);
			if(ctest) {
				conj = true;
				val = ctest[1];
			}
			if(val == "x")
				val = "X"
			if(val != "X")
				val = parseInt(val);
			if(conj) {
				card.spellbook = [];
				let amount = (val == "X" ? 1 : val);
				for(let i=0; i<amount; i++)
					card.spellbook.push(name);
			}else{
				card.tokenscripts.r.push([name, val])
			}
		}
		delete card.tokenscripts.rr;
	}
	if(card.tokenscripts.aa) {
		// format add script
		card.tokenscripts.a = [];
		let names = card.tokenscripts.aa.split(";");
		for(let n=0; n<names.length; n+=2) {
			let name = names[n];
			let val = names[n+1];
			if(!name || !val)
				continue;
			let conj = false;
			let ctest = val.match(/conjured?: ?(.*)/);
			if(ctest) {
				conj = true;
				val = ctest[1];
			}
			if(val == "x")
				val = "X"
			if(val != "X")
				val = parseInt(val);
			if(conj) {
				if(!card.spellbook)
					card.spellbook = [];
				let amount = (val == "X" ? 1 : val);
				for(let i=0; i<amount; i++)
					card.spellbook.push(name);
			}else{
				card.tokenscripts.a.push([name, val]);
			}
		}
		delete card.tokenscripts.aa;
	}
}
// run namechecker
function processNamecheck(resp) {
	let formats = ["magic", "msem", "revolution"]
	for(let f in formats) {
		let format = formats[f];
		if(resp[format]) {
			minilibs[format] = resp[format];
			if(minilibs[format].update > config.last_update) {
				config.last_update = minilibs[format].update;
				updated_config = true;
			}
			fs.writeFile(`./minilibs/${format}.json`, JSON.stringify(minilibs[format]), (err) => {});
		}
	}
	saveConfig();
	loadMagic();
}
function loadMagic() {
	if(minilibs.magic || masterObject.name_check % 2 != 0) {
		loadMSEM();
	}else{
		try{
			fs.readFile('./minilibs/magic.json', 'utf8', (err, data) => {
				minilibs.magic = JSON.parse(data);
				loadMSEM();
			})
		}catch(e){
			userWarning("Failed to load Magic database for namechecking.");
			config.last_update = 0;
			update_config = true;
			loadMSEM();
		}
	}
}
function loadMSEM() {
	if(minilibs.msem || masterObject.name_check % 3 != 0) {
		loadRev();
	}else{
		try{
			fs.readFile('./minilibs/msem.json', 'utf8', (err, data) => {
				minilibs.msem = JSON.parse(data);
				loadRev();
			})
		}catch(e){
			userWarning("Failed to load MSEM database for namechecking.");
			config.last_update = 0;
			update_config = true;
			minilibs.msem = {};
			loadRev();
		}
	}
}
function loadRev() {
	if(minilibs.revolution || masterObject.name_check % 5 != 0) {
		beginNamechecking();
	}else{
		try{
			fs.readFile('./minilibs/revolution.json', 'utf8', (err, data) => {
				minilibs.revolution = JSON.parse(data);
				beginNamechecking();
			})
		}catch(e){
			userWarning("Failed to load Revolution database for namechecking.");
			config.last_update = 0;
			update_config = true;
			minilibs.revolution = {};
			beginNamechecking();
		}
	}
}
function beginNamechecking() {
	for(let f in minilibs) {
		userWarning(`checking ${f} name conflicts`);
		for(let c in minilibs[f].cards) {
			let existing_card = minilibs[f].cards[c];
			if(cardDatabase[existing_card.cardName]) {
				let check = checkNameConflict(existing_card, cardDatabase[existing_card.cardName]);
				if(check == "conflict") {
					userWarning(`Name conflict at ${f} card "${existing_card.cardName}"`);
				}else if(check == "bad_reprint") {
					userWarning(`Name conflict or bad reprint at ${f} card "${existing_card.cardName}"`);
				}else if(check == "questionable_reprint") {
					userWarning(`Rules text mismatch in reprint of ${f} card "${existing_card.cardName}"`);
				}
			}
		}
		if(minilibs[f].setData[SETCODE])
			userWarning(`Set code ${SETCODE} is used by ${f} set ${minilibs[f].setData[SETCODE]}.`);
		setTimeout(() => {},2*1000)
	}
}
function checkNameConflict(card1, card2) {
	if((card1.cardName2 || card2.cardName2) && card1.cardName2 != card2.cardName2) {
		return "conflict"; // don't need to audit this
	}
	let basics = [
		"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
		"Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest", "Snow-Covered Wastes"
	]
	if(basics.includes(card1.cardName))
		return "reprint";
	let matches = 0;
	let misses = 0;
	let easy_fields = ["manaCost", "power", "toughness", "loyalty", "defense", "manaCost2", "power2", "toughness2", "loyalty2"];
	for(let f in easy_fields) {
		if(card1[easy_fields[f]] === undefined)
			card1[easy_fields[f]] = "";
		if(card2[easy_fields[f]] === undefined)
			card2[easy_fields[f]] = "";
		if(card1[easy_fields[f]] == card2[easy_fields[f]]) {
			matches++;
		}else{
			misses++;
		}
	}
	if(card1.typeLine.replace(/ $/, "") == card2.typeLine.replace(/ $/, "")) {
		matches++;
	}else{
		misses++;
	}
	if(card1.typeLine2 && card2.typeLine2) {
		if(card1.typeLine2.replace(/ $/, "") == card2.typeLine2.replace(/ $/, "")) {
			matches++;
		}else{
			misses++;
		}
	}
	if(matches < 2)
		return "conflict"; // definitely wrong
	if(misses > matches)
		return "conflict" // probably wrong
	if(misses > 0)
		return "bad_reprint"; // might be right
	// if everything else lined up, then check rules text
	// its the easiest to screw up but still technically be correct
	if(card1.rulesText.replace(/ [*]?[(][^)]+[)][*]?/g, "").replace(/\n/g, " ") == card2.rulesText.replace(/ [*]?[(][^)]+[)][*]?/g, "").replace(/\n/g, " ")) {
		matches++
	}else{
		misses++;
	}
	if(card1.cardName2) {
		if(card1.rulesText2.replace(/ [*]?[(][^)]+[)][*]?/g, "").replace(/\n/g, " ") == card2.rulesText2.replace(/ [*]?[(][^)]+[)][*]?/g, "").replace(/\n/g, " ")) {
			matches++;
		}else{
			misses++;
		}
	}
	if(misses > 0)
		return "questionable_reprint";
	return "reprint";
}
// build sheetMap
function processPackSheets(packString, cardDatabase) {
	// given a packString that describes the slots for this set's pack
	// and the processed LackeyBot cardDatabase
	// first we convert the pack description into a sheetMap object
	// adding sheetMap[slot].check(card) which verifies if the card is valid for that slot
	// next we compile which slots each card can belong to
	// we return the sheets and build the pack files in other functions

	let sheetMap = processPackDefinition(packString);
	let wildcard_slots = [];
	for(let slotKey in sheetMap) {
		if(slotKey.match(/Wildcard/i))
			wildcard_slots.push(slotKey);
	}
	for(let printKey in cardDatabase) {
		let card = cardDatabase[printKey];
		if(card.rarity == "token")
			continue;
		let standards = [];
		let wildcards = [];
		let customs = [];
		for(let slotKey in sheetMap) {
			let slotInfo = sheetMap[slotKey];
			let matches = card.addslots.includes(slotKey) || slotInfo.check(card);
			if(!matches)
				continue;
			if(slotInfo.standard) {
				// one of the standard rarity slots
				if(!card.unslots)
					standards.push(slotInfo.name);
				if(!card.unwild) {
					for(let w in wildcard_slots) {
						wildcards.push(wildcard_slots[w]);
					}
				}
			}else{
				// one of the custom rarity slots
				customs.push(slotInfo.name);
				if(slotInfo.unslots) {
					// this removes this card from standard rarity slots
					// it stays in wildcard slots though
					standards = [];
				}
				if(slotInfo.unwild) {
					// this removes this card from wildcard slots
					wildcards = [];
				}
			}
		}
		// add to the slot's card object, initialized with a 0
		// we'll figure out its number later
		let appliedSlots = standards.concat(wildcards).concat(customs);
		for(let s in appliedSlots) {
			sheetMap[appliedSlots[s]].cards[printKey] = 0;
		}
		if(appliedSlots.length == 0) {
			userWarning(`Card does not fit any slots: ${card.cardName} (#${card.cardID})`)
		}
	}
	/*
		each card has been assigned to its slots
		for each slot, determine the weights of each card
		most the time this will be 1
		if it's by weights, we can apply the weights immediately
		if it's by percentage, we have to count them up
		in both cases we need to check if it matches a read
		if it matches multiple reads, resolve via conflicts parameter
		then we need to expand the weights into actual card numbers
		for each slot, determine how many cards it will add to the draft 
		slots * 8 players * 3 rounds
		normally a Common slot will add 7*8*3 to 10*8*3 (168 to 240) cards
		across 70 to 100 cards
		expected occurence of 2.4 per card
		we overdraw the expected by a factor of 3 about 1% of the time
		so we generally want 4x the expected value
		the value also needs to be a minimum of 1
		in most cases we would like to have this be 4 instead
		sometimes this is silly; consider MKM's special guest Slot
		Gamble has a 1.5% * 10% chance of appearing in that slot
		Each common has a 87.5% * 1.23% chance of appearing in that slot
		Gamble weight: 1, common weight: 71.75
		4 Gamble | 287 Common
		whereas that common in the dedicated Common slot occurs 10 times
		while the likelihood that multiple Gambles will occur is in the 1 in a million realm
		while this is excessive, it does smooth out probability
		for now, this will put the minimum weight == 4 cards
		so for now we will simply put the minimum weight to be 4 cards
	*/
	
	for(let slotKey in sheetMap) {
		let slotInfo = sheetMap[slotKey];
		// assign default weights
		let minWeight = Number.MAX_SAFE_INTEGER;
		if(!slotInfo.rate_kind) {
			// simply tag all cards with their expected occurrence
			// later we will apply duplicate reduction and scale this to final counts
			minWeight = DRAFT_PLAYERS * config.draft_boosters * slotInfo.count / Object.keys(slotInfo.cards).length;
			for(let printKey in slotInfo.cards) {
				slotInfo.cards[printKey] = minWeight;
			}
		}else{
			// first we need to split each card into its category
			// if rate_kind is weights we can apply those directly
			// if its odds, we need to convert those to weights based on card counts
			// normally category is by rarity
			// but reads: may pull cards out of it
			// we'll backread reads: first
			// then check basic rarities from the front
			let max_default_index = 6;
			let rar_array = ["common", "uncommon", "rare", "mythic rare", "special", "masterpiece", "basic land"];
			let collection = [
				[], // 0: common
				[], // 1: uncommon
				[], // 2: rare
				[], // 3: mythic rare
				[], // 4: special
				[], // 5: masterpiece
				[]  // 6: basic
			];		// 7 onwards, read
			for(let r in slotInfo.reads) {
				collection.push([]);
			}
			cardloop: for(let printKey in slotInfo.cards) {
				let card = cardDatabase[printKey];
				if(slotInfo.reads.length) {
					let has_been_read_by = [];
					slotloop: for(let i=slotInfo.reads.length; i<0; i--) {
						let read_name = slotInfo.reads[i-1];
						let collection_index = last_default_index + i;
						let matches_read = sheetMap[read_name].check(card);
						if(matches_read) {
							if(slotInfo.read_conflict == "last") {
								// add this and move on
								collection[collection_index].push(printKey);
								continue cardloop;
							}else{
								has_been_read_by.unshift(collection_index);
							}
						}
					}
					if(has_been_read_by.length && slotInfo.read_conflict == "first") {
						collection[has_been_read_by[0]].push(printKey);
						continue;
					}
					for(let i in has_been_read_by) {
						let index = has_been_read_by[i];
						collection[index].push(printKey);
					}
					if(has_been_read_by.length && slotInfo.read_conflict == "readonly") {
						continue;
					}
				}
				// if we haven't been continued, find the rarity
				let index = rar_array.indexOf(card.rarity);
				collection[index].push(printKey);
			}
			// convert rates partial array into a full array
			let rates_full = [];
			let reads_start_at = slotInfo.rates.length - slotInfo.reads.length;
			let reader = 0;
			for(let i=0; i<collection.length; i++) {
				if(i < reads_start_at || i > max_default_index) {
					// basic rarity
					rates_full.push(Number(slotInfo.rates[reader]));
					reader++;
				}else{
					rates_full.push(0);
				}
			}
			if(slotInfo.rate_kind == "odds") {
				// convert these to weights
				// find min p and make sure percents add to 100
				let pmin = [];
				let psum = 0;
				for(let r=0; r<rates_full.length; r++) {
					let rate = rates_full[r];
					if(rate == 0)
						continue;
					psum += rate;
					if(!pmin.length || rate < pmin[0])
						pmin = [rate, r];
				}
				if(psum == 0) {
					userWarning(`Rates for slot ${slotInfo.name} sum to 0. No cards will be assigned to this slot.`);
					continue;
				}
				else if(psum != 100) {
					let multi = 100/psum;
					for(let r in rates_full) {
						rates_full[r] *= multi;
					}
				}
				let pn_normalizing = rates_full[pmin[1]];
				let cn_normalizing = collection[pmin[1]].length;
				// normalize odds
				// normalize counts based on lowest odds
				for(let r in rates_full) {
					let rate = rates_full[r];
					let normalized_rate = rate / pn_normalizing;
					let normalized_count = collection[r].length / cn_normalizing;
					if(rate == 0 || normalized_count == 0) {
						rates_full[r] = 0;
					}else{
						let weight = Math.round(normalized_rate/normalized_count);
						rates_full[r] = weight;
					}
				}
			}
			// modify the weights into card counts
			let cards_added = DRAFT_PLAYERS * config.draft_boosters * slotInfo.count;
			let weights_total = 0;
			for(let r in rates_full) {
				weights_total += (rates_full[r] * collection[r].length);
			}
			let expected_array = [];
			let expected_min;
			for(let r in rates_full) {
				let wc = rates_full[r] * collection[r].length;
				if(wc == 0) {
					expected_array.push(0);
					continue;
				}
				let expected_of_each = (cards_added * (wc / weights_total)) / collection[r].length;
				if(!expected_min || expected_of_each < expected_min)
					expected_min = expected_of_each;
				expected_array.push(expected_of_each);
			}
			minWeight = expected_min;
			for(let categoryIndex in collection) {
				let category = collection[categoryIndex];
				let expected = expected_array[categoryIndex];
				for(let cardIndex in category) {
					let printKey = category[cardIndex];
					slotInfo.cards[printKey] += expected;
				}
			}
		}
		/*
			dupeTracker = {
				"Wastes": ["Wastes_OGW", "Wastes 2_OGW"]
			}
			used if we want dupes in a slot to turn up at the same rate as cards without dupes
			such as Brothers Yamazaki, which has two arts but isn't more common
			this is disabled by default, Wastes was twice as common in OGW
			canon mostly uses this when a card has multiple showcases
		*/	
		let dupeTracker = {};
		if(slotInfo.duplicates_share) {
			for(let printKey in slotInfo.cards) {
				let card_name = cardDatabase[printKey].cardName;
				if(!dupeTracker[card_name]) {
					dupeTracker[card_name] = [printKey];
				}else{
					dupeTracker[card_name].push(printKey);
				}
			}
			for(let card_name in dupeTracker) {
				if(dupeTracker[card_name].length <= 1) {
					delete dupTracker[card_name];
				}else{
					let weight_sum = 0;
					for(let printIndex in dupeTracker[card_name]) {
						let printKey = dupeTracker[card_name][printIndex];
						weight_sum += slotInfo.cards[printKey];
					}
					for(let printIndex in dupeTracker[card_name]) {
						let printKey = dupeTracker[card_name][printIndex];
						slotInfo.cards[printKey] = slotInfo.cards[printKey] / weight_sum;
						if(minWeight > slotInfo.cards[printKey] && slotInfo.cards[printKey] > 0)
							minWeight = slotInfo.cards[printKey];
					}
				}
			}
		}
		/*
			we need well more than the average expected number of cards to be realistic
			with 10 common slots and 100 commons, we expect 2.4 of each
			for each individual common there is
			a 44% chance of getting three or more (6.6e-26% of drafts will be represented by 2x)
			a 1.56% chance of getting six or more (20% of drafts will be represented by 5x)
			a 0.029% chance of getting eight or more (97.4% of drafts will be represented by 7x)
			a ~0.000001% chance of getting eleven or more (99.9999% of drafts will be represented by 10x)
			1 in a million should be good enough
			tech this isn't good enough for things with huge stdevs
			but a hard minimum means we should be fine there
		*/
		let multi = 4;
		if(minWeight < 1)
			multi = 4/minWeight;
		for(let printKey in slotInfo.cards) {
			slotInfo.cards[printKey] = Math.round(multi*slotInfo.cards[printKey]);
		}
	}
	return sheetMap;
}
function processPackDefinition(packString) {
	/*
		packString can be very simple or very complex
		an example packString is:
		
		7 Common
		3 Uncommon
		1 Rare (mr:0)
		1 Nonbasic (odds:100,0,0,0) (type:Land) (-type:Basic) (unslots)
		1 Wildcard (odds:50,30,20)
		1 Wildcard2 (odds:25,15,10,0,0,50) (-note:!fatereplaced) (+note:!fateadded)
		
		this contains six "slots" across 14 cards
		the two important pieces are the slotCount and slotName
		slotParams listed afterwards are optional
		
		default slots are Common, Uncommon, Rare, JustRare, Mythic, Masterpiece, Special, and Basic
			which get all cards with that rarity that aren't excluded by card notes
			with JustRare being exactly Rare rarity
			and Rare being both Mythic and Rare
		with special processing for slotnames that match /Wildcard/
			which includes all cards unless marked unwild
			and which uses a default but configurable distribution
		other slot names can be defined, but their cards must be defined as well
		either through slotParams or manual addition in card notes
		
		slot conditions can be
			"require", removing cards that fail the condition
			"reject", removing cards that meet the condition
			"reinstate", readding cards that meet a condition
		slot conditions are "require" by default, changed with a character before the slotParam name
		"reject" uses a leading -, "reinstate" a leading +
		
		currently supported conditions include
		type, notes, shape, frame, include color, exclusive color, dfc
		
		additional slotParams:
		unslots
			cards that are part of this slot's sheet are removed from the default slots
		rm
			this can be 2:1, enforcing each rares to be twice as common as each mythic
			or a percentage of the time that the Rare slot is a Mythic Rare
		odds, weights
			these two are similar but slightly different
			they take a string in the form (#,#,#...)
			(Common, Uncommon, Rare, Mythic, Special, Masterpiece, Basic, Custom Slot 1, Custom Slot 2...)
			slots must be ordered, but can be cut off at any point. the rest will be 0
			odds will use these numbers as percentages a rarity is chosen
			weights will use these numbers as weights per specific card
			ex.
				example set has 5 commons, 20 uncommons, 10 rares, 5 mythics
				(weights:10,5,2,1) will produce a "sheet" of
					10x5 commons	(50)
					5x20 uncommons	(100)
					2x10 rares		(20)
					1x5 mythics 	(5)
					total			(175)
				the equivalent odds value for this would be
				(odds:28.6,57.1,11.4,2.9)
			there is not a functional difference in the two
				(other than odds will be scaled to 100% if it does not add up to it)
			both are provided so the user can present the data in whichever form is easier for the set
		reads
			allows odds/weights to pull from other named slots, ie (reads:Nonbasic)
			these will be put in order after the defaults
			(reads:Nonbasic) (reads:Timeshifted)
			will result in (...Masterpiece, Basic, Nonbasic, Timeshifted)
			reads are read from the end of the array, example:
			(odds:80,15,5) (reads:Nonbasic) (reads:Timeshifted) will be 90% common, 15% nonbasic, 5% timeshifted
			the slot must be defined before this one to prevent dependency loops
			reads does not inherently add that to that slot
		conflict
			defines how a card that matches multiple read slots functions
			by default, a card will only count to its first read slot
			"last" changes it to only the last read slot
			"readonly" changes it to all read slots 
			"combine" changes it to all slots
		duplicates
			defines how weighting for a card with multiple prints in a slot works
			by default, multiple cards increases the odds it is pulled, like Wastes
			"share" changes it to normalize the odds, like Brothers Yamazaki and Showcases
		
		example complex packStrings:
		Murders at Karlov Manor Play Booster
		6 Common
		3 Uncommon
		1 Rare (rm:13.5)
		0 Nonbasic (r:rare) (t:Land)
		1 Wildcard (58.33,14.58,8.93,1.49,16.67) (reads:Nonbasic)
		1 Wildcard2 (60,25,13.135,1.865)
		0 TheListCommon (note:!thelist) (r:common) (+r:uncommon) (unslots)
		0 TheListRare (r:rare) (+r:mythic) (+note:!thelist) (unslots)
		0 SpecialGuest (+note:!specialguest) (unslots)
		1 ListSlot (odds:87.5,9.375,1.5625,1.5625) (r:common) (+note:!specialguest) (+note:!thelist) (reads:TheListCommon) (reads:TheListRare) (reads:SpecialGuest)
	*/
	if(packString.match(/^Play ?Booster$/i)) {
		packString = `7 Common\n3 Uncommon\n1 Rare (rm:13.5)\n1 Wildcard\n1 Wildcard2`;
	}
	if(packString.match(/^Draft ?Booster$/i)) {
		packString = `10 Common\n3 Uncommon\n1 Rare (rm:13.5)`;
	}
	let slots = packString.split("\n");
	let sheetMap = {};
	for(let s in slots) {
		let slot = slots[s];
		let slotMatch = slot.match(/^([0-9]+)x? ([^ ]+)(.*)/);
		if(!slotMatch) {
			userWarning(`Unmatched Slot definition: ${slot}`);
			continue;
		}
		let slotCount = slotMatch[1];
		let slotName = slotMatch[2];
		let slotParams = slotMatch[3];
		let unslots = false;
		let unwilds = false;
		let standard = true;
		let duplicates_share = false;
		let rate_numbers = [];
		let rate_kind = "";
		let reads = [];
		let read_conflict = "last";
		let last_reinstate = 0;
		let checks = [];
		// default slots
		switch(slotName) {
			case "Common":
			case "Uncommon":
			case "Special":
			case "Masterpiece":
				checks = [{field: "rarity", value:slotName.toLowerCase(), method:"require"},{field: "slotted", method:"require"}];
				break;
			case "Mythic":
				checks = [{field: "rarity", value:"mythic rare", method:"require"},{field: "slotted", method:"require"}];
				break;
			case "Basic":
				checks = [{field: "rarity", value:"basic land", method:"require"},{field: "slotted", method:"require"}];
				break;
			case "JustRare":
				checks = [{field: "rarity", value:"rare", method:"require"},{field: "slotted", method:"require"}];
				break;
			case "Rare":
				checks = [{field: "rarity", value:"rare", method:"require"},{field: "rarity", value:"mythic rare", method:"reinstate"},{field: "slotted", method:"require"}];
				last_reinstate = 1;
				// default to 2:1 weighting
				rate_numbers = [0, 0, 2, 1];
				rate_kind = "weights";
				break;
			default:
				standard = false;
				if(slotName.match(/Wildcard/)) {
					checks = [{field:"wildable", method:"require"}];
					if(slotName == "Wildcard2") {
						rate_numbers = [60, 25, 12.86, 2.14];
						rate_kind = "odds";
					}else{
						rate_numbers = [70, 17.5, 10.714, 1.786];
						rate_kind = "odds";
					}
					// these rates can be overwritten below
				}
				break;
		}
		if(slotParams) {
			// read each block of ()s
			// this doesn't allow for escaping
			// it shouldn't need to, but here's where to edit if we do
			let paramsMatch = slotParams.match(/[(][^)]+[)]/g);
			for(let p in paramsMatch) {
				let argMatch = paramsMatch[p].match(/^[(]([+-])?([^):]+):?([^)]*)[)]/);
				if(!argMatch) {
					userWarning(`Unreadable Parameter definition: ${paramsMatch[p]}`);
					continue;
				}
				let modifier = argMatch[1];
				let parameter = argMatch[2].toLowerCase();
				let argument = argMatch[3];
				let checker = {};
				if(argument)
					checker.value = argument;
				switch(parameter) {
					case "type":
					case "t":
						checker.field = "type";
						break;
					case "rarity":
					case "r":
						checker.field = "rarity";
						break;
					case "note":
					case "notes":
						checker.field = "notes";
						break;
					case "shape":
						checker.field = "shape";
						break;
					case "frame":
					case "template":
						checker.field = "template";
						break;
					case "include color":
					case "includecolor":
					case "include-color":
					case "include_color":
						checker.field = "include color";
						break;
					case "exclusive color":
					case "exclusivecolor":
					case "exclusive-color":
					case "exclusive_color":
						checker.field = "exclusive color";
						break;
					case "dfc":
						checker.field = "shape";
						checker.value = "doubleface";
						break;
					case "unslot":
					case "unslots":
						unslots = true;
						break;
					case "unwild":
					case "unwilds":
						unwilds = true;
						break;
					case "odds":
					case "weights":
						rate_numbers = argument.split(/[:;,.\/|]/);
						rate_kind = parameter;
						break;
					case "rm":
						if(argument == "2:1" || argument == "2;1") {
							rate_numbers = [0, 0, 2, 1];
							rate_kind = "weights";
						}else{
							argument = parseFloat(argument.replace("%", ""));
							let rare_rate = 100 - argument;
							rate_numbers = [0, 0, rare_rate, argument];
							rate_kind = "odds";
						}
						break;
					case "reads":
						if(!sheetMap[argument]) {
							userWarning(`Slot ${argument} not found for "reads" definition in slot ${slot}. Reads slots must be defined before the slots reading them.`);
						}else{
							reads.push(argument);
						}
						break;
					case "duplicate":
					case "duplicates":
					case "dupe":
					case "dupes":
						// by default, multiple prnts of a card will be treated as different cards
						// and show up in packs more frequently
						// (duplicates:share) disables this
						if(argument == "share" || argument == "shared" || argument == "shares") {
							duplicates_share = true;
						}else if(argument != "add") {
							userWarning(`duplicate argument ${argument} not recognized. Supported arguments are "share", to share rates like Brothers Yamazaki, or the default "add", to increase the rate like Wastes.`);
						}
						break;
					case "readconflict":
					case "readsconflict":
					case "readconflicts":
					case "readsconflicts":
					case "conflict":
					case "conflicts":
						if(argument == "first" || argument == "combine" || argument == "readonly" || argument == "last") {
							read_conflict = argument;
						}else{
							userWarning(`read conflict argument ${argument} not recognized. Supported arguments are:`);
							userWarning(`last: card will count only in the last read slot that it matches (default)`);
							userWarning(`first: card will count only in the first read slot that it matches`);
							userWarning(`readonly: card will count in all read slots it mathes, but not the default rarity slot`);
							userWarning(`combine: card will count in all read slots it matches and the default rarity slot`);
						}
						break;
					default:
						userWarning(`Unsupported Parameter definition: ${paramsMatch[p]}`);
						break;
				}
				if(modifier == "+") {
					checker.method = "reinstate";
					last_reinstate = checks.length;
				}else if(modifier == "-") {
					checker.method = "reject";
				}else{
					checker.method = "require";
				}
				if(checker.field)
					checks.push(checker);
			}
		}
		let slotFunction = function(card) {
			let valid = 1; // uncertain
			for(let i=0; i<checks.length; i++) {
				let subvalid = applyCheck(card, checks[i]);
				if(subvalid) {
					if(checks[i].method == "reinstate") {
						valid = 2; // met a reinstate condition
					}else if(checks[i].method == "reject") {
						valid = 0; // met a reject condition
					}else if(valid != 0) {
						valid = 2;  // met a require condition and not rejected yet
					}
				}else{
					if(checks[i].method == "require") {
						valid = 0; // failed a require condition
					}
				}
				if(valid == 0 && i>=last_reinstate)
					break; // rejected and can't reverse it
			}
			return valid != 0;
		}
		
		sheetMap[slotName] = {
			name: slotName,
			count: slotCount,
			standard: standard,
			unslots: unslots,
			unwilds: unwilds,
			rates: rate_numbers,
			rate_kind: rate_kind,
			duplicates_share: duplicates_share,
			reads: reads,
			read_conflict: read_conflict,
			check: slotFunction,
			cards: {}
		}
	}
	return sheetMap;
}
function applyCheck(card, check) {
	let fits = false;
	let mix = "";
	switch(check.field) {
		case "rarity":
		case "shape":
		case "template":
			fits = card[check.field] == check.value;
			break;
		case "type":
			mix = card.typeLine;
			if(card.hasOwnProperty("type_2"))
				mix += " // " + card.typeLine2;
			fits = !!mix.match(check.value);
			break;
		case "notes":
			fits = card.notes.includes(check.value);
			break;
		case "include color":
			fits = card.color.toLowerCase().match(check.value);
			break;
		case "exclusive color":
			if(check.value == "multicolor") {
				fits = !!card.color.match("/");
			}else{
				fits = card.color.toLowerCase() == `{${check.value.toLowerCase()}} `;
			}
			break;
		case "slotted":
			fits = !card.unslot;
			break;
		case "wildable":
			fits = !card.unwild;
			break;
	}
	return fits;
}
// build Draftmancer
function writeDraftmancer() {
	let biggest_slot = 0;
	for(let slotKey in sheetMap) {
		if(sheetMap[slotKey].count > biggest_slot)
			biggest_slot = sheetMap[slotKey].count;
	}

	let str = "";
	// settings
	str += "[Settings]\n{\n";
	if(biggest_slot > 7)
		str += `	"colorBalance": false,\n`;
	str += `	"name": "${SETNAME}"\n`;
	str += "}\n";
	// custom cards
	str += "[Custom Cards]\n[";
	for(let printKey in cardDatabase) {
		let card = cardDatabase[printKey];
		//card.imgName = card.cardName;
		//if(card.cardName2)
		//	card.imgName2 = card.cardName2;
		if(card.setID == "tokens")
			continue;
		if(card.shape == "doubleface") {
			str += writeDraftmancerDFC(card);
		}else if(card.shape == "split") {
			str += writeDraftmancerSplit(card);
		}else{
			str += writeDraftmancerCard(card);
		}
	}
	str = str.replace(/,$/, "");
	str += "\n]\n";
	// pack slots
	for(let slotKey in sheetMap) {
		let slotInfo = sheetMap[slotKey];
		if(slotInfo.count == 0)
			continue;
		str += `[${slotInfo.name} (${slotInfo.count})]`;
		for(let printKey in slotInfo.cards) {
			if(slotInfo.cards[printKey] != 0) {
				str += `\n${slotInfo.cards[printKey]} ${cardDatabase[printKey].cardName} (${cardDatabase[printKey].setID}) ${cardDatabase[printKey].cardID}`
			}
		}
	}
	fs.writeFile(`./${SETCODE}-draftmancer.txt`, str, (err) => {
		userLogging("dm", `Draftmancer file saved as ${SETCODE}-draftmancer.txt`);
	})
}
function imageLink(imgname) {
	return `https://raw.githubusercontent.com/${config.username}/mse-playtesting/${BRANCHNAME}/Cockatrice/data/pics/downloadedPics/${SETCODE}/${imgname}${IMGTYPE}`;
}
function writeDraftmancerCard(card) {
	let str = "\n";
	str += `	{\n`;
	str += `		"name": "${card.cardName}",\n`;
	str += `		"rarity": "${card.rarity}",\n`;
	str += `		"set": "${card.setID}",\n`;
	str += `		"collector_number": "${card.cardID}",\n`;
	str += `		"mana_cost": "${card.manaCost}",\n`;
	str += `		"type": "${card.typeLine}",\n`;
	str += `		"image_uris": {\n`;
	str += `			"en": "${imageLink(card.imgName)}"\n`;
	str += `		}\n`;
	str += `	},`;
	return str;
}
function writeDraftmancerDFC(card, linkStr) {
	let str = "\n";
	str += `	{\n`;
	str += `		"name": "${card.cardName}",\n`;
	str += `		"rarity": "${card.rarity}",\n`;
	str += `		"set": "${card.setID}",\n`;
	str += `		"collector_number": "${card.cardID}",\n`;
	str += `		"mana_cost": "${card.manaCost}",\n`;
	str += `		"type": "${card.typeLine}",\n`;
	str += `		"image_uris": {\n`;
	str += `			"en": "${imageLink(card.imgName)}"\n`;
	str += `		},\n`;
	str += `		"back": {\n`;
	str += `			"name": "${card.cardName2}",\n`;
	str += `			"mana_cost": "${card.manaCost2}",\n`;
	str += `			"type": "${card.typeLine2}",\n`;
	str += `			"image_uris": {\n`;
	str += `				"en": "${imageLink(card.imgName2)}"\n`;
	str += `			}\n`;
	str += `		}\n`;
	str += `	},`;
	return str;
}
function writeDraftmancerSplit(card, linkStr) {
	let str = "\n";
	str += `	{\n`;
	str += `		"name": "${card.cardName} // ${card.cardName2}",\n`;
	str += `		"rarity": "${card.rarity}",\n`;
	str += `		"set": "${card.setID}",\n`;
	str += `		"collector_number": "${card.cardID}",\n`;
	str += `		"mana_cost": "${card.manaCost} // ${card.manaCost2}",\n`;
	str += `		"type": "${card.typeLine}${(card.typeLine == card.typeLine2 ? "" : " // " + card.typeLine2)}",\n`;
	str += `		"image_uris": {\n`;
	str += `			"en": "${imageLink(card.imgName)}"\n`;
	str += `		}\n`;
	str += `	},`;
	return str;
}
// build Planesculptors
function writePlanesculptors() {
	let str = config.set_title + "\n1.0\n";
	for(let printKey in cardDatabase) {
		let card = cardDatabase[printKey];
		str += "\n";
		// shape
		if(card.shape == "doubleface") {
			str += "double\n";
		}else if(card.shape == "aftermath" || card.shape == "adventure") {
			str += "vsplit\n";
		}else if(card.shape == "battle" || card.shape == "plane card") {
			str += "plane\n";
		}else if (card.shape == "split"){
			str += "split\n";
		}else{
			str += "normal\n";
		}
		// card number
			str += card.collNo + "\n";
		// mv
			str += card.cmc + "\n";
		// rarity
		if(card.rarity == "masterpiece" || card.rarity == "bonus") {
			str += "special\n";
		}else if(card.rarity == "token") {
			str += "common\n";
		}else{
			str += card.rarity + "\n";
		}
		// Name
			str += card.imgName + "\n";
		// color
			str += restringifyMana(card.color, card.manaCost, card.typeLine) + "\n";
		// mana cost
			str += symbolsToHTML(card.manaCost) + "\n";
		// type
			str += card.typeLine + "\n";
		// power
			str += card.power + "\n";
		// toughness
			str += card.toughness + "\n";
		// Rules
			str += textToHTML(card.rulesText);
			if(card.loyalty)
				str += "///br///Starting loyalty: " + card.loyalty;
			str += "\n";
		// flavor
			str += textToHTML(card.flavorText) + "\n";
		// illustrator
			str += xmlEscape(card.artist) + "\n";
		// name 2
			str += (card.cardName2 || "") + "\n";
		// color 2
			str += restringifyMana(card.color2, card.manaCost2, card.typeLine2) + "\n";
		// mana cost 2
			str += symbolsToHTML(card.manaCost2) + "\n";
		// type 2
			str += (card.typeLine2 || "") + "\n";
		// power 2
			str += (card.power2 || "") + "\n";
		// toughness 2
			str += (card.toughness || "") + "\n";
		// rules 2
			str += textToHTML(card.rulesText2 || "");
			if(card.loyalty2)
				str += "///br///Starting loyalty: " + card.loyalty2;
			str += "\n";
		// flavor 2
			str += textToHTML(card.flavorText2) + "\n";
		// illus 2
			str += xmlEscape(card.artist2 || "") + "\n";
		str += "===========";
	}
	fs.writeFile(`./${psFolder}set.txt`, str, () => {})
	writePlanesculptorsPacks();
}
function writePlanesculptorsPacks() {
	for(let slotKey in sheetMap) {
		sheetMap[slotKey].mirrorcards = JSON.parse(JSON.stringify(sheetMap[slotKey].cards));
	}
	let common_slot = [0, ""];
	for(let slotKey in sheetMap) {
		if(sheetMap[slotKey].count > common_slot[0])
			common_slot = [sheetMap[slotKey].count, slotKey];
	}
	let color_balance = false;
	if(common_slot[0] > 6)
		color_balance = true;
	let packs = [];
	let pack_count = 1000;
	for(let i=0; i<pack_count; i++) {
		packs.push([]);
	}
	
	for(let slotKey in sheetMap) {
		let count = Object.keys(sheetMap[common_slot[1]].cards).length;
		let expected_of_each = 4 * Math.round((pack_count * sheetMap[common_slot[1]].count) / count);
		for(let printKey in sheetMap[slotKey].mirrorcards) {
			sheetMap[slotKey].mirrorcards[printKey] = expected_of_each;
		}
	}
	
	if(color_balance) {
		let map = {
			"{White} ": [],
			"{Blue} ": [],
			"{Black} ": [],
			"{Red} ": [],
			"{Green} ": [],
			"Other": []
		}
		for(let printKey in sheetMap[common_slot[1]].cards) {
			let card = cardDatabase[printKey];
			if(map[card.color]) {
				map[card.color].push(printKey);
			}else{
				map["Other"].push(printKey);
			}
		}
		
		for(let c in map) {
			for(let i = 0; i<pack_count; i++) {
				if(map[c].length == 0)
					break;
				let rolling = i%map[c].length;
				if(rolling == 0) {
					map[c] = shuffleArray(map[c]);
				}
				let printKey = map[c][rolling];
				packs[i].push(""+printKey);
				sheetMap[common_slot[1]].mirrorcards[printKey]--;
				if(sheetMap[common_slot[1]].mirrorcards[printKey] == 0) {
					map[c].splice(rolling, 1);
				}
			}
		}
	}
	// fill the rest of greatest slot
	let the_array = [];
	for(let printKey in sheetMap[common_slot[1]].mirrorcards) {
		for(let i=0; i<sheetMap[common_slot[1]].mirrorcards[printKey]; i++) {
			the_array.push(""+printKey);
		}
	}
	// fill to expected numbers
	for(let i=0; i<pack_count; i++) {
		if(the_array.length == 0)
			break;
		while(packs[i].length < sheetMap[common_slot[1]].count) {
			let r = rand(the_array.length-1);
			let printKey = the_array[r];
			let loops = 0;
			while(packs[i].includes(printKey)) {
				r = rand(the_array.length-1);
				printKey = the_array[r];
				loops++;
				if(loops > 20)
					break;
			}
			packs[i].push(""+printKey);
			the_array.splice(r, 1);
		}
	}
	// if we don't make expected, fill with random
	let commons = Object.keys(sheetMap[common_slot[1]]);
	for(let i=0; i<pack_count; i++) {
		if(packs[i].length == sheetMap[common_slot[1]].count)
			continue;
		let r = rand(the_array.length-1);
		let printKey = commons[r];
		let loops = 0;
		while(packs[i].includes(printKey)) {
			r = rand(the_array.length-1);
			printKey = commons[r];
			loops++;
			if(loops > 20)
				break;
		}
		packs[i].push(""+printKey);
	}
	// loop the rest better
	for(let slotKey in sheetMap) {
		if(slotKey == common_slot[1])
			continue;
		let the_array = [];
		let options = Object.keys(sheetMap[slotKey].cards);
		let expected_of_each =  Math.round((pack_count * sheetMap[slotKey].count) / options.length);
		for(let printKey in sheetMap[slotKey].cards) {
			let expect = sheetMap[slotKey].cards[printKey] * expected_of_each;
			for(let i=0; i<expect; i++) {
				the_array.push(printKey);
			}
		}
		for(let i=0; i<pack_count; i++) {
			for(let j=0; j<sheetMap[slotKey].count; j++) {
				let r = rand(the_array.length-1);
				let printKey = the_array[r];
				let loops = 0;
				while(packs[i].includes(printKey)) {
					r = rand(the_array.length-1);
					printKey = the_array[r];
					loops++;
					if(loops > 20)
						break;
				}
				packs[i].push(printKey);
				the_array.splice(r, 1);
				if(the_array.length == 0)
					the_array = JSON.parse(JSON.stringify(options));
			}
		}
	}
	let str = "";
	for(let i=0; i<pack_count; i++) {
		for(let p in packs[i]) {
			str += `${cardDatabase[packs[i][p]].imgName}\n`;
		}
		str += "===========\n";
	}
	fs.writeFile(`./${psFolder}packs.txt`, str, () => {
		userLogging("ps",`Planesculptors files saved in ${psFolder} with its images.`);
	})
}
function restringifyMana(cString, cost, type) {
	if(!cString)
		return "";
	let colors = [];
	if(cString.match("White"))
		colors.push("white");
	if(cString.match("Blue"))
		colors.push("blue");
	if(cString.match("Black"))
		colors.push("black");
	if(cString.match("Red"))
		colors.push("red");
	if(cString.match("Green"))
		colors.push("green");
	if(colors.length > 1 && cost.match("/")) {
		colors.push("hybrid");
	}else if(colors.length > 1) {
		colors.push("multicolor");
	}
	if(type.match("Artifact"))
		colors.push("artifact");
	if(!colors.length)
		return "";
	return colors.join(", ");
}
function symbolsToHTML(str, span) {
	//<img src='magic-mana-small-1.png' alt='1' width='14' height='14'>
	//<img src='magic-mana-small-WU.png' alt='W/U' width='16' height='16'>
	if(!str)
		return "";
	if(span) {
		str = str.replace(/[{][^ ]+[}]/g, function(match) {
			return '<span class="symbol">' + match + '</span>';
		})
	}
	return str.replace(/[{]([WUBRGSCHPXYZ0-9/]+)[}]/g, function(match, _1) {
		let cut = _1.replace("/", "");
		let width = 14;
		if(_1 != cut)
			width = 16;
		return `<img src='magic-mana-small-${cut}.png' alt='${_1}' width='${width}' height='${width}'>`;
	});
}
function xmlEscape(str) {
	if(!str)
		return "";
	str = str.replace(/[+]/g, "+");
	return str.replace(/[^A-z0-9<>\\\/++={}<>,. !?:()-]/g, function(match) {
		return "&#" + match.charCodeAt(0) + ";";
	})
}
function textToHTML(str) {
	if(!str)
		return "";
	str = str.replace(/[*]([^*]+)[*]/g, function(match, _1) {
		return "<i>" + _1 + "</i>";
	})
	str = str.replace(/\n$/, "");
	str = str.replace(/\n/g, "<br>///br///");
	str = xmlEscape(str);
	str = symbolsToHTML(str, true);
	return str;
}
function shuffleArray(array) { 									//shuffles arrays
    let counter = array.length;
    while (counter > 0) { 								// While there are elements in the array
        let index = Math.floor(Math.random() * counter);// Pick a random index
		counter--;										// Decrease counter by 1
        let temp = array[counter]; 						// And swap the last element with it
        array[counter] = array[index];
        array[index] = temp;
    }
    return array;
}
// Jimp
async function imageManager() {
	psFolder = `${SETCODE}ps/`
	ibbFolder = `${SETCODE}ibb/`
	if(masterObject.planesculptors) {
		if(masterObject.field_test) {
			// PS goes to a new PS folder
			if(!fs.existsSync(`${SETCODE}ps`))
				fs.mkdirSync(`${SETCODE}ps`);
		}else{
			// rename originalFolder to ps
			if(fs.existsSync(`${SETCODE}ps`))
				await fs.rm(`${SETCODE}ps`, {recursive:true}, () => {});
			fs.renameSync(originalFolder.replace("/", ""), `${SETCODE}ps`);
			originalFolder = psFolder;
		}
	}
	if(masterObject.imgBB && !fs.existsSync(`${SETCODE}ibb`))
		fs.mkdirSync(`${SETCODE}ibb`);
	triceFolder = `Cockatrice/data/pics/downloadedPics/${SETCODE}/`;
	let cardCount = 0, dfcCount = 0, tokenCount = 0;
	for(let printKey in cardDatabase) {
		cardCount++;
		if(cardDatabase[printKey].shape == "doubleface")
			dfcCount++;
		if(cardDatabase[printKey].setID == "tokens")
			tokenCount++;
	}
	let imgCount = 0;
	if(masterObject.cockatrice || masterObject.draftmancer)
		imgCount += cardCount;
	if(masterObject.planesculptors) {
		imgCount += cardCount;
		if(!config.ps_tokens)
			imgCount -= tokenCount;
	}
	if(masterObject.imgBB)
		imgCount += cardCount;
	cardDatabase[Object.keys(cardDatabase)[cardCount-1]].is_last = true;
	userCounting("images", "Managing images... ", imgCount, () => {
		if(!masterObject.field_test && !masterObject.planesculptors) {
			// we can get rid of this folder afterwards
			fs.rm(originalFolder.replace('/', ''), {recursive:true}, () => {});
		}
	});
	for(let printKey in cardDatabase) {
		imageDistributor(cardDatabase[printKey]);
	}
}
function imageDistributor(card, retried) {
	let currentFile = `${originalFolder}${card.cardID}${IMGTYPE}`
	Jimp.read(currentFile, async function(err, img) {
		if(err) {
			if(retried) {
				userWarning(`Failed to copy image ${card.imgName} (${card.cardID}).`);
			}else{
				imageDistributor(card, retried);
			}
		}else{
			// split to trice
			let send_to = triceFolder;
			if(card.setID == "tokens")
				send_to = triceTokensFolder;
			if(masterObject.cockatrice || masterObject.draftmancer) {
				if(card.shape == "doubleface") {
					let i = await splitImage(img, [send_to+card.imgName+IMGTYPE,send_to+card.imgName2+IMGTYPE], card.typeLine2.match(wide_types));
					userCounting("images", "Managing images... ");			
				}else{
					let i = await img.clone().write(send_to+card.imgName+IMGTYPE);
					userCounting("images", "Managing images... ");			
				}
			}
			// fork/split to ibb
			if(masterObject.imgBB) {
				if(card.shape == "doubleface") {
					let i = await splitImage(img, [ibbFolder+card.imgLink+IMGTYPE,triceFolder+card.imgLink2+IMGTYPE], card.typeLine2.match(wide_types));
					userCounting("images", "Managing images... ");			
				}else{
					let i = await img.clone().write(ibbFolder+card.imgName+IMGTYPE);
					userCounting("images", "Managing images... ");			
				}
			}
			// fork to PS or rename
			if(masterObject.planesculptors) {
				let imageName = card.imgName;
				if(card.setID == "tokens")
					imageName = card.key;
				if(card.setID == "tokens" && !config.ps_tokens) {
					// don't fork this
				}
				else if(masterObject.field_test) {
					let i = await img.clone().write(psFolder+imageName+IMGTYPE);
					userCounting("images", "Managing images... ");
				}else{
					let i = await fs.rename(currentFile, originalFolder+imageName+IMGTYPE);
					userCounting("images", "Managing images... ");
				}			
			}
			if(card.is_last) {
				if(loggerMap["images"].current != loggerMap["images"].max) {
					loggerMap["images"].current = loggerMap["images"].max - 1;
					userCounting("images", "Managing images... ");
				}
			}
		}
	})
	
}
async function splitImage(img, names, b2) {
	let coords = calcDFCCoordinates(img.bitmap.width, img.bitmap.height, b2);
	let i = await img.clone().crop(
		coords[0].left,
		coords[0].top,
		coords[0].width,
		coords[0].height
	).write(names[0]);
	let j = await img.clone().crop(
		coords[1].left,
		coords[1].top,
		coords[1].width,
		coords[1].height
	).write(names[1]);
}
function calcDFCCoordinates(bw, bh, b2) {
	if(bw == 752 && bh == 523) {
		return [
			{
				left: 0,
				top: 0,
				width: 375,
				height: 523
			},
			{
				left: 377,
				top: 0,
				width: 375,
				height: 523
			}
		]
	}
	else if(bw == 1492 && bh == 1039) {
		return [
			{
				left: 0,
				top: 0,
				width: 744,
				height: 1039
			},
			{
				left: 748,
				top: 0,
				width: 744,
				height: 1039
			}
		]
	}
	else if(bw == 1504 && bh == 1046) {
		return [
			{
				left: 0,
				top: 0,
				width: 750,
				height: 1046
			},
			{
				left: 754,
				top: 0,
				width: 750,
				height: 1046
			}
		]
	}
	else{
		let multi = (bh / card_height);
		let ratio = bw / bh;
		card_height = bh;
		card_width *= multi;
		if(1.4 <= ratio && ratio <= 1.6) {
			// double normal
			return [
				{
					left: 0,
					top: 0,
					width: card_width,
					height: card_height
				},
				{
					left: bw - card_width,
					top: 0,
					width: card_width,
					height: card_height
				}
			]
		}
		else if(1.6 < ratio && ratio <= 1.75) {
			// battle/normal
			if(b2) {
				// normal/battle
				return [
					{
						left: 0,
						top: 0,
						width: card_width,
						height: card_height
					},
					{
						left: bw - card_width,
						top: Math.round(bh - (card_width/2)),
						width: card_height,
						height: card_width
					}
				]
			}else{
				// battle/normal
				return [
					{
						left: 0,
						top: Math.round(bh - (card_width/2)),
						width: card_height,
						height: card_width
					},
					{
						left: bw - card_height,
						top: 0,
						width: card_width,
						height: card_height
					}
				]
			}
		}
		else if(ratio > 1.75) {
			// battle/battle
			return [
				{
					left: 0,
					top: Math.round(bh - (card_width/2)),
					width: card_height,
					height: card_width
				},
				{
					left: bw - card.height,
					top: Math.round(bh - (card_width/2)),
					width: card_height,
					height: card_width
				}
			]
		}
		else{
			return [
				{
					left: 0,
					top: 0,
					width: Math.round(bw/2),
					height: bh
				},
				{
					left: bw - Math.round(bw/2),
					top: 0,
					width: Math.round(bw/2),
					height: bh					
				}
			]
		}
	}
}

loadConfig();