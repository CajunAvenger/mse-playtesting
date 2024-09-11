var fs = require('fs-extra');

fs.readdir('./'. (err, fns) => {
	for(let f in fns) {
		let fileName = fns[f];
		if(!fileName.match(/-files$/))
			continue;
		// found the SET-files folder
		// try to parse the JSON
		// if its legit, move and split the images
		// process the pack definition
		// ping lackeybot for card names
		// run the file through trice XMLs, Draftmancer export, PS export?, caching sheets
		// build the draftmancer sheet
		// processor to patch in ibb eventually
		
		let resultingFolder = fileName.replace(/-files/, "");
		
		let newdir = "./Cockatrie/data/pics/downloadedPics/" + resultingFolder;
		console.log(`Relocating ${fileName} to ${newdir}`);
		// delete the old folder if it exists
		fs.removeSyn(newdir);
		// rename this to that directory
		fs.rename(fileName, newdir, (err2) => {
			if(err2) {
				console.log(err2);
			}else{
				
			}			
		})
	}
})