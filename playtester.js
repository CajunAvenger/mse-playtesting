var fs = require('fs-extra');
var packSlotsModule = require('./packSlots.js');

// read directory
// find [name]-files folder
// read [name].txt
// process cards
//// check draftmancer, cockatrice
//// process packs
//// check draftmancer, cockatrice, field test
//// split and fork to [name]-split (unlink first)
//// check draftmancer
//// add [name]-draftmancer.txt
//// check planesculptors
//// fork to [name]-planesculptors (unlink first)
//// add set.txt
//// add packs.txt

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
			
			let exportedName = fileName.replace(/-files/, "");
			processExportedFile(`./${exportedName}.txt`);
			found = true;
			break;
		}
		if(!found) {
			console.log(`Could not find exported file. Make sure you have an "[name].txt" file and "[name]-files" folder with matching names.`);
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
			console.log("Error reading exported file:");
			console.log(err);
			return;
		}
		let masterObject;
		try {
			masterObject = JSON.parse(data);
		}catch(e) {
			console.log("Error parsing exported file:");
			console.log(e);
		}
		if(!masterObject)
			return;
		// process notes and things from mse
		let cardDatabase = processExportedCards(masterObject);
		// process sheet data for packs
		let BUILD_PACKS = (masterObject.draftmancer || masterObject.planesculptors);
		if(BUILD_PACKS) {
			processPackSheets(masterObject.pack_string, cardDatabase);
		}
	})
	
}
function processExportedCards(masterObject) {
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
				card.rarityLine = `*${card.setID} ${card.rarity.charAt(0).toUpperCase}*`;
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
	
	let database = {};
	let chunks = [mainset, specials, tokens];
	for(let c in chunks) {
		let group = chunks[c];
		for(let g in group) {
			let card = group[g];
			let fullname = card.cardName;
			if(card.cardName2)
				fullname += "//" + card.cardName2;
			card.fullName = fullname;
			card.prints = [fullname];
			
			let test = database[fullname];
			if(test) {
				let tag = "_" + test.prints.length;
				let database_name = fullname + tag;
				database[database_name] = card;
				test.prints.push(database_name);
				for(let p in test.prints) {
					let print_key = test.prints[p];
					database[print_key].prints = test.prints;
				}
			}else{
				database[fullname] = card;
			}
		}
	}
	
	return database;
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
function processPackSheets(packString, cardDatabase) {
	// given a packString that describes the slots for this set's pack
	// and the processed LackeyBot cardDatabase
	// first we convert the pack description into an object
	// adding sheetMap[slot].check(card) which verifies if the card is valid for that slot
	// next we compile which slots each card can belong to
	// we return the sheets and build the pack files in other functions

	let sheetDatabase = {};
	let sheetMap = processPackDefinition(packString);
	for(let printKey in cardDatabase) {
		let card = cardDatabase[printKey];
		if(card.rarity == "token")
			continue;
		
	}
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
					1x5 mythics 	(5)
					2x10 rares		(20)
					5x20 uncommons	(100)
					10x5 commons	(50)
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
			the slot must be defined before this one to prevent dependency loops
				
	*/
	let slots = packString.split("\n");
	let sheetMap = {};
	for(let s in slots) {
		let slot = slots[s];
		let slotMatch = slot.match(/^([0-9]+) ([^ ]+)(.*)/);
		if(!slotMatch) {
			console.log(`Unmatched Slot definition: ${slot}`);
			continue;
		}
		let slotCount = slotMatch[1];
		let slotName = slotMatch[2];
		let slotParams = slotMatch[3];
		let unslots = false;
		let rate_numbers = [];
		let rate_kind = "";
		let reads = [];
		let last_reinstate = 0;
		let checks = [];
		// default slots
		switch(slotName) {
			case "Common":
			case "Uncommon":
			case "Mythic":
			case "Special":
			case "Masterpiece":
				checks = [{field: "rarity", value:slotName.toLowerCase(), method:"require"},{field: "slotted", method:"require"}];
				break;
			case "Basic":
				checks = [{field: "rarity", value:"basic land", method:"require"},{field: "slotted", method:"require"}];
				break;
			case "JustRare":
				checks = [{field: "rarity", value:"rare", method:"require"},{field: "slotted", method:"require"}];
				break;
			case "Rare":
				checks = [{field: "rarity", value:"rare", method:"require"},{field: "rarity", value:"rare", method:"reinstate"},{field: "slotted", method:"require"}];
				last_reinstate = 1;
				break;
			default:
				if(slotName.match(/Wildcard/)) {
					checks = [{field:"wildable", method:"require"}];
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
					console.log(`Unreadable Parameter definition: ${paramsMatch[p]}`);
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
							console.log(`Slot ${argument} not found for "reads" definition in slot ${slot}. Reads slots must be defined before the slots reading them.`);
						}else{
							reads.push(argument);
						}
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
			unslots: unslots,
			rates: rate_numbers,
			rate_kind: rate_kind,
			reads: reads,
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
		case "shape":
			fits = card.shape == check.value;
			break;
		case "type":
			mix = card.type;
			if(card.hasOwnProperty("type_2"))
				mix += " // " + card.type_2;
			fits = mix.match(check.value);
			break;
		case "notes":
			fits = card.notes.includes(check.value);
			break;
		case "template":
			fits = card.template == check.value;
			break;
		case "include color":
			fits = card.color.toLowerCase().match(check.value);
			break;
		case "exclusive color":
			if(check.value == "multicolor") {
				fits = card.color.match("/");
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
findExportedFile()