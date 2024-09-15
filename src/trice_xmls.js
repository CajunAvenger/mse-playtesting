/*
	Rick
	Handles Cockatrice interactions
*/

// global vars
var token_map = {};
/*
	{
		
		"2/2 green Wolf": {
			"AFM": ["Wolf_TKN_AFM"],
			"MS3": ["Wolf_TKN_MS3", "Wolf 2_TKN_MS3"],
			"SL90": ["Wolf (SL90)_TKN_LAIR"]
		}
	}
*/
var claimed_tokens = {};
/*
	{
		"Wolf_TKN_AFM": {
			"Wolfy McWolferson_AFM: [
				1, 3
			]
		}
	}
*/
var cardless_tokens = {};
/*
	{
		"2/3 green Wolf creature": {
			"Wolfy McWolferson_AFM": "2/3 green Wolf creature"
		}
	}
*/
var unclaimed_tokens = {};
var broken_tokens = [];
var broken_conjure = [];
var with_spellbooks = [];

// big ugly regexes
var globalMatch;	// /token regex/ig
var captureMatch;	// /token regex/i
var slimCapture;	// modified for <name>, a legendary...
var splitMatch;		// break up multipart token creation

// tokens worded as "Create a X token" instead of the normal ways
var predef = [];
// false positives
var fake_tokens = [];
// tokens that exist but aren't used by anything, dummied out, don't add to unclaimed tokens
var dummied = [];

// SETUP
// set up the regexes
function initialize(opts) {
	let tknr = tokenRegex();
	globalMatch = new RegExp(tknr, 'ig');
	captureMatch = new RegExp(tknr);
	slimCapture = new RegExp(tokenRegex(true), 'i');
	splitMatch = /((?:, |, and | and | or )(?:X|a number of|that many|a|an|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty) [XYZ0-9]+\/[XYZ0-9]+)/g;

	token_map = {};
	cardless_tokens = {};
	claimed_tokens = {};
	unclaimed_tokens = [];
	broken_tokens = [];
	broken_conjure = [];
	with_spellbooks = [];
	
	predef = [
		"Food", "Clue", "Gold", "Idol", "Treasure", "Vessel",
		"Vial", "Treasure Clue", "Bullet", "Canister", "Powerstone",
		"Plains", "Island", "Swamp", "Mountain", "Forest",
		"Scout Role", "Warlock Role", "Cleric Role", "Wizard Role", "Warrior Role",
		"Solidarity", "Weapon"
	];
	fake_tokens = [
		// whenever you create a ...
		"a token",
		"an artifact token",
		"an Aura token",
		"a creature token",
		"an enchantment token",
		"a noncreature token",
		//audition reminder text
		"a 1/1 Construct Actor creature token"
	];
	dummied = [
		"Rat_TKN_GNJ",
		"Samurai_TKN_IMP",
		"Saproling_TKN_MS2",
		"Saproling_TKN_MPS_MSE",
		"Saproling_TKN_CHAMPIONS",
		"Cat Warrior_TKN_CHAMPIONS",
		"Warrior_TKN_MS1",
		"Construct_TKN_MS1",
		"Dwarf Soldier_TKN_MS1",
		"Golem_TKN_MS1",
		"Nomad_TKN_MS1",
		"Nomad_TKN_MS2",
		"Gold_TKN_MS1",
		"Black Red Goblin_TKN_SOR",
		"Spirit_TKN_ZER",
		"first strike Soldier_TKN_RVO",
		"Haste Elemental_TKN_OTH",
		"Shapeshifter_TKN_OTH",
		"Zombie_TKN_LAW"
	];

	if(opts) {
		if(opts.newPredef)
			predef = opts.newPredef;
		if(opts.newFake)
			fake_tokens = opts.newFake;
		if(opts.newDummy)
			dummied = opts.newDummy;
		if(opts.addPredef) {
			for(let p in opts.addPredef) {
				predef.push(opts.addPredef[p]);
			}
		}
		if(opts.addFake) {
			for(let p in opts.addFake) {
				fake_tokens.push(opts.addFake[p]);
			}
		}
		if(opts.addDummy) {
			for(let p in opts.addDummy) {
				dummied.push(opts.addDummy[p]);
			}
		}
	}
}
// generate the token regexes
function tokenRegex(slim) {
	let legendName = "([A-Za-z,'-]+(,? [0-9A-Za-z,' -]+)?), ";
	let falsePositive = "[Ee]xile |[Ss]acrifice |on ";
	let tokenName_ = `(${legendName}|${falsePositive})?`
	let tokenCount = "\\b(X|X plus one|a number of|that many|a|an|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
	let tokenStatus = "( tapped| goaded)?( and attacking)?"
	let tokenSuper = "( legendary)?( basic)?( snow)? ?";
	let tokenPT = "([XYZ0-9]+\/[XYZ0-9]+ )?";
	let tokenColor = "(colorless|white|blue|black|red|green)?(, (?:white|blue|black|red|green),)?( and white| and blue| and black| and red| and green)? ?";
	let tokenSubtypes = "([A-Z][a-z]+)?( [A-Z][a-z]+)?( [A-Z][a-z]+)? ?";
	let tokenCardTypes = "(enchantment )?(artifact )?(land )?(creature )?"
	let tokenExtra = "( (with|named|that[’']s|that is|that are|attached|that can't block) [^\n.]+)?"
	
	let finalr = tokenName_ + tokenCount + tokenStatus + tokenSuper + tokenPT + tokenColor + tokenSubtypes + tokenCardTypes + "tokens?" + tokenExtra;
	if(slim) {
		finalr = tokenSuper + tokenPT + tokenColor + tokenSubtypes + tokenCardTypes + tokenExtra;
	}
	return finalr;

	//let tokenWith = "( with [^\n.]+)?";
	//let tokenNamed = "( named [^\n.]+)?";
	//let tokenMoreColors = "( (that's|that is|that are) (all colors|white, [^.]+|blue, [^.]+|black, [^.]+|red, [^.]+|green, [^.]+))?"
}

// TOKEN GENERATION
// process a library's tokens
function tokenBuilding(library, flags) {
	if(!flags)
		flags = {};
	
	// loop tokens to create token_map
	for(let c in library.cards) {
		if(library.cards[c].setID != "tokens")
			continue;
		
		// grab setID
		let originSet = library.cards[c].parentSet || "BOT";
		let altSet = "";
		let sltag = library.cards[c].fullName.match((/[(](SL[0-9]+)[)]/));
		if(sltag) {
			altSet = sltag[1];
		}
		
		let tokenName = tokenNamer(library.cards[c]);
		if(!token_map[tokenName])
			token_map[tokenName] = {}
		if(!token_map[tokenName][originSet])
			token_map[tokenName][originSet] = [];
		token_map[tokenName][originSet].push(c);
		let tokenNames = tokenAliases(library.cards[c]);
		for(let n in tokenNames) {
			let tokenName = tokenNames[n];
			if(!token_map[tokenName])
				token_map[tokenName] = {}
			if(!token_map[tokenName][originSet])
				token_map[tokenName][originSet] = [];
			if(!token_map[tokenName][originSet].includes(c))
				token_map[tokenName][originSet].push(c);
			if(altSet) {
				if(!token_map[tokenName][altSet])
					token_map[tokenName][altSet] = [];
				if(!token_map[tokenName][altSet].includes(c))
					token_map[tokenName][altSet].push(c);
			}
		}
	}
	
	// loop cards to find the tokens they want
	for(let c in library.cards) {
		let tokens = tokenPuller(library, c);
		if(tokens.length == 0) {
			// this doesn't create tokens
			if(library.cards[c].rulesText.match(/(?<!(When(ever)? (you|a player|an opponent) |If you would )[^,]*)\bcreates? (?![^ ]+ tokens? (that's|that is|that are) (a copy|copies))/i)) {
				// but looks like it should
				// good chance this is malformed syntax
				broken_tokens.push(c);
			}
		}
		if(library.cards[c].spellbook && library.cards[c].spellbook.length) {
			with_spellbooks.push(c);
		}
		else if(library.cards[c].rulesText.match(/conjure/)) {
			// this doesn't have a spellbook, but looks like it should
			broken_conjure.push(c);
		}
	}
	
	// determine unused tokens
	for(let tokenName in token_map) {
		for(let slotName in token_map[tokenName]) {
			let slot = token_map[tokenName][slotName];
			for(let index in slot) {
				let tokenID = slot[index];
				if(!claimed_tokens[tokenID]) {
					// this token card was never used
					if(dummied.includes(tokenID))
						continue; // and its a known dummied out token
					if(unclaimed_tokens.includes(tokenID))
						continue; // and we've already noted it?
					unclaimed_tokens.push(tokenID);
				}
			}
		}
	}
	
	return {
		xml: libraryToTokensXML(library, flags),
		report: tokenReport(library),
		details: {
			token_map: token_map,
			claimed_tokens: claimed_tokens,
			unclaimed_tokens: unclaimed_tokens,
			broken_tokens: broken_tokens,
			with_spellbooks: with_spellbooks,
			broken_conjure: broken_conjure
		}
	}
	
}
// write plaintext report of tokenBuilding results
function tokenReport(library) {
	let resp = "";
	let chunks = [];
	if(unclaimed_tokens.length) {
		let piece = "The following tokens are unused:";
		for(let i in unclaimed_tokens) {
			let id = unclaimed_tokens[i];
			let tn = tokenNamer(library.cards[id]);
			piece += `\n${tn} (${library.cards[id].cardID})`;
		}
		chunks.push(piece);
	}else{
		chunks.push("All tokens are used.");
	}

	let lc = {};
	for(let l in cardless_tokens) {
		for(let c in cardless_tokens[l]) {
			if(!lc[cardless_tokens[l][c]])
				lc[cardless_tokens[l][c]] = [];
			lc[cardless_tokens[l][c]].push(c);
		}
	}
	let lost = "";
	for(let l in lc) {
		lost += `\n${l} (`
		for(let c in lc[l]) {
			lost += library.cards[lc[l][c]].cardName + ";";
		}
		lost = lost.replace(/;$/, ")")
	}
	if(lost) {
		lost = "These tokens are created by cards, but do not have a token." + lost;
	}else{
		lost = "All created tokens are accounted for."
	}
	chunks.push(lost);

	if(broken_tokens.length) {
		let piece = "The following cards might create tokens, but were unable to be processed:\n";
		piece += broken_tokens.join("\n");
		chunks.push(piece);
	}else{
		chunks.push("No malformed tokens found.");
	}

	if(broken_conjure.length) {
		let piece = "\nThe following cards appear to conjure cards, but weren't linked to any:\n";
		piece += broken_conjure.join("\n");
		chunks.push(piece);
	}

	let asg = "\n\nASSIGNED TOKENS\n";
	for(let t in claimed_tokens) {
		let tn = tokenNamer(library.cards[t]);
		tn += ` (${library.cards[t].cardID})`;
		asg += tn + "\n";
		for(let id in claimed_tokens[t]) {
			let card = library.cards[id];
			asg += `${card.cardName} (${claimed_tokens[t][id].join(",")})\n`;
		}
		asg += "\n";
	}
	chunks.push(asg);
	
	if(with_spellbooks.length) {
		let piece = "\n\nASSIGNED CONJURES\n";
		for(let i in with_spellbooks) {
			let card = library.cards[with_spellbooks[i]];
			let sb = {};
			for(let c in card.spellbook) {
				if(!sb[card.spellbook[c]])
					sb[card.spellbook[c]] = 0;
				sb[card.spellbook[c]]++;
			}
			piece += card.cardName + ": ";
			for(let k in sb) {
				piece += `${k} (x${sb[k]}); `;
			}
			piece += "\n";
			// remove this from unused tokens
		}
		chunks.push(piece);
	}
	
	resp = chunks.join("\n\n");
	return resp;
}
// generate tokens created by a card
function tokenPuller(library, c, shout) {
	// BIG BAD CREATE TOKENS SCRIPT
	let thisCard = library.cards[c];
	let oracle = thisCard.rulesText
	if(thisCard.rulesText2)
		oracle += "\n" + thisCard.rulesText2;
	oracle = longformTokenization(oracle);
	let cleanoracle = oracle.replace(new RegExp(thisCard.cardName, 'i'), "~")
	if(thisCard.cardName2)
		cleanoracle = cleanoracle.replace(new RegExp(thisCard.cardName2, 'i'), "~")

	// grab sentences containing "creates"
	let bigMatch = oracle.match(/creates? [^.]+/ig);
	let tokens = [];
	if(bigMatch) {
		for(let m in bigMatch) {
			// each sentence
			let tokenLine = bigMatch[m].replace(/^creates? /i, "");
			let groups = tokenLine.match(globalMatch);
			let temp = [];
			// divide this sentence into individual token matches
			for(let g in groups) {
				if(groups[g].match(splitMatch)) {
					// this is multiple tokens that looks like one
					let splitten = groups[g].split(splitMatch);
					groups[g] = splitten[0];
					for(let j=1; j<splitten.length; j+=2) {
						groups.push(splitten[j]+splitten[j+1]);
					}
				}
			}
			// check each token match
			for(let g in groups) {
				if(fake_tokens.includes(groups[g]))
					continue; // false positivies
				if(groups[g].match(/a copy/))
					continue; // strange copy
				// special case, WAY dual land tokens
				let waycheck = groups[g].match(/a colorless land token that's an? (Plains|Island|Swamp|Mountain|Forest|Desert) and the chosen basic land type/);
				if(waycheck) {
					let add = [];
					switch(waycheck[1]) {
						case "Plains":
							add = ["Plains Island", "Plains Swamp", "Mountain Plains", "Forest Plains"];
							break;
						case "Island":
							add = ["Plains Island", "Island Swamp", "Island Mountain", "Forest Island"];
							break;
						case "Swamp":
							add = ["Plains Swamp", "Island Swamp", "Swamp Mountain", "Swamp Forest"];
							break;
						case "Mountain":
							add = ["Mountain Plains", "Island Mountain", "Swamp Mountain", "Mountain Forest"];
							break;
						case "Forest":
							add = ["Forest Plains", "Forest Island", "Swamp Forest", "Mountain Forest"];
							break;
						case "Desert":
							add = ["Desert Plains", "Desert Island", "Desert Swamp", "Desert Mountain", "Desert Forest"];
							break;
					}
					for(let a in add)
						tokens.push(["colorless " + add[a] + " land", 1]);
					continue;
				}
				// remove extraneous text
				groups[g] = groups[g].replace(/(, (where|except|then).*)/g, "");
				// extract info from the token text
				let tokenMatch = groups[g].match(captureMatch);
				if(tokenMatch) {
					temp.push(tokenMatch);
					let legendName_ = tokenMatch[2];		// legendary name?
					let tokenCount = tokenMatch[4];			// create N tokens
					let tN = countInt(tokenCount);			// converted to integer
					let tokenTapped_ = tokenMatch[5];		// tapped token?
					let tokenAttacking_ = tokenMatch[6];	// attacking token?
					let tokenLegendary_ = tokenMatch[7];	// legendary?
					let tokenBasic_ = tokenMatch[8];		// basic?
					let tokenSnow_ = tokenMatch[9];			// snow?
					let tokenPT = tokenMatch[10];			// power and toughness
					let tokenColor1 = tokenMatch[11];		// first color
					let tokenColorMid = tokenMatch[12];		// second of three color
					let tokenColor2 = tokenMatch[13];		// last color
					let tokenSubType1 = tokenMatch[14];		// first subtype
					let tokenSubType2 = tokenMatch[15];		// second subtype
					let tokenSubType3 = tokenMatch[16];		// third subtype, don't support 4
					let tokenEnchantment_ = tokenMatch[17];	// enchantment?
					let tokenArtifact_ = tokenMatch[18];	// artifact?
					let tokenLand_ = tokenMatch[19];		// land?
					let tokenCreature_ = tokenMatch[20];	// creature?
					let tokenExtra = tokenMatch[21];		// additional abilities or other text
					
					// check for "if X, create N of those tokens instead"
					let tokenExtraSpawnMatch = cleanoracle.match(/create (one|two|three|four|five|six|seven|eight|nine|ten) of those tokens/i)
					let tokenExtraSpawn = 0;
					if(tokenExtraSpawnMatch) {
						tokenExtraSpawn = countInt(tokenExtraSpawnMatch[1])
					}
					// verify legendary name
					let falsep = ["Exile ", "exile ", "Sacrifice ", "sacrifice ", "on "];
					if(falsep.includes(legendName_))
						legendName_ = false;
					
					// process additional abilities and text
					let tokenWith, tokenNamed, tokenExtraColors;
					if(tokenExtra) {
						let bits = tokenExtra.split(/(with|named|that's|that is|that are|attached|and has|that can't block)/);
						let opts = ["with","named","that's","that is","that are","that’s","and has", "that can't block"];
						if(bits[0] == "" || bits[0] == " ")
							bits.splice(0, 1);
						for(let i=0; i<bits.length; i++) {
							if(opts.includes(bits[i])) {
								if(bits[i] == "with" || bits[i] == "and has" || bits[i] == "that can't block") {
									tokenWith = "with some other stuff";
									let test = "with" + bits[i+1];
									// pt define
									if(test.match(/with (power|toughness)/) && (!tokenPT || tokenPT.match("X")))
										tokenWith = null;
									// counters
									if(test.match(/with [^ ] [+-]/))
										tokenWith = null;
									// tokens often don't list haste
									if(test.match(/with haste ?$/))
										tokenWith = null;
									i++;
								}else if(bits[i] == "named") {
									tokenNamed = bits[i+1].replace(/^ | $/g, "");
									i++;
								}else if(bits[i+1].match(/ (all colors|white|blue|black|red|green)/)){
									tokenExtraColors = bits[i] + bits[i+1];
									i++;
								}
							}
						}
						tokenExtra = tokenExtra.replace(tokenExtraColors, "");
					}
					
					// if explicit legendary name is given, use that
					// if explicit other name is given, use that
					// else, generate token name from characteristics
					if(legendName_) {
						// explicit legend name
						tokens.push([legendName_, tN]);
						if(tokenExtraSpawn)
							tokens.push([legendName_, tokenExtraSpawn]);
						continue;
					}
					else if(tokenNamed) {
						// explicit given name
						tokens.push([tokenNamed, tN]);
						if(tokenExtraSpawn)
							tokens.push([tokenNamed, tokenExtraSpawn]);
						continue;
					}
					else{
						// resolve sub types
						let tokenSubTypes = "";
						if(tokenSubType1)
							tokenSubTypes += tokenSubType1;
						if(tokenSubType2)
							tokenSubTypes += tokenSubType2;
						if(tokenSubType3)
							tokenSubTypes += tokenSubType3;
						tokenSubTypes = tokenSubTypes.replace(/ $/, "");
						// if we're a predefined token, only use the types
						if(predef.includes(tokenSubTypes)) {
							tokens.push([tokenSubTypes, tN]);
							if(tokenExtraSpawn)
								tokens.push([tokenNamed, tokenExtraSpawn]);
							continue;
						}
						// resolve card types
						let tokenCardTypes = "";
						if(tokenEnchantment_)
							tokenCardTypes += tokenEnchantment_;
						if(tokenArtifact_)
							tokenCardTypes += tokenArtifact_;
						if(tokenLand_)
							tokenCardTypes += tokenLand_;
						if(tokenCreature_) {
							tokenCardTypes += tokenCreature_;
							if(!tokenPT || tokenPT == " ")
								tokenPT = "X/X";
						}
						
						// resolve color
						let tokenColorA = arrangeTokenColors([tokenColor1, tokenColorMid, tokenColor2]);
						if(shout) {
							console.log(tokenColor1);
							console.log(tokenColorMid);
							console.log(tokenColor2);
							console.log(tokenColorA);
						}
						// X/X colors Subtyes type token that's all colors with some other stuff
						let pieces = [];
						if(tokenPT) {
							tokenPT.replace(/ /g, "");
							pieces.push(tokenPT);
						}
						if(tokenColorA && !tokenExtraColors)
							pieces.push(tokenColorA);
						if(tokenSubTypes)
							pieces.push(tokenSubTypes);
						if(tokenCardTypes)
							pieces.push(tokenCardTypes.replace(/ $/, ""));
						if(tokenExtraColors)
							pieces.push(tokenExtraColors);
						
						let token_base_name = pieces.join(" ");
						if(tokenWith) {
							token_base_name += " with some other stuff";
						}
						token_base_name = token_base_name.replace(/  /g, " ").replace(/that are/, "that's");
						if(token_base_name.match(/a copy/))
							token_base_name = "";
						if(token_base_name == "of those")
							token_base_name = "";
						token_base_name = token_base_name.replace(/(^ +| +$)/g, "").replace(/that is all/, "that's all");
						let token_with_name = token_base_name.replace(" with some other stuff", "");
						if(tokenExtra)
							token_with_name += tokenExtra;
						if(token_base_name) {
							tokens.push([token_base_name, tN, token_with_name]);
							if(tokenExtraSpawn)
								tokens.push([token_base_name, tokenExtraSpawn]);
						}
					}
				}
			}
			// manual corrections after we've generated all tokens
			for(let t in tokens) {
				switch(tokens[t][0]) {
					case "Masterpiece":
						// replace "Masterpiece token" with the Masterpieces
						tokens[t][0] = "Thrice-Folded Lotus";
						tokens.push(["Mirror of Possibilities", tokens[t][1]], "Masterpiece");
						tokens.push(["Cultivating Spheres", tokens[t][1]], "Masterpiece");
						break;
					case "colorless land":
						// WAY dual land tokens
						tokens[t][0] = "colorless Plains Island land";
						tokens.push(["colorless Island Swamp land", tokens[t][1]]);
						tokens.push(["colorless Swamp Mountain land", tokens[t][1]]);
						tokens.push(["colorless Mountain Forest land", tokens[t][1]]);
						tokens.push(["colorless Forest Plains land", tokens[t][1]]);
						tokens.push(["colorless Plains Swamp land", tokens[t][1]]);
						tokens.push(["colorless Island Mountain land", tokens[t][1]]);
						tokens.push(["colorless Swamp Forest land", tokens[t][1]]);
						tokens.push(["colorless Mountain Plains land", tokens[t][1]]);
						tokens.push(["colorless Forest Island land", tokens[t][1]]);
						break;
				}
			}
		}
	}
	
	// EMBLEMS
	if(thisCard.rulesText.match(/ an emblem /)) {
		if(thisCard.typeLine.match(/Planeswalker/)) {
			let subtype = thisCard.typeLine.replace(/[^—]+ — /, "").replace(/ +$/, "");
			if(subtype == "Legendary Planeswalker")
				subtype = "Forgotten"; // TODO this could be better
			tokens.push([subtype + " Emblem", 1, "an emblem"])
		}else{
			tokens.push([thisCard.cardName + " Emblem", 1, "an emblem"]);
		}
	}
	if(thisCard.rulesText2 && thisCard.rulesText2.match(/ an emblem /)) {
		if(thisCard.typeLine2.match(/Planeswalker/)) {
			let subtype = thisCard.typeLine2.replace(/[^—]+ — /, "").replace(/ +$/, "");
			if(!subtype)
				subtype = "Forgotten";
			tokens.push([subtype + " Emblem", 1, "an emblem"])
		}else{
			tokens.push([thisCard.cardName2 + " Emblem", 1, "an emblem"]);
		}
	}
	
	// AUDITION
	let auditionMatch = thisCard.rulesText.match(/audition for (white|blue|black|red|green)/i)
	let auditionMatch2 = thisCard.rulesText.match(/audition for (white|blue|black|red|green) or for (white|blue|black|red|green)/i)
	if(auditionMatch) {
		tokens.push(["1/1 colorless Construct Actor creature", 1]);
		switch(auditionMatch[1]) {
			case "white":
				tokens.push(["Cleric Role", 1]);
				tokens.push(["Scout Role", 1]);
				break;
			case "blue":
				tokens.push(["Warlock Role", 1]);
				tokens.push(["Wizard Role", 1]);
				break;
			case "black":
				tokens.push(["Cleric Role", 1]);
				tokens.push(["Warlock Role", 1]);
				break;
			case "red":
				tokens.push(["Warrior Role", 1]);
				tokens.push(["Wizard Role", 1]);
				break;
			case "green":
				tokens.push(["Scout Role", 1]);
				tokens.push(["Warrior Role", 1]);
				break;
		}
	}
	if(auditionMatch2) {
		switch(auditionMatch[2]) {
			case "white":
				tokens.push(["Cleric Role", 1]);
				tokens.push(["Scout Role", 1]);
				break;
			case "blue":
				tokens.push(["Warlock Role", 1]);
				tokens.push(["Wizard Role", 1]);
				break;
			case "black":
				tokens.push(["Cleric Role", 1]);
				tokens.push(["Warlock Role", 1]);
				break;
			case "red":
				tokens.push(["Warrior Role", 1]);
				tokens.push(["Wizard Role", 1]);
				break;
			case "green":
				tokens.push(["Scout Role", 1]);
				tokens.push(["Warrior Role", 1]);
				break;
		}
	}

	// MSEMAR
	if(oracle.match(/(that's a copy|that is a copy|that are copies|Copy target (permanent )?spell)/)) {
		tokens.push(["Copy", 1, "MSEMAR"]);
	}
	if(oracle.match(/(play|cast) ([^\n.]+ (from exile|exiled)|(one of )?those cards|them|it this turn|it until)/)) {
		tokens.push(["Can Be Cast From Exile", 1, "MSEMAR"]);
	}

	// KEYWORDS
	if(cleanoracle.match(/(meta|mega)?morph/i))
		tokens.push(["Morph", 1, "Keyword: Morph"]);
	if(cleanoracle.match(/adjudicate/i))
		tokens.push(["white Aura enchantment with some other stuff", 1, "Keyword: Adjudicate"]);
	if(cleanoracle.match(/manifest/i))
		tokens.push(["Manifest", 1, "Keyword: Manifest"]);
	if(cleanoracle.match(/foretell/i))
		tokens.push(["Foretell", 1, "Keyword: Foretell"]);
	if(cleanoracle.match(/journey/i))
		tokens.push(["Journey", 1, "Keyword: Journey"]);
	if(cleanoracle.match(/the monarch/i))
		tokens.push(["The Monarch", 1, "Keyword: The Monarch"]);
	if(thisCard.typeLine2 && thisCard.typeLine2.match(/Adventure/))
		tokens.push(["On an Adventure", 1, "Keyword: Adventure"]);
	// MSEM
	if(cleanoracle.match(/eureka!/i))
		tokens.push(["Research Counter", 1, "Keyword: Eureka!"]);
	if(cleanoracle.match(/shimmer/i))
		tokens.push(["Shimmer", 1, "Keyword: Shimmer"]);
	if(cleanoracle.match(/substantiate/i))
		tokens.push(["Substantiate", 1, "Keyword: Substantiate"]);
	if(cleanoracle.match(/submerge/i))
		tokens.push(["Submerge", 1, "Keyword: Submerge"]);
	if(cleanoracle.match(/glory counter/i))
		tokens.push(["Glory Counter", 1, "Keyword: Glory Counters"]);
	if(cleanoracle.match(/Primal/i))
		tokens.push(["Primal", 1, "Keyword: Primal"]);
	if(cleanoracle.match(/archive|codex|additional (face-up )?library/i))
		tokens.push(["Additional Library", 1, "Keyword: Additional Library"]);
	if(cleanoracle.match(/^(Revive|Successor)(—| \{)/m))
		tokens.push([thisCard.cardName, 1, "Keyword: Revive"]);
	if(cleanoracle.match(/^Compose/m))
		tokens.push(["colorless Saga enchantment with some other stuff", 1, "Keyword: Compose"]);
	// REVOLUTION
	if(cleanoracle.match(/Tunneler/i)) {
		tokens.push(["The Tunnels", 1, "Keyword: Tunneler"]);
		tokens.push(["Tunnel Divider", 1, "Keyword: Tunneler"]);
	}
	if(cleanoracle.match(/create a Solidarity enchantment/i))
		tokens.push(["Solidarity", 1, "Keyword: Solidarity"]);

	// FIELD TEST
	if(cleanoracle.match(/Embrace/i)) {
		tokens.push(["Embraced Cards", 1, "Keyword: Embrace"]);
		tokens.push(["Embraced Representative", 1, "Keyword: Embrace"]);
	}
	if(cleanoracle.match(/equalise [^.,]+ X times/i)) {
		tokens.push(["Equalised Dragon", "X", "Keyword: Equalise"]);
	}else if(cleanoracle.match(/equalise/i)) {
		tokens.push(["Equalised Dragon", 1, "Keyword: Equalise"]);
	}

	// apply tokenscripts overrides
	if(thisCard.tokenscripts) {
		let ts = thisCard.tokenscripts;
		if(ts.r) {
			// replace tokens
			tokens = ts.r;
		}
		if(ts.a) {
			// add tokens
			for(let t in ts.a) {
				tokens.push(ts.a[t]);
			}
		}
	}

	// check if this token is in tokens_map
	for(let t in tokens) {
		let tn = tokens[t][0].replace(/(^ +| +$)/g, "");
		let tc = tokens[t][1];
		let tm = tokens[t][2];
		if(shout)
			console.log(tn);
		
		// if not, check if we missed the word creature
		if(!token_map[tn]) {
			if(tn.match(/[X0-9]+\/[X0-9]+/) && !tn.match(/creature/)) {
				let test;
				if(tn.match("with some other stuff")) {
					test = tn.replace("with some other stuff", "creature with some other stuff");
				}else{
					test = tn + " creature";
				}
				if(token_map[test])
					tn = test;
				
			}
		}
		// if not, check if we saw an ability that wasn't real
		if(!token_map[tn]) {
			let test = tn.replace(" with some other stuff", "");
			if(token_map[test])
				tn = test;
		}
		// if not, see if we have a variable size token we can use instead
		if(!token_map[tn]) {
			let test = tn.replace(/[0-9X]+\/[0-9X]+/, "X/X");
			if(token_map[test])
				tn = test;
		}
		// if not, see if there is an alternate emblem name
		if(!token_map[tn] && tm == "an emblem") {
			let test = thisCard.cardName + " Emblem";
			if(token_map[test]) {
				tn = test;
			}
		}
		// if not, we're a token without a card
		if(!token_map[tn]) {
			if(tm != "MSEMAR") {
				if(!cardless_tokens[tn])
					cardless_tokens[tn] = {}
				if(!cardless_tokens[tn][c])
					cardless_tokens[tn][c] = (tm || tn);
			}
		}
		else{
			// otherwise add this card to the token_map
			// try to get one from the same set
			// otherwise make do
			let slot;
			// check for Secret Lair tokens
			if(thisCard.setID == "LAIR" && thisCard.hidden) {
				let sltag = thisCard.hidden.match(/[(](SL[0-9]+)[)]/);
				if(sltag)
					slot = token_map[tn][sltag[1]];
			}
			// check for same set
			if(!slot)
				slot = token_map[tn][thisCard.setID];
			if(!slot && thisCard.parentSet)
				slot = token_map[tn][thisCard.parentSet];
			// check for MSEMAR
			if(!slot)
				slot = token_map[tn].MSEMAR;
			// take the first viable one
			if(!slot)
				slot = token_map[tn][Object.keys(token_map[tn])[0]];
			// TODO, specification
			let tokenID = slot[0];
			if(shout)
				console.log(tokenID);
			if(!claimed_tokens[tokenID])
				claimed_tokens[tokenID] = {};
			if(!claimed_tokens[tokenID][c])
				claimed_tokens[tokenID][c] = [];
			claimed_tokens[tokenID][c].push(tokens[t][1])
		}
	}
	return tokens;
}
// generate a token card's longform name
function tokenNamer(card, skips) {
	if(!skips)
		skips = {};
	// if the token is an emblem, use its full name
	// if the token has an explicit name, use that
	// if not, find its color, card type, subtypes, pt, and abilities
	if(card.typeLine.match(/Emblem/))
		return card.fullName;

	let token_name, token_subtypes, token_pt, token_abilities;
	let token_color_a, token_color_b; // 0-3 color listed before, 4-5 color listed after
	let token_types = [];

	let split_type = card.typeLine.split(/ — /);
	if(split_type[1]) {
		token_subtypes = split_type[1].replace(/ +$/, "");
	}

	token_name = card.cardName.replace(/ Token$/, "")
	if(skips.shout) {
		console.log(token_name, token_subtypes);
	}
	if(token_name != token_subtypes) {
		// token has explicit name
		return token_name;
	}
	
	let c_map = {"W":"white", "U":"blue", "B":"black", "R":"red", "G":"green"}
	switch(card.colorIdentity.length) {
		case 0:
			token_color_a = "colorless";
			break;
		case 1:
			token_color_a = c_map[card.colorIdentity[0]];
			break;
		case 2:
			token_color_a = c_map[card.colorIdentity[0]] + " and " + c_map[card.colorIdentity[1]];
			break;
		case 3:
			token_color_a = c_map[card.colorIdentity[0]] + ", " + c_map[card.colorIdentity[1]] + ", and " + c_map[card.colorIdentity[2]];
			break;
		case 4:
			token_color_b = "that's " + c_map[card.colorIdentity[0]] + ", " + c_map[card.colorIdentity[1]] + ", " + c_map[card.colorIdentity[2]] + ", and " + c_map[card.colorIdentity[3]];
			break;
		case 5:
			token_color_b = "that's all colors";
			break;
	}
	
	let typeOrder = ["Enchantment", "Artifact", "Land", "Planeswalker", "Creature"];
	for(let t in typeOrder) {
		if(card.typeLine.match(typeOrder[t]))
			token_types.push(typeOrder[t].toLowerCase());
	}
	if(token_types.includes("land")) {
		token_color_a = "colorless";
		token_color_b = null;
	}
	token_types = token_types.join(" ");
	
	if(card.power || card.toughness)
		token_pt = `${card.power}/${card.toughness}`.replace(/[*★]/g, "X");
	
	let token_name_pieces = [];
	if(token_pt && !skips.pt)
		token_name_pieces.push(token_pt);
	if(token_color_a && !skips.color)
		token_name_pieces.push(token_color_a);
	if(token_subtypes && !skips.subtype)
		token_name_pieces.push(token_subtypes);
	if(token_types && !skips.type)
		token_name_pieces.push(token_types);
	if(token_color_b && !skips.color)
		token_name_pieces.push(token_color_b);

	let token_base_name = token_name_pieces.join(" ");
	
	// remove 'all colors', haste, and reminder text from token_abilites
	token_abilities = card.rulesText.replace(/This (creature |token )?is all colors./, "");
	token_abilities = token_abilities.replace(/Haste/i, "");
	token_abilities = token_abilities.replace(/ ?\*[^*]+\*/g, "");

	// predefined tokens
	if(predef.includes(token_subtypes))
		return token_subtypes;

	if(token_abilities == "" || token_abilities == "\n" || skips.ability) {
		//no abilities
		return token_base_name;
	}
	else{
		//todo this could be more specific
		return token_base_name + " with some other stuff";
	}
}
// find alternate wordings that should still get this token
function tokenAliases(card) {
	let names = [tokenNamer(card)];
	if(card.tokenscripts && card.tokenscripts.t) {
		let ttags = card.tokenscripts.t.split(";");
		for(let t in ttags) {
			if(ttags[t] != "")
				names.push(ttags[t]);
		}
	}
	// the token without its colors, for reminder text
	names.push(tokenNamer(card, {color:true}));
	// various names for emblems
	if(card.typeLine.match(/Emblem/)) {
		let subtype = card.typeLine.match(/— (.+) */);
		if(subtype) {
			names.push(`${subtype[1]} Emblem`);
		}
		if(card.cardName != "Emblem")
			names.push(`${card.cardName} Emblem`);
	}
	return names;
}
// the cockatrice-safe name of the token
function tokenNamerTrice(card) {
	let tokenSetCode = card.parentSet || "MSEMAR";
	
	if(card.fullName == "Revived " + card.cardName)
		return "revived " + card.cardName + " " + tokenSetCode;
	if(predef.includes(card.cardName))
		return card.cardName;
	if(card.fullName.match(/Reminder|Emblem/))
		return card.fullName + " " + tokenSetCode;
	let card_name = card.cardName;
	if(card.hidden)
		card_name = card.hidden;
	if(!card.typeLine.match(card_name.replace(/\*/g,"")))
		return card_name + " " + tokenSetCode;
	let waydualsarray = ["Plains Island","Island Swamp","Swamp Mountain","Mountain Forest","Forest Plains","Plains Swamp","Island Mountain","Swamp Forest","Mountain Plains","Forest Island"];
	if(waydualsarray.includes(card_name)) {
		if(tokenSetCode == "WAY")
			return card_name;
		return card_name + " " + tokenSetCode;
	}
	
	let tokenPT = "" + card.power + card.toughness;
	if(tokenPT == "/" || tokenPT.match("★") || tokenPT.match("X"))
		tokenPT = "";
	let tokenColor = colorTranslate(card.color, "long");
	let tokenType = card.typeLine.replace(/(Basic |Snow |Token |Artifact |Creature |Enchantment |Land |Emblem )/g,"");
	let paren = card.fullName.match(/\(([^)]+)\)/);
	let parenText = "";
	if(paren)
		parenText = ` (${paren[1]})`
	let tokenName = tokenColor +  " " + tokenType.replace("— ","") + parenText + " " + tokenPT;
	if(card.typeLine.match("Legendary") || !card.typeLine.match("—"))
		tokenName = card_name + " ";
	if(card.typeLine.match("Emblem"))
		tokenName = tokenType.replace("— ","") + " Emblem ";
	tokenName = tokenName.replace(/  /g, " ");
	tokenName += tokenSetCode;

	return tokenName;
}

// WRITE XMLS
// given a library and tokenBuilding results, return the XML string of that library's token and relations
function libraryToTokensXML(library, flags) {
	if(!flags)
		flags = {};
	let contents = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n<cockatrice_carddatabase version=\"3\">\r\n<cards>\r\n";
	for(let token_key in claimed_tokens) {
		contents += writeCardBlock(library, token_key, flags)
	}
	for(let e in unclaimed_tokens) {
		contents += writeCardBlock(library, unclaimed_tokens[e], flags)
	}
	contents += "</cards>\r\n</cockatrice_carddatabase>";
	contents.replace(/’/g, "'");
	return contents;
}
// given a library, return the XML string of that library's cards
function libraryToCardsXML(library, flags) {
	if(!flags)
		flags = {};
	if(flags.avoidReprints)
		flags.tracker = {};
	
	let str = `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_carddatabase version="4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://raw.githubusercontent.com/Cockatrice/Cockatrice/master/doc/carddatabase_v4/cards.xsd">`;

	str += "\r\n\t<sets>\r\n";
	for(let s in library.setData) {
		str += "\t\t<set>\r\n";
		str += `\t\t\t<name>${s}</name>\r\n`;
		str += `\t\t\t<longname>${library.setData[s].longname}</longname>\r\n`;
		str += `\t\t\t<settype>Custom</settype>\r\n`;
		str += `\t\t\t<releasedate>${library.setData[s].releaseDate}</releasedate>\r\n`;
		str += "\t\t</set>\r\n";
	}
	str += "\t</sets>\r\n";
	
	str += "\t<cards>\r\n";
	for(let c in library.cards) {
		// should this skip illegal cards?
		let card = library.cards[c];
		if(card.setID == "tokens")
			continue;
		str += writeCardBlock(library, c, flags);
	}
	str += "\t</cards>\r\n";
	
	str += "</cockatrice_carddatabase>";
	
	str = str.replace(/’/g, "'");
	
	return str;
}
// given a library and card key, return the XML string of that card
function writeCardBlock(library, key, flags) {
	let card = library.cards[key];
	if(!card)
		return "";
	if(card.shape == "split" || card.shape == "adventure")
		return writeSplitCardBlock(library, key, flags);
	let is_token = (card.setID == "tokens");
	let cardNames;
	if(is_token) {
		if(!flags.tracker)
			flags.tracker = {};
		let token_core = tokenNamerTrice(card);
		let token_set = card.parentSet || "MSEMAR";
		let ticker = 2;
		if(flags.tracker[token_core] && !token_core.match(token_set)) {
			// we used this name already but we can add a set code maybe
			token_core += " " + token_set;
		}
		let token_name = "" + token_core;
		while(flags.tracker[token_name]) {
			// we used this name, add a number
			token_name = token_core + " " + ticker;
			ticker++;
		}
		flags.tracker[token_name] = key;
		cardNames = [token_name];
		if(flags.saveImgNames)
			card.imgName = cardNames[0];
	}
	else{
		cardNames = determinePrintingNames(library, card, flags);
		if(flags.avoidReprints) {
			for(let n in cardNames) {
				flags.tracker[cardNames[n]] = key;
			}
		}
	}
	let mt = mainType(card.typeLine);
	let card_sources = (claimed_tokens[key] || []);
	
	let contents = "";
	contents += "\t\t<card>\r\n";
	contents += "\t\t\t<name>" + cardNames[0] + "</name>\r\n";
	contents += "\t\t\t<text>" + formatTriceText(card) + "</text>\r\n";
	if(!is_token) {
		contents += "\t\t\t<prop>\r\n";
		contents += "\t\t\t\t<side>front</side>\r\n";
		contents += "\t\t\t\t<manacost>" + card.manaCost.replace(/[{}]/g,"") + "</manacost>\r\n";
		contents += "\t\t\t\t<cmc>" + card.cmc + "</cmc>\r\n";
		contents += "\t\t\t\t<layout>" + convertLayout(card.shape) + "</layout>\r\n";
		contents += "\t\t\t\t<maintype>" + mt + "</maintype>\r\n";
		if(card.colorIdentity) {
			contents += "\t\t\t\t<coloridentity>" + card.colorIdentity.join("") + "</coloridentity>\r\n";
		}else{
			contents += "\t\t\t\t<coloridentity></coloridentity>\r\n";
		}
	}
	contents += "\t\t\t\t<colors>" + colorTranslate(card.color) + "</colors>\r\n";
	contents += "\t\t\t\t<type>" + trim(card.typeLine) + "</type>\r\n";
	if(card.power !== "")
		contents += "\t\t\t\t<pt>" + card.power + "/" + card.toughness + "</pt>\r\n";
	if(card.loyalty !== "")
		contents += "\t\t\t\t<loyalty>" + card.loyalty + "</loyalty>\r\n";
	if(card.defense !== "" & card.defense != undefined)
		contents += "\t\t\t\t<defense>" + card.defense + "</defense>\r\n";
	if(is_token) {
		contents += "\t\t\t<token>1</token>\r\n";
		if(card.rulesText.match(/enters (the battlefield )?tapped./))
			contents += "\t\t\t<cipt>1</cipt>\r\n";
	}else{
		contents += "\t\t\t</prop>\r\n";
		if(card.rulesText.match(card.cardName + " enters the battlefield tapped"))
			contents += "\t\t\t<cipt>1</cipt>\r\n";
		if(card.rulesText.match(card.cardName + " enters tapped"))
			contents += "\t\t\t<cipt>1</cipt>\r\n";
	}
	contents += "\t\t\t<tablerow>"
	if(mt == "Land") {
		contents += "0";
	}else if(mt == "Creature") {
		contents += "2";
	}else if(mt == "Instant" || mt == "Sorcery") {
		contents += "3";
	}else{
		contents += "1";
	}
	contents += "</tablerow>\r\n";
	if(cardNames[1])
		contents += `\t\t\t<related attach="transform">${cardNames[1]}</related>\r\n`;
	for(let s in card.spellbook) {
		contents += `\t\t\t<related persistent="persistent">${card.spellbook[s]}</related>\r\n`;
	}
	for(let s in card.alsoConjure) {
		if(card.alsoConjure[s] > 1) {
			contents += `\t\t\t<related persistent="persistent" count="${card.alsoConjure[s]}">${s}</related>\r\n`;
		}else{
			contents += `\t\t\t<related persistent="persistent">${s}</related>\r\n`;
		}
	}
	if(library.duplicate_rules && library.duplicate_rules[card.cardName]) {
		let keys = library.duplicate_rules[card.cardName].keys;
		let count = library.duplicate_rules[card.cardName].count || 1;
		if(keys) {
			for(let k in keys) {
				let s = keys[k];
				if(count > 1) {
					contents += `\t\t\t<related persistent="persistent" count="${count}">${s}</related>\r\n`;
				}else{
					contents += `\t\t\t<related persistent="persistent">${s}</related>\r\n`;
				}
			}
		}
	}
	for(let c in card_sources) {
		let sources = card_sources[c];
		let source_names = determinePrintingNames(library, library.cards[c], flags);
		for(let i in sources) {
			for(let n in source_names) {
				if(!source_names[n])
					continue;
				contents += "\t\t\t<reverse-related"
				if(sources[i] != 1)
					contents += ` count="${sources[i]}"`
				contents += `>${source_names[n]}</reverse-related>\r\n`
			}
		}
	}
	contents += `\t\t\t<set num="${card.cardID}${(card.shape == "doubleface" ? "a" : "")}"`;
	contents +=	` rarity="${card.rarity}"`;
	if(card.scryID)
		contents += ` uuid="${card.scryID}"`;
	contents += `>${card.setID}</set>\r\n`;
	contents += "\t\t</card>\r\n";
	if(cardNames[2])
		contents = contents + contents.replace(cardNames[0], cardNames[2]).replace(cardNames[1], cardNames[3]);
	
	if(cardNames[1]) {
		let mt2 = mainType(card.typeLine2);
		let contents2 = "";
		contents2 += "\t\t<card>\r\n";
		contents2 += "\t\t\t<name>" + cardNames[1] + "</name>\r\n";
		contents2 += "\t\t\t<text>" + formatTriceText(card, true) + "</text>\r\n";
		contents2 += "\t\t\t<prop>\r\n";
		contents2 += "\t\t\t\t<side>back</side>\r\n";
		contents2 += "\t\t\t\t<manacost>" + card.manaCost2.replace(/[{}]/g,"") + "</manacost>\r\n";
		contents2 += "\t\t\t\t<cmc>" + card.cmc2 + "</cmc>\r\n";
		contents2 += "\t\t\t\t<colors>" + colorTranslate(card.color2) + "</colors>\r\n";
		contents2 += "\t\t\t\t<coloridentity>" + card.colorIdentity.join("") + "</coloridentity>\r\n";
		contents2 += "\t\t\t\t<layout>" + convertLayout(card.shape) + "</layout>\r\n";
		contents2 += "\t\t\t\t<type>" + trim(card.typeLine2) + "</type>\r\n";
		contents2 += "\t\t\t\t<maintype>" + mt2 + "</maintype>\r\n";
		if(card.power2 !== "")
			contents2 += "\t\t\t\t<pt>" + card.power2 + "/" + card.toughness2 + "</pt>\r\n";
		if(card.loyalty2 !== "")
			contents2 += "\t\t\t\t<loyalty>" + card.loyalty2 + "</loyalty>\r\n";
		if(card.defense2 !== "")
			contents2 += "\t\t\t\t<defense>" + card.defense2 + "</defense>\r\n";
		contents2 += "\t\t\t</prop>\r\n";
		contents2 += "\t\t\t<tablerow>"
		if(mt2 == "Land") {
			contents2 += "0";
		}else if(mt2 == "Creature") {
			contents2 += "2";
		}else if(mt2 == "Instant" || mt2 == "Sorcery") {
			contents2 += "3";
		}else{
			contents2 += "1";
		}
		contents2 += "</tablerow>\r\n";
		if(card.rulesText2.match(card.cardName2 + " enters the battlefield tapped"))
			contents2 += "\t\t\t<cipt>1</cipt>\r\n";
		if(card.rulesText2.match(card.cardName2 + " enters tapped"))
			contents2 += "\t\t\t<cipt>1</cipt>\r\n";
		contents2 += `\t\t\t<related attach="transform">${cardNames[0]}</related>\r\n`;
		for(let s in card.spellbook) {
			contents2 += `\t\t\t<related persistent="persistent">${card.spellbook[s]}</related>\r\n`;
		}
		contents2 += `\t\t\t<set num="${card.cardID}b" rarity="${card.rarity}"`;
		if(card.scryID)
			contents2 += ` uuid="${card.scryID}"`;
		contents2 += `>${card.setID}</set>\r\n`;
		contents2 += "\t\t</card>\r\n";
		if(cardNames[3])
			contents2 = contents2 + contents2.replace(cardNames[0], cardNames[2]).replace(cardNames[1], cardNames[3]);
		
		contents += contents2;
	}

	if(is_token) {
		contents = contents.replace(/\t{3,}/g, " ");
		contents = contents.replace(/\t/g, "");
	}
	contents = contents.replace(/count="X"/g, 'count="x"');
	return contents;
}
function writeSplitCardBlock(library, key, flags) {
	let card = library.cards[key];
	let cardNames = determinePrintingNames(library, card, flags, true);
	let splitName = cardNames[0].replace(card.cardName, card.fullName);
	splitName = splitName.replace(/ ?\/\/ ?/, " // ");
	if(flags.avoidReprints) {
		for(let n in cardNames) {
			flags.tracker[cardNames[n]] = key;
		}
		flags.tracker[splitName] = key;
	}

	let mt = mainType(card.typeLine);
	let mt2 = mainType(card.typeLine2);
	let main_type = (mt == mt2 ? mt : mt + " // " + mt2);
	let type_line = (card.typeLine == card.typeLine2 ? trim(card.typeLine) : trim(card.typeLine) + " // " + trim(card.typeLine2));
	
	let contents = "";
	contents += "\t\t<card>\r\n";
	contents += "\t\t\t<name>" + splitName + "</name>\r\n";
	contents += "\t\t\t<text>" + formatTriceText(card) + "\n-----\n" + formatTriceText(card, true) + "</text>\r\n";
	contents += "\t\t\t<prop>\r\n";
	contents += "\t\t\t\t<side>front</side>\r\n";
	contents += "\t\t\t\t<manacost>" + card.manaCost.replace(/[{}]/g,"") + " // " + card.manaCost2.replace(/[{}]/g,"") + "</manacost>\r\n";
	contents += "\t\t\t\t<cmc>" + (card.cmc + card.cmc2) + "</cmc>\r\n";
	contents += "\t\t\t\t<layout>" + convertLayout(card.shape) + "</layout>\r\n";
	contents += "\t\t\t\t<maintype>" + main_type + "</maintype>\r\n";
	if(card.colorIdentity) {
		contents += "\t\t\t\t<coloridentity>" + card.colorIdentity.join("") + "</coloridentity>\r\n";
	}else{
		contents += "\t\t\t\t<coloridentity></coloridentity>\r\n";
	}
	contents += "\t\t\t\t<colors>" + colorTranslate(card.color) + "</colors>\r\n";
	contents += "\t\t\t\t<type>" + type_line + "</type>\r\n";
	if(card.power !== "")
		contents += "\t\t\t\t<pt>" + card.power + "/" + card.toughness + "</pt>\r\n";
	if(card.loyalty !== "")
		contents += "\t\t\t\t<loyalty>" + card.loyalty + "</loyalty>\r\n";
	if(card.defense !== "" & card.defense != undefined)
		contents += "\t\t\t\t<defense>" + card.defense + "</defense>\r\n";
	contents += "\t\t\t</prop>\r\n";
	if(card.rulesText.match(card.cardName + " enters the battlefield tapped"))
		contents += "\t\t\t<cipt>1</cipt>\r\n";
	if(card.rulesText.match(card.cardName + " enters tapped"))
		contents += "\t\t\t<cipt>1</cipt>\r\n";
	contents += "\t\t\t<tablerow>"
	if(mt == "Land") {
		contents += "0";
	}else if(mt == "Creature") {
		contents += "2";
	}else if(mt == "Instant" || mt == "Sorcery") {
		contents += "3";
	}else{
		contents += "1";
	}
	contents += "</tablerow>\r\n";
	for(let s in card.spellbook) {
		contents += `\t\t\t<related persistent="persistent">${card.spellbook[s]}</related>\r\n`;
	}
	for(let s in card.alsoConjure) {
		if(card.alsoConjure[s] > 1) {
			contents += `\t\t\t<related persistent="persistent" count="${card.alsoConjure[s]}">${s}</related>\r\n`;
		}else{
			contents += `\t\t\t<related persistent="persistent">${s}</related>\r\n`;
		}
	}
	contents += `\t\t\t<set num="${card.cardID}${(card.shape == "doubleface" ? "a" : "")}"`;
	contents +=	` rarity="${card.rarity}"`;
	if(card.scryID)
		contents += ` uuid="${card.scryID}"`;
	contents += `>${card.setID}</set>\r\n`;
	contents += "\t\t</card>\r\n";
	
	return contents;
}
// given a library and card, determine the XML names of that card
function determinePrintingNames(library, card, flags, split) {
	if(typeof card == "string")
		card = library.cards[card];
	if(!flags)
		flags = {};
	// base names for each face
	let cardNames = [card.cardName, ""];
	if(card.setID == "tokens")
		cardNames[0] = tokenNamerTrice(card)
	if(card.hasOwnProperty("cardName2")) {
		if(card.shape == "split" && !split) {
			cardNames[0] += " // " + card.cardName2;
		}else if(card.shape != "adventure") {
			cardNames[1] = card.cardName2;
		}
	}
	// overrides for hidden names and aliases
	if(card.hasOwnProperty("hidden")) {
		cardNames = card.hidden.split("__")
		if(cardNames.length < 2)
			cardNames.push("");
	}
	else if(card.alias) {
		cardNames[0] += " (" + card.alias + ")";
	}
	else if(card.rarity == "special" && card.rarities.length > 1) {
		// promo tag
		cardNames[0] += "_PRO";
		if(cardNames[1])
			cardNames[1] += "_PRO";
	}
	// normalize apostrophes now that names are set
	cardNames[0].replace(/’/g,"'");
	if(cardNames[1])
		cardNames[1].replace(/’/g,"'");

	// see if this needs to tag the set
	// reprints need to, unless they were aliased or hidden
	// or they're tag_exempt in rotating formats
	let tag_set = card.notes.includes("reprint") && !card.alias && !card.hidden && !card.notes.includes("tag_exempt");
	if(library.legal && library.legal.rotated && library.legal.rotated.includes(card.setID))
		tag_set = true;
	// or there's multiple prints we want to differentiate
	if(flags.avoidReprints) {
		if(!tag_set && flags.tracker.hasOwnProperty(cardNames[0])) {
			if(!flags.tracker.hasOwnProperty(cardNames[0]+"_"+card.setID))
				tag_set = true;
		}
	}
	if(tag_set) {
		cardNames[0] += `_${card.setID}`;
		if(cardNames[1])
			cardNames[1] += `_${card.setID}`;
	}
	// if there's a lot of differentiated cards with the same name
	// like basic lands, add the card number
	if(flags.avoidReprints) {
		if(flags.tracker.hasOwnProperty(cardNames[0])) {
			cardNames[0] += " " + card.cardID;
			if(cardNames[1])
				cardNames[1] += " " + card.cardID;
		}
	}
	if(flags.saveImgNames) {
		card.imgName = cardNames[0];
		if(cardNames[1]) {
			card.imgName2 = cardNames[1];
		}
	}
	
	/* TAG EXEMPT DUPLICATE
		In rotating formats, you may have a case where the main card rotates out without a tag_exempt rotating in
		ie, Negate (VST) and Negate_MON (MON) exist, then Negate (VST) rotates out
		Negate (VST) should be renamed to Negate_VST
		Negate_MON should not be renamed
		but we would still like a card named simply Negate
		therefore we make a duplicate of Negate_MON named Negate
	*/
	if(tag_set && library.legal && library.legal.rotation && library.legal.rotation.includes(card.setID)) {
		// this card is tagged due to being a reprint
		let fp = card.firstPrint;
		if(!library.legal.rotation.includes(library.cards[fp].setID)) {
			// and the first print is out of rotation
			// check if any tag_exempt printings exist
			let ap = [];
			for(let c in library.cards) {
				if(library.cards[c].firstPrint == fp)
					ap.push(library.cards[c]);
			}
			let exm = false;
			let old;
			for(let p in ap) {
				if(!old && library.legal.rotation.includes(ap[p].setID))
					old = ap[p]; // save oldest in rotation
				if(ap[p].notes.includes("tag_exempt")) {
					exm = true;
					break;
				}
			}
			if(!exm && card.setID == old.setID) {
				// all cards are tagged, make a dupe of the oldest
				cardNames.push(cardNames[0].replace("_" + card.setID, ""));
				if(cardNames[1])
					cardNames.push(cardNames[1].replace("_" + card.setID, ""));
			}
		}
	}
	return cardNames;
}
function keyFromPrintingNameSoft(library, printingName) {
	printingName = printingName.replace(" // ", "//")
	if(library.cards[printingName])
		return printingName;
	if(printingName.match(/[(]SL/)) {
		let test = printingName + "_LAIR";
		if(library.cards[test])
			return test;
	}
	
	return null; // have to loop cards to find it
}
// one shot generate XMLS
function generateTriceXMLs(library, flags) {
	if(!flags)
		flags =  {};
	/*
		{
			newPredef: [] 			// replace predef
			newDummy: [] 			// replace dummied
			newFake: []				// replace fake_tokens
			addPredef: []			// add to predef
			addDummy: []			// add to dummied
			addFake: []				// add to fake_tokens
			avoidReprints: bool		// cards with reprinted names will get their card ID added instead
			report: bool			// also return tokens report
			fullReport: bool		// also return tokens report details
		}
	*/
	initialize(library, flags);
	let token_info = tokenBuilding(library, flags);
	let cards_xml = libraryToCardsXML(library, flags);
	let tokens_xml = token_info.xml;
	
	let response = {
		cards: cards_xml,
		tokens: tokens_xml
	}
	if(flags.report || flags.fullReport)
		response.report = tokens_info.report;
	if(flags.fullReport)
		response.details = tokens_info.details;
	
	return response;
}

// WRITE JSONS
// given a library, generate the mtgjson file for it
function libraryToMTGJSON(library) {
	let formatJSON = {};
	
	// initialize sets
	for(let set in library.setData) {
		formatJSON[set] = setDataForMTGJSON(library, set);
	}
	
	// put cards into their sets
	let flags = {avoidReprints:true, tracker:{}};
	for(let c in library.cards) {
		let setID = library.cards[c].setID;
		if(!formatJSON[setID])
			continue;
		if(library.legal.masterpiece && library.legal.masterpiece.includes(library.cards[c].cardName))
			continue;
		if(library.legal.rotation && !library.cards[c].formats.includes(library.name) && !library.legal.eternal)
			continue;
		let cardObjs = cardToMTGJSON(library, c, flags);
		for(let o in cardObjs)
			formatJSON[setID].cards.push(cardObjs[o]);
	}
	
	let mtgjsonv5 = {
		meta: {},
		data: formatJSON
	}
	
	return mtgjsonv5;
}
// given a library and set key, generate the mtgjson set file for that set
function setDataForMTGJSON(library, s) {
	let set = library.setData[s];
	return {
		name: set.longname,
		code: s,
		gathererCode: s,
		magicCardsInfoCode: s,
		releaseDate: set.releaseDate,
		release_number: parseInt(set.releaseNo) || 0,
		border: "black",
		type: set.type || "expert",
		booster: [],
		mkm_name: set.longname,
		mkm_id: set.releaseNo,
		cards: []
	}
}
// given a library and a card key, generate the mtgjson card entries
function cardToMTGJSON(library, c, flags) {
	let card = library.cards[c];
	let cardNames = determinePrintingNames(library, card, flags, true);
	
	//todo Clean Artist step of stitch
	
	let entries = [];
	let two_part = ["doubleface", "split"].includes(card.shape);
	let faces = [
		{
			name: cardNames[0],
			cardName: card.cardName,
			artist: card.artist,
			cmc: card.cmc,
			colors: card.color,
			rulesText: card.rulesText,
			flavorText: card.flavorText,
			power: card.power,
			toughness: card.toughness,
			loyalty: card.loyalty,
			manaCost: card.manaCost,
			typeLine: card.typeLine
		}
	]
	if(two_part) {
		faces.push({
			name: cardNames[1],
			cardName: card.cardName2,
			artist: card.artist2 || card.artist,
			cmc: card.cmc2,
			colors: card.color2,
			rulesText: card.rulesText2,
			flavorText: card.flavorText2,
			power: card.power2,
			toughness: card.toughness2,
			loyalty: card.loyalty2,
			manaCost: card.manaCost2,
			typeLine: card.typeLine2
		})
	}
	if(cardNames[2]) {
		if(faces.length == 1)
			faces.push({});
		faces.push(faces[0])
		faces[2].name = cardNames[2];
	}
	if(cardNames[3]) {
		faces.push(faces[1])
		faces[3].name = cardNames[3];
	}
	
	for(let f in faces) {
		let face = faces[f];
		if(!face.name)
			continue;
		let entry = {};
		entry.artist = unkludge(face.artist);
		entry.convertedManaCost = face.cmc;
		entry.faceConvertedManaCost = face.cmc;
		entry.colors = arrayifyColors(face.colors);
		for(let i in entry.colors)
			entry.colors[i] = colorTranslate(entry.colors[i].toLowerCase());
		entry.colorIdentity = (card.colorIdentity || []);
		entry.designer = (card.designer || "");
		entry.flavor = face.flavorText.replace(/[*]/g, "");
		entry.frameType = getFrameType(card);
		entry.id = c;
		entry.imageName = face.name.toLowerCase();
		entry.layout = formatMTGJSONLayout(card);
		entry.legalities = arrayifyLegal(library, card);
		if(face.loyalty !== "")
			entry.loyalty = String(face.loyalty);
		entry.manaCost = face.manaCost.replace(/[{}]/g, "");
		entry.multiverseid = card.sdn;
		entry.name = face.name;
		if(two_part) {
			if(card.shape == "split") {
				entry.name = cardNames[[0, 0, 2, 2][f]].replace(card.cardName, card.fullName).replace(/ ?\/\/ ?/, " // ");
			}else{
				entry.name = cardNames[[0, 0, 2, 2][f]] + " // " + cardNames[[1, 1, 3, 3][f]]
			}
			
			entry.faceName = face.name;
			if(f > 1) {
				entry.names = [faces[2].name, faces[3].name];
			}else{
				entry.names = [faces[0].name, faces[1].name];
			}
			entry.side = ["a", "b", "a", "b"][f];
		}
		entry.number = card.cardID;
		if(card.shape == "doubleface")
			entry.number += ["a", "b", "a", "b"][f];
		if(card.shape == "adventure" && (f%2 == 0)) {
			entry.pageData = {
				name: card.cardName2,
				manaCost: card.manaCost2,
				type: card.typeLine2,
				text: card.rulesText2
			}
		}
		if(face.power !== "")
			entry.power = String(face.power);
		switch(card.rarity) {
			case "masterpiece":
			case "bonus":
				entry.rarity = "special";
				break;
			default:
				entry.rarity = card.rarity;
		}
		if(card.spellbook)
			entry.relatedCards = {spellbook: card.spellbook};
		
		let types = arrayifyTypes(face.typeLine);
		if(types[2].length)
			entry.subtypes = types[2];
		if(types[0].length)
			entry.supertypes = types[0];
		entry.text = face.rulesText.replace(/[*]/g, "").replace(/\n+$/, "");
		if(card.shape == "adventure") {
			entry.text += "\n-----\n";
			entry.text += `${card.cardName2} ${card.manaCost2}\n`;
			entry.text += `${card.typeLine2}\n`;
			entry.text += `${card.rulesText2}`;
		}
		if(face.toughness !== "")
			entry.toughness = face.toughness;
		entry.type = trim(face.typeLine);
		entry.types = types[1];
		
		entry.text = entry.text.replace(/enters tapped([.]| unless)/, "enters the battlefield tapped$1")
		
		entries.push(entry);
	}
	return entries;
}
// split the layouts LackeyBot considers Normal but MTGJSON doesn't
function getSagaishShape(card, back) {
	let type = card.typeLine;
	let rules = card.rulesText;
	if(back) {
		type = card.typeLine2;
		rules = card.rulesText2;
	}
	let layout = "normal";
	if(card.typeLine.match(/\b(Gallery|Class)\b/) || card.rulesText.match(/\bTranscend as\b/)) {
		layout = "class";
	}else if(card.typeLine.match(/\b(Discovery|Saga|Realm|Quest)\b/)) {
		layout = "saga";
	}else if(card.typeLine.match(/\b(Case|Mystery)\b/)) {
		layout = "case";
	}else if(card.rulesText.match(/\b(PROGRESS|shape 1|^Chronicle)\b/)) {
		layout = "leveler";
	}
	return layout;
}
// convert LackeyBot shape to MTGJSON layout
function formatMTGJSONLayout(card) {
	let layout = "normal";
	switch(card.shape) {
		case "doubleface":
			if(card.manaCost2 != "") {
				layout = "modal_dfc";
			}else{
				layout = "transform";
			}
			break;
		case "normal":
			layout = getSagaishShape(card);
		case "split":
			layout = card.shape;
			break;
	}
	return layout;
}
// make the legal array
function arrayifyLegal(library, card) {
	let formats;
	let cardName = card.cardName;
	switch(library.name) {
		case "myriad":
			formats = {
				"Myriad": "Legal"
			};
			break;
		case "revolution":
			formats = {
				"Revolution": "Legal",
				"Revolution Brawl": "Legal",
				"Revolution Eternal": "Legal",
				"Revolution Eternal Pauper": "Not Legal"
			};
			if(card.rarities.includes("basic land") || card.rarities.includes("common"))
				formats["Revolution Eternal Pauper"] = "Legal";
			
			if(!card.formats.includes("revolution")) {
				formats["Revolution"] = "Rotated";
				formats["Revolution Brawl"] = "Rotated";
			}
			if(library.legal.banned.includes(cardName))
				formats["Revolution"] = "Banned";
			if(library.legal.brawl.includes(cardName))
				formats["Revolution Brawl"] = "Banned";
			if(library.legal.reveternal.includes(cardName))
				formats["Revolution Eternal"] = "Banned";
			if(library.legal.reveternalpauper.includes(cardName))
				formats["Revolution Eternal Pauper"] = "Banned";
			break;
		case "msem":
			formats = {
				"MSEM2": "Legal",
				"MSEDH": "Legal"
			};
			if(library.legal.modernBan.includes(cardName) || library.legal.masterpiece.includes(cardName))
				formats["MSEM2"] = "Banned";
			if(library.legal.edhBan.includes(cardName) || library.legal.masterpiece.includes(cardName))
				formats["MSEDH"] = "Banned";
			break;			
	}
	let legalAr = [];
	for(let f in formats)
		legalAr.push({format:f, legality:formats[f]});
	return legalAr;
}
// make the types arrays
function arrayifyTypes(str) {
	let super_types = [];
	let card_types = [];
	let sub_types = [];
	
	let type_split = str.split("—");
	
	if(type_split[1])
		sub_types = trim(type_split[1]).split(" ");
	
	let cardMatch = type_split[0].match(/((?:(?:Artifact|Battle|Conspiracy|Creature|Dungeon|Enchantment|Instant|Land|Planeswalker|Plane|Scheme|Sorcery|Vanguard) ?)+)/)
	if(cardMatch) {
		card_types = trim(cardMatch[1]).split(" ");
		super_types = trim(type_split[0].replace(cardMatch[1], "")).split(" ");
	}
	if(super_types.length == 1 && super_types[0] == "")
		super_types = [];
	return [super_types, card_types, sub_types];
}
// determine the frame type for Dreadrise
function getFrameType(card) {
	let frameType = "";
	let faces = [""];
	if(card.frameType)
		return card.frameType;
	if(card.shape == "doubleface") {
		frameType = "dfc-";
		faces.push("2")
	}
	for(let f in faces) {
		let type = "";
		if(card.shape.match(/leveler|split|aftermath|adventure/)) {
			type += card.shape + "-";
		}
		else{
			let st = getSagaishShape(card, (f == 1));
			if(st != "normal")
				type += st + "-";
		}
		if(card["typeLine"+faces[f]].match(/Planeswalker/)) {
			if(card.notes.includes("istallwalker") || card["rulesText"+faces[f]].match(/[^\n]+\n[^\n]+\n[^\n]+\n[^\n]+/)) {
				type += "tallplaneswalker-";
			}else{
				type += "planeswalker-";				
			}
		}
		if(!type)
			type += "normal-";
		frameType += type;
	}
	if(card.setID == "MPS_MSE")
		frameType += "champion";
	if(card.setID == "REV")
		frameType += "renegade";
	frameType = frameType.replace(/-$/, "");
	return frameType;
}
// given a library, generate the mtg.wtf files for it
function libraryToWTF(library) {
	let formatJSON = {};
	
	// initialize sets
	for(let set in library.setData) {
		formatJSON[set] = setDataForMTGJSON(library, set);
	}
	
	// put cards into their sets
	let flags = {tracker:{}};
	for(let c in library.cards) {
		let setID = library.cards[c].setID;
		if(!formatJSON[setID])
			continue;
		if(library.legal.masterpiece && library.legal.masterpiece.includes(library.cards[c].cardName))
			continue;
		let cardObjs = cardToWTF(library, c, flags);
		for(let o in cardObjs)
			formatJSON[setID].cards.push(cardObjs[o]);
	}
	
	let mtgjsonv5 = {
		meta: {},
		data: formatJSON
	}
	
	return mtgjsonv5;
}
function cardToWTF(library, c, flags) {
	let card = library.cards[c];
	if(card.notes.includes("no export"))
		return [];
	let front_exclusive_tags = ["conflict"];
	let back_exclusive_tags = ["conflict2"];
	let tag_swaps = {
		"conflict2": "conflict"
	};
	let tag_forks = {};
	let cardNames = [card.cardName, card.cardName2];
	
	let entries = [];
	let faces = [
		{
			name: cardNames[0],
			cardName: card.cardName,
			artist: card.artist,
			cmc: card.cmc,
			colors: card.color,
			rulesText: card.rulesText,
			flavorText: card.flavorText,
			power: card.power,
			toughness: card.toughness,
			loyalty: card.loyalty,
			manaCost: card.manaCost,
			typeLine: card.typeLine
		}
	]
	if(card.cardName2) {
		faces.push({
			name: cardNames[1],
			cardName: card.cardName2,
			artist: card.artist2 || card.artist,
			cmc: card.cmc2,
			colors: card.color2,
			rulesText: card.rulesText2,
			flavorText: card.flavorText2,
			power: card.power2,
			toughness: card.toughness2,
			loyalty: card.loyalty2,
			manaCost: card.manaCost2,
			typeLine: card.typeLine2
		})
	}
	let changelog = [];
	if(library.changelog) {
		let changes = [];
		if(!library.cards[card.firstPrint]) {
			console.log(`firstprint error at ${c}`);
		}else{
			for(let h in library.changelog[library.cards[card.firstPrint].fullName]) {
				let thisChange = library.changelog[library.cards[card.firstPrint].fullName][h];
				changelog.push(formatDate(thisChange[1]) + " — " + thisChange[2]);
			}
		}
	}
	let rulings = [];
	if(library.oracle && library.oracle.hasOwnProperty(card.fullName))
		rulings = arrayifyRulings(library.oracle[card.fullName])
	for(let f in faces) {
		let face = faces[f];
		if(!face.name)
			continue;
		let front = [true, false, true, false][f];
		let entry = {};

		entry.artist = unkludge(face.artist);
		entry.atags = (card.ptags || [])
		if(card.champion)
			entry.champion = card.champion;
		if(changelog.length)
			entry.changes = changelog;
		entry.cmc = face.cmc;
		entry.colors = arrayifyColors(face.colors);
		for(let i in entry.colors)
			entry.colors[i] = colorTranslate(entry.colors[i].toLowerCase());
		//entry.colorIdentity = (card.colorIdentity || []);
		//entry.color_identity = (card.colorIdentity || []);
		entry.designer = (card.designer || "");
		if(card.firstPrint) {
			entry.firstSet = library.cards[card.firstPrint].setID;
		}else{
			console.log(card);
			entry.firstSet = card.setID;
		}
		entry.flavor = face.flavorText.replace(/[*]/g, "");
		//entry.frameType = getFrameType(card);
		entry.id = c;
		entry.imageName = face.name.toLowerCase();
		if(card.lair) {
			entry.lairNumber = card.lair;
		}
		else if(card.setID == "LAIR") {
			if(!card.hidden) {
				console.log(card);
				continue;
			}
			let slpull = card.hidden.match(/[(](?:[^ ]+ )?SL(\d+)b?[)]/);
			if(slpull)
				entry.lairNumber = slpull[1];
		}
		entry.layout = card.shape.replace("doubleface", "double-faced");
		entry.legalities = arrayifyLegal(library, card);
		if(face.loyalty !== "")
			entry.loyalty = String(face.loyalty);
		entry.manaCost = face.manaCost;
		entry.mciNumber = card.cardID;
		if(card.shape == "doubleface") {
			entry.mciNumber += ["a", "b"][f];
		}
		entry.multiverseid = card.sdn;
		entry.name = face.name;
		if(card.cardName2) {
			if(card.notes.includes("secretface")) {
				entry.layout = "normal";
			}else{			
				entry.faceName = face.name;
				entry.names = [faces[0].name, faces[1].name];
				entry.side = ["a", "b"][f];
			}
		}
		entry.number = card.cardID;
		if(card.cardName2)
			entry.number += ["a", "b", "a", "b"][f];
		entry.otags = [];
		if(card.ctags) {
			for(let t in card.ctags) {
				let tag = card.ctags[t].toLowerCase();
				if(front && back_exclusive_tags.includes(tag))
					continue;
				if(!front && front_exclusive_tags.includes(tag))
					continue;
				tag = (tag_swaps[tag] || tag);
				entry.otags.push(tag);
				for(let ai in tag_forks[tag])
					entry.otags.push(tag_forks[tag][ai].toLowerCase());
			}
		}
		if(card.releaseDate)
			entry.release_date = card.releaseDate;
		if(rulings.length)
			entry.rulings = rulings;
		if(face.power !== "")
			entry.power = String(face.power);
		switch(card.rarity) {
			case "masterpiece":
			case "bonus":
				entry.rarity = "special";
				break;
			default:
				entry.rarity = card.rarity;
		}
		if(card.spellbook.length)
			entry.relatedCards = {spellbook: card.spellbook};
		
		let types = arrayifyTypes(face.typeLine);
		if(types[2].length)
			entry.subtypes = types[2];
		if(types[0].length)
			entry.supertypes = types[0];
		entry.text = face.rulesText.replace(/[*]/g, "").replace(/\n$/, "");
		if(face.toughness !== "")
			entry.toughness = face.toughness;
		entry.type = trim(face.typeLine);
		entry.types = types[1];
		
		entries.push(entry);
	}
	return entries;
}
// format oracle rulings
function arrayifyRulings(rulings) {
	let array = [];
	let rules = rulings.split(/\n[_•] /);
	for(let r in rules) {
		array.push({
			date: "2018-09-03",
			text: rules[r]
		})
	}
	return array;
}
// FORMATTING
// format oracle text for Cockatrice
function formatTriceText(card, just_back) {
	let str = card.rulesText;
	if(just_back) {
		str = card.rulesText2;
	}else if(card.rulesText2 && card.shape != "doubleface") {
		str += "\n---\n" + card.rulesText2;
	}
	if(card.shape == "doubleface") {
		str += "\n---\n";
		if(just_back) {
			str += "Transforms from " + card.cardName;
		}else{
			str += "Transforms into " + card.cardName2;
		}
	}
	return str.replace(/[*]/g, "");
}
// determine the maintype of a string for its tablerow
function mainType(str) {
	if(str.match(/Land/))
		return "Land";
	if(str.match(/Creature/))
		return "Creature";
	if(str.match(/Planeswalker/))
		return "Planeswalker";
	let types = str.match(/(Artifact|Battle|Enchantment|Instant|Sorcery|Battle|Dungeon|Conspiracy|Plane|Vanguard)/g);
	if(types)
		return types[1];
	return "";
}
// convert LackeyBot shape to Cockatrice layout
function convertLayout(str) {
	let res = "normal";
	switch(str) {
		case "doubleface":
			res = "transform";
			break;
		case "split":
		case "aftermath":
			res = "split";
			break;
			
	}
	return res;
}
// convert LackeyBot color to Cockatrice coloridentity
function colorTranslate(str, kind) {
	let tokenColor = "multicolor";
	let tokenInit = "";
	switch(str) {
		case "":
		case "colorless":
		case "C":
			tokenColor = "colorless";
			break;
		case "{White} ":
		case "white":
		case "W":
			tokenColor = "white";
			tokenInit = "W";
			break;
		case "{Blue} ":
		case "blue":
		case "U":
			tokenColor = "blue";
			tokenInit = "U";
			break;
		case "{Black} ":
		case "black":
		case "B":
			tokenColor = "black";
			tokenInit = "B";
			break;
		case "{Red} ":
		case "red":
		case "R":
			tokenColor = "red";
			tokenInit = "R";
			break;
		case "{Green} ":
		case "green":
		case "G":
			tokenColor = "green";
			tokenInit = "G";
			break;
		case "{White/Green} ":
		case "{Green/White} ":
		case "green and white":
		case "GW":
		case "WG":
			tokenColor = "green and white";
			tokenInit = "GW";
			break;
		case "{White/Blue} ":
		case "{Blue/White} ":
		case "white and blue":
		case "WU":
		case "UW":
			tokenColor = "white and blue";
			tokenInit = "WU";
			break;
		case "{Blue/Black} ":
		case "{Black/Blue} ":
		case "blue and black":
		case "UB":
		case "BU":
			tokenColor = "blue and black";
			tokenInit = "UB";
			break;
		case "{Black/Red} ":
		case "{Red/Black} ":
		case "black and red":
		case "BR":
		case "RB":
			tokenColor = "black and red";
			tokenInit = "BR";
			break;
		case "{Red/Green} ":
		case "{Green/Red} ":
		case "red and green":
		case "RG":
		case "GR":
			tokenColor = "red and green";
			tokenInit = "RG";
			break;
		case "{White/Black} ":
		case "{Black/White} ":
		case "white and black":
		case "WB":
		case "BW":
			tokenColor = "white and black";
			tokenInit = "WB";
			break;
		case "{Blue/Red} ":
		case "{Red/Blue} ":
		case "blue and red":
		case "UR":
		case "RU":
			tokenColor = "blue and red";
			tokenInit = "UR";
			break;
		case "{Green/Black} ":
		case "{Black/Green} ":
		case "black and green":
		case "BG":
		case "GB":
			tokenColor = "black and green";
			tokenInit = "BG";
			break;
		case "{Red/White} ":
		case "{White/Red} ":
		case "red and white":
		case "RW":
		case "WR":
			tokenColor = "red and white";
			tokenInit = "RW";
			break;
		case "{Green/Blue} ":
		case "{Blue/Green} ":
		case "blue and green":
		case "GU":
		case "UG":
			tokenColor = "blue and green";
			tokenInit = "GU";
			break;
		case "{Green/White/Blue} ":
		case "green, white, and blue":
		case "GWU":
		case "GUW":
		case "WUG":
			tokenColor = "green, white, and blue";
			tokenInit = "GWU";
			break;
		case "{White/Blue/Black} ":
		case "white, blue, and black":
		case "WUB":
		case "BUW":
			tokenColor = "white, blue, and black";
			tokenInit = "WUB";
			break;
		case "{Blue/Black/Red} ":
		case "blue, black, and red":
		case "UBR":
		case "BRU":
			tokenColor = "blue, black, and red";
			tokenInit = "UBR";
			break;
		case "{Black/Red/Green} ":
		case "black, red, and green":
		case "BRG":
		case "BGR":
			tokenColor = "black, red, and green";
			tokenInit = "BRG";
			break;
		case "{Red/Green/White} ":
		case "red, green, and white":
		case "RGW":
		case "WRG":
		case "GRW":
			tokenColor = "red, green, and white";
			tokenInit = "RGW";
			break;
		case "{White/Black/Green} ":
		case "white, black, and green":
		case "WBG":
		case "BGW":
			tokenColor = "white, black, and green";
			tokenInit = "WBG";
			break;
		case "{Blue/Red/White} ":
		case "blue, red, and white":
		case "red, white, and blue":
		case "URW":
		case "WUR":
		case "RUW":
		case "RWU":
			tokenColor = "blue, red, and white";
			tokenInit = "URW";
			break;
		case "{Black/Green/Blue} ":
		case "black, green, and blue":
		case "BGU":
		case "UBG":
			tokenColor = "black, green, and blue";
			tokenInit = "BGU";
			break;
		case "{Red/White/Black} ":
		case "red, white, and black":
		case "RWB":
		case "WBR":
		case "BRW":
			tokenColor = "red, white, and black";
			tokenInit = "RWB";
			break;
		case "{Green/Blue/Red} ":
		case "green, blue, and red":
		case "GUR":
		case "URG":
		case "GRU":
			tokenColor = "green, blue, and red";
			tokenInit = "GUR";
			break;
		case "{White/Blue/Black/Red} ":
		case "white, blue, black, and red":
		case "WUBR":
		case "BRUW":
			tokenColor = "white, blue, black, and red";
			tokenInit = "WUBR";
			break;
		case "{Blue/Black/Red/Green} ":
		case "blue, black, red, and green":
		case "UBRG":
		case "BGRU":
			tokenColor = "blue, black, red, and green";
			tokenInit = "UBRG";
			break;
		case "{Black/Red/Green/White} ":
		case "black, red, green, and white":
		case "BRGW":
		case "BGRW":
			tokenColor = "black, red, green, and white";
			tokenInit = "BRGW";
			break;
		case "{Red/Green/White/Blue} ":
		case "red, green, white, and blue":
		case "RGWU":
		case "GRUW":
			tokenColor = "red, green, white, and blue";
			tokenInit = "RGWU";
			break;
		case "{Green/White/Blue/Black} ":
		case "green, white, blue, and black":
		case "GWUB":
		case "BGUW":
			tokenColor = "green, white, blue, and black";
			tokenInit = "GWUB";
			break;
		case "{White/Blue/Black/Red/Green} ":
		case "all colors":
		case "that's all colors":
		case "that is all colors":
		case "WUBRG":
		case "BGRUW":
		case "M":
			tokenColor = "all colors";
			tokenInit = "WUBRG";
			break;
	}
	if(kind == "long")
		return tokenColor;
	return tokenInit;
}
// convert token creation ability colors into proper order
function arrangeTokenColors(srcs) {
	let colors = [];
	for(let s in srcs) {
		if(!srcs[s])
			continue;
		if(srcs[s].match(/colorless/))
			return "colorless";
		let c = srcs[s].match(/white|blue|black|red|green/);
		if(c)
			colors.push(colorTranslate(c[0]));
	}
	let alphabetical = colors.sort().join("");
	return colorTranslate(alphabetical, "long");
	
}
// convert some common shortforms into more regexable forms
function longformTokenization(str) {
	let charaMatch = str.match(/[^\n]*creates? an? (.*) token for each of the chosen characteristics[^\n]*/i);
	let basicsMatch = str.match(/Plains token, Island token, Swamp token, Mountain token, or Forest token/)
	if(charaMatch) {
		str = str.replace(charaMatch[0], "");
		let tokenType = charaMatch[1];
		str = str.replace(/• ([^\n]+?)( with [^\n]+|\.)/g, function(match, p1, p2) {
			if(!p1 || !p2)
				return match;
			return `• Create a ${p1} ${tokenType} token${p2}`;
		})
	}
	if(basicsMatch) {
		str = str.replace(basicsMatch[0], "Plains token, or create an Island token, or create a Swamp token, or create a Mountain token, or create a Forest token");
	}
	return str;
}
// clean art credit
function unkludge(str) {
	return str.replace(/,? ?(on |—|-|[(]) ?(DeviantArt|DA|ArtStation|pixiv|pivix|edited[.,:]? .*|ed[.,:].*)[)]?/i, "");
}
function slugify(str) {
	return unkludge(str.replace(/[’]/g, "'").replace(/(^[ \t\r\n]+|[ \t\r\n]+$)/g, "").replace(/[ _-]+/g, "-").replace(/[—*()@:;,.<>\/\\\[\]{}|`~"']/g, "").replace(/--+/g, "-")).toLowerCase();
}

// UTILITY
// convert token string counts to an integer
function countInt(count) {
	if(count == "one")
		return 1;
	let ar = ["an", "a", "two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"];
	let v = ar.indexOf(count);
	if(v < 0)
		return "X";
	if(v == 0)
		return 1;
	return v;
}
// remove whitespace
function trim(str) {
	return str.replace(/(^ +| +$)/g, "");
}
// convert {White} color format to ["White"] format
function arrayifyColors(theseColors) {
	if(!theseColors)
		return [];
	let colormatch = theseColors.match(/[{]([A-Z]+)\/?([A-Z]+)?\/?([A-Z]+)?\/?([A-Z]+)?\/?([A-Z]+)?\/?[}]/i);
	let colorArray = [];
	for(var c = 1; c < 6; c++) {
		if(colormatch !== null && colormatch[c] !== undefined)
			colorArray.push(colormatch[c]);
	}
	return colorArray;
}
// convert changelog dates to YYYY-MM-DD
function formatDate(num) {
	if(num < 10000000)
		return "unknown time";
	let str = num.toString();
	return str.substr(0, 4) + "-" + str.substr(4,2) + "-" + str.substr(6,2);
}

// DEBUG
function cardDebugger(library, c) {
	if(!globalMatch) {
		initialize(library, {});
		console.log("initialized");
	}
	console.log(tokenPuller(library, c, true));
}
function tokenDebugger(library, t) {
	if(!globalMatch) {
		initialize(library, {});
		console.log("initialized");
	}
	let tN = tokenNamer(library.cards[t]);
	console.log(`token named: "${tN}"`);
	console.log(`token spawns as "${tokenNamerTrice(library.cards[t])}"`);
	tokenBuilding(library, {});
	console.log(token_map[tN]);
	console.log(claimed_tokens[t]);
	if(unclaimed_tokens.includes(t))
		console.log("token was unclaimed");
}
function tagExemptTest() {
	let lib = {
		cards: {
			"Negate_VST": {fullName:"Negate", cardName:"Negate", notes:[], setID:"VST", rarity:"common", rarities:["common"], firstPrint:"Negate_VST"},
			"Negate_MON": {fullName:"Negate", cardName:"Negate", notes:["reprint"], setID:"MON", rarity:"common", rarities:["common"], firstPrint:"Negate_VST"}
		},
		setData: {
			"VST": {},
			"MON": {}
		},
		legal: {
			rotation: ["VST", "MON"],
			rotated: []
		}
	}
	
	console.log(`Testing Negate_VST and Negate_MON, VST and MON in standard.`)
	
	let vstNames = determinePrintingNames(lib, "Negate_VST", {});
	let monNames = determinePrintingNames(lib, "Negate_MON", {});
	
	if(vstNames[0] == "Negate" && !vstNames[2]) {
		console.log(`Negate_VST is correctly "Negate"`);
	}else{
		console.log(`Negate_VST is incorrect:`);
		console.log(vstNames);
	}
	if(monNames[0] == "Negate_MON" && !monNames[2]) {
		console.log(`Negate_MON is correctly "Negate_MON"`);
	}else{
		console.log(`Negate_MON is incorrect:`);
		console.log(monNames);
	}
	
	console.log(`Rotating out VST...`)
	lib.legal.rotation.splice(0, 1);
	lib.legal.rotated.push("VST");
	
	vstNames = determinePrintingNames(lib, "Negate_VST", {});
	monNames = determinePrintingNames(lib, "Negate_MON", {});

	if(vstNames[0] == "Negate_VST" && !vstNames[2]) {
		console.log(`Negate_VST is correctly "Negate_VST"`);
	}else{
		console.log(`Negate_VST is incorrect:`);
		console.log(vstNames);
	}
	if(monNames[0] == "Negate_MON" && monNames[2] == "Negate") {
		console.log(`Negate_MON is correctly "Negate_MON" and "Negate"`);
	}else{
		console.log(`Negate_MON is incorrect:`);
		console.log(monNames);
	}
	
	console.log(`Rotating in a tag_exempt Negate`);
	lib.legal.rotation.push("VRD");
	lib.cards["Negate_VRD"] = {fullName:"Negate", cardName:"Negate", notes:["reprint", "tag_exempt"], setID:"MON", rarity:"common", rarities:["common"], firstPrint:"Negate_VST"}

	monNames = determinePrintingNames(lib, "Negate_MON", {});
	let vrdNames = determinePrintingNames(lib, "Negate_VRD", {});
	
	if(vstNames[0] == "Negate_VST" && !vstNames[2]) {
		console.log(`Negate_VST is correctly "Negate_VST"`);
	}else{
		console.log(`Negate_VST is incorrect:`);
		console.log(vstNames);
	}
	if(monNames[0] == "Negate_MON" && !monNames[2]) {
		console.log(`Negate_MON is correctly "Negate_MON"`);
	}else{
		console.log(`Negate_MON is incorrect:`);
		console.log(monNames);
	}
	if(vrdNames[0] == "Negate" && !vrdNames[2]) {
		console.log(`Negate_VRD is correctly "Negate"`);
	}else{
		console.log(`Negate_VRD is incorrect:`);
		console.log(monNames);
	}
}

exports.initialize = initialize;
exports.tokenRegex = tokenRegex;

exports.tokenBuilding = tokenBuilding;
exports.tokenNamer = tokenNamer;
exports.tokenNamerTrice = tokenNamerTrice;

exports.libraryToTokensXML = libraryToTokensXML;
exports.libraryToCardsXML = libraryToCardsXML;
exports.libraryToWTF = libraryToWTF;
exports.determinePrintingNames = determinePrintingNames;
exports.generateTriceXMLs = generateTriceXMLs;

exports.formatTriceText = formatTriceText;
exports.mainType = mainType;
exports.convertLayout = convertLayout;
exports.colorTranslate = colorTranslate;
exports.longformTokenization = longformTokenization;
exports.slugify = slugify;
exports.unkludge = unkludge;

exports.cardDebugger = cardDebugger;
exports.tokenDebugger = tokenDebugger;
exports.tagExemptTest = tagExemptTest;

exports.libraryToMTGJSON = libraryToMTGJSON;