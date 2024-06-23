const fs = require('fs-extra');
function checkIbbPatch(fn) {
	let draftmancerFile = "./" + fn + ".txt";
	let ibbFile = "./patch.txt";
	
	let de = fs.existsSync(draftmancerFile);
	let ie = fs.existsSync(ibbFile);
	if(ie && !de) {
		console.log("No draftmancer file found for ibb patch.");
		return;
	}else if(!ie || !de) {
		return;
	}

	fs.readFile(draftmancerFile, "utf8", (err, data) => {
		if(err) {
			console.log(`Can't read ${draftmancerFile}`);
		}else{
			fs.readFile(ibbFile, "utf8", (err2, data2) => {
				if(err2) {
					console.log(`Can't read ${ibbFile}`);
				}else{
					// extract custom cards
					let text_form = data.match(/\[CustomCards\]\r?\n(\[[\s\S]*\])\r?\n\[/);
					let json;
					try {
						json = JSON.parse(text_form[1]);
					}catch(e) {
						console.log("Unable to parse CustomCards");
					}
					if(!json)
						return;
					
					//build cache from patch file
					let patch_map = {};
					let patch_lines = data2.split(/\r?\n/);
					let fails = 0;
					for(let l in patch_lines) {
						let line = patch_lines[l];
						if(line == "")
							continue;
						let slug = "", url;
						let alt = line.match(/alt="(.*?)"/);
						let src = line.match(/src="(.*?)"/);
						let img = line.match(/\[img](.*?)\[\/img]/);
						if(src) {
							url = src[1];
						}else if(img) {
							url = img[1];
						}else{
							fails++;
						}
						if(alt) {
							slug = alt[1];
						}else{
							let slugpull = url.match(/i.ibb.co\/[^\/]+\/(.*)[.](png|jpg)$/);
							slug = slugpull[1];
						}
						if(slug && url)
							patch_map[slug] = url;
					}
					if(fails > 0) {
						console.log(`${fails} ibb links were unable to be read.`);
					}
					// add in the new links
					fails = 0;
					for(let c in json) {
						let entry = json[c];
						let equiv_slug = slugify(entry.name)
						let new_link = patch_map[equiv_slug];
						if(!new_link) {
							fails++;
						}else{
							data = data.replace(entry.image_uris.en, new_link);
						}
						
						if(entry.back) {
							let back_slug = slugify(entry.back.name);
							let back_link = patch_map[back_slug];
							if(!back_link) {
								fails++;
							}else{
								data = data.replace(entry.back.image_uris.en, back_link);
							}
						}
					}
					if(fails > 0)
						console.log(`${fails} ibb links were unable to be reassigned.`);
					
					fs.writeFile(draftmancerFile, data, (err) => {
						if(err) {
							console.log(err);
						}else{
							console.log(`${draftmancerFile} overwritten`);
						}
					})
					
				}
			})
		}
	})
}
function slugify(str) {
	return str.replace(/ /g, "-").replace(/'/g, "-").replace(/[,&—]/g, "");
}

exports.checkIbbPatch = checkIbbPatch;