const fs = require('fs-extra');
const Jimp = require('jimp');

let WIDE_TYPES = /Battle/;
const CARD_WIDTH = 375;
const CARD_HEIGHT = 523;
const CARD_OFFSET = 2;
const BATTLE_OFFSET = 74;

const CROP_VALS = {
	DFC: {
		LEFT_HEIGHT_OFFSET: 0,
		LEFT_WIDTH_OFFSET: 0,
		LEFT_HEIGHT: CARD_HEIGHT,
		LEFT_WIDTH: CARD_WIDTH,
		RIGHT_HEIGHT_OFFSET: 0,
		RIGHT_WIDTH_OFFSET: CARD_WIDTH + CARD_OFFSET,
		RIGHT_HEIGHT: CARD_HEIGHT,
		RIGHT_WIDTH: CARD_WIDTH
	},
	TO_BATTLE: {
		LEFT_HEIGHT_OFFSET: 0,
		LEFT_WIDTH_OFFSET: 0,
		LEFT_HEIGHT: CARD_WIDTH,
		LEFT_WIDTH: CARD_HEIGHT,
		RIGHT_HEIGHT_OFFSET: BATTLE_OFFSET,
		RIGHT_WIDTH_OFFSET: CARD_HEIGHT + CARD_OFFSET,
		RIGHT_HEIGHT: CARD_HEIGHT,
		RIGHT_WIDTH: CARD_WIDTH
	},
	FROM_BATTLE: {
		LEFT_HEIGHT_OFFSET: 0,
		LEFT_WIDTH_OFFSET: BATTLE_OFFSET,
		LEFT_HEIGHT: CARD_HEIGHT,
		LEFT_WIDTH: CARD_WIDTH,
		RIGHT_HEIGHT_OFFSET: 0,
		RIGHT_WIDTH_OFFSET: CARD_WIDTH + CARD_OFFSET,
		RIGHT_HEIGHT: CARD_WIDTH,
		RIGHT_WIDTH: CARD_HEIGHT
	},
	DOUBLE_BATTLE: {
		LEFT_HEIGHT_OFFSET: 0,
		LEFT_WIDTH_OFFSET: BATTLE_OFFSET,
		LEFT_HEIGHT: CARD_WIDTH,
		LEFT_WIDTH: CARD_HEIGHT,
		RIGHT_HEIGHT_OFFSET: BATTLE_OFFSET,
		RIGHT_WIDTH_OFFSET: CARD_HEIGHT + CARD_OFFSET,
		RIGHT_HEIGHT: CARD_WIDTH,
		RIGHT_WIDTH: CARD_HEIGHT
	}
}

function windex(str) {
	str = str.replace(" // ", "");
	str = str.replace(/[\\\/<>:*"?]/g, "");
	return str;
}

function splitImage(fn, dir, names, b2, extension) {
	Jimp.read(fn, (err, img) => {
		if(err) {
			console.log(err);
		}else{
			let shape = CROP_VALS.DFC;
			if(img.bitmap.width >= 2*CARD_HEIGHT) {
				// double battle
				shape = CROP_VALS.DOUBLE_BATTLE;
			}else if(img.bitmap.width >= (CARD_WIDTH+CARD_HEIGHT)) {
				// battle on one side
				shape = CROP_VALS.FROM_BATTLE;
				if(b2)
					shape = CROP_VALS.TO_BATTLE;
			}
			
			img.clone().crop(shape.LEFT_WIDTH_OFFSET, shape.LEFT_HEIGHT_OFFSET, shape.LEFT_WIDTH, shape.LEFT_HEIGHT).write(dir+windex(names[0])+"."+extension);
			img.crop(shape.RIGHT_WIDTH_OFFSET, shape.RIGHT_HEIGHT_OFFSET, shape.RIGHT_WIDTH, shape.RIGHT_HEIGHT).write(dir+windex(names[1])+"."+extension);
			fs.unlink(fn, (er) => {
				if(er)
					console.log(er)
			})
		}
	})
}

exports.splitImage = splitImage;

