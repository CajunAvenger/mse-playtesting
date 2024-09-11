var split = require('./splitter.js');
var fs = require('fs-extra');

// find the files
fs.readdir("./", (err, fns) => {
	for(let f in fns) {
		let fileName = fns[f];
		if(!fileName.match(/-files$/))
			continue;
		// found the SET-files folder
		let folderName = fileName.replace(/-files/, "");
		let newdir = "./Cockatrice/data/pics/downloadedPics/"+folderName;
		console.log(`Relocating ${fileName} to ${newdir}`);
		// delete the old images if it exists
		fs.removeSync(newdir);
		// rename SET-folder into the Cockatrice section
		fs.rename(fileName, newdir, (err3) => {
			if(err) {
				console.log(err);
			}else{
				// edit the files from there
				fs.readdir(newdir + "/", (err2, fns2) => {
					for(let f2 in fns2) {
						let fileName2 = fns2[f2];
						let imgext = fileName2.match(/.(png|jpe?g)/);
						if(!imgext) {
							// relocated the exported XML to cards.xml
							if(fileName2.match(/.xml/)) {
								fs.rename(newdir + "/" + fileName2, "./Cockatrice/data/cards.xml", (err) => {
									if(err) {
										console.log(err);
									}else{
										console.log(`XML moved.`);
									}
								})
							}
							continue;
						}
						// split DFC images
 						let names = fileName2.replace(/.png|.jpe?g/, "").split("__");
						if(names.length < 2)
							continue;
						console.log(`Splitting ${names[0]} and ${names[1]}...`);
						split.splitImage(newdir+"/"+fileName2, newdir+"/", names, false, imgext[1])
					}
				})
			}
		})
	}
})
