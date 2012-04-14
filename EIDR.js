{
	"translatorID": "79c3d292-0afc-42a1-bd86-7e706fc35aa5",
	"label": "EIDR",
	"creator": "Aurimas Vinckevicius",
	"target": "",
	"minVersion": "1.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 8,
	"browserSupport": "gcsi",
	"lastUpdated": "2012-04-12 01:51:21"
}

var typeMap = {
//	'Series'
//	'Season'
//	'Supplemental'
	'TV Show': 'tvBroadcast',
	'Movie': 'film',
	'Short': 'videoRecording',
	'Web': 'videoRecording'
};

var creatorMap = {
	'Director': 'director',
	'Actor': 'castMember'
};

function checkEIDR(eidr) {
	var suffix = eidr.trim().match(/10.5240\/((?:[0-9A-F]{4}-){5})([0-9A-Z])/i);
	if(!suffix) return false;

	//checksum
	//ISO 7064 Mod 37,36
	var id = suffix[1].replace(/-/g,'').toUpperCase().split('');
	var sum = 0;
	for(var i=0, n=id.length; i<n; i++) {
		sum += '0123456789ABCDEF'.indexOf(id[i]);
		sum = ( ((sum % 36) || 36) * 2 ) % 37;
	}

	sum += '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(suffix[2]);

	return (sum % 36)===1;
}

function getValue(parentNode, node) {
	var n = parentNode.getElementsByTagName(node)[0];

	return n !== undefined ? n.textContent : undefined;
}

function detectSearch(item) {
	if(!item.DOI)
		return;

	//we should detect party and user but throw an error later
	//this way other translators don't need to process the DOI
	var prefix = item.DOI.split('/')[0];
	if(prefix == '10.5237' || prefix == '10.5238' || prefix == '10.5240') {
		return true;
	}
}

function  doSearch(searchItem) {
	if(!searchItem.DOI)
		throw new Error("EIDR not specified.");
	if(!checkEIDR(searchItem.DOI))
		throw new Error("Invalid EIDR: " + searchItem.DOI);

	var request = 'https://resolve.eidr.org/EIDR/object/' + searchItem.DOI
					+ '/?type=Full&followAlias=true';
	ZU.doGet(request, function(text) {
		var parser = new DOMParser();
		var res = parser.parseFromString(text, "application/xml");

		var ns = {  
      'n' : 'http://www.eidr.org/schema/1.0',  
      'md': 'http://www.movielabs.com/md'  
    };  

		if(res.getElementsByTagName('Response').length) {
		
			throw new Error("Server returned error: ("
				+ getValue(res, 'Code') + ") "
				+ getValue(res, 'Type'));
		}

		var base = res.getElementsByTagName('BaseObjectData')[0];

		if(getValue(base, 'StructuralType') != 'Performance') {
			Z.debug("Unhandled StructuralType: "
				+ getValue(base, 'StructuralType'));
			return;
		}

		var type = typeMap[getValue(base,'ReferentType')];
		if(!type) {
			Z.debug("Unhandled ReferentType: " + getValue(base,'ReferentType'));
			return
		}
		var item = new Zotero.Item(type);

		//localize?
		item.title = getValue(base,'ResourceName');
		item.language = ZU.xpathText(base, './n:PrimaryLanguage/n:Language', ns);
		item.date = getValue(base,'ReleaseDate');
		item.place = getValue(base,'CountryOfOrigin');

		//running time
		var time = getValue(base,'ApproximateLength')
					.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
		item.runningTime = (time[1] || 0) * 3600 +
							(time[2] || 0) * 60 +
							(time[3] || 0);

		//creators
		var creators = base.getElementsByTagName('Credits')[0];
		var c, t;
		if(creators) {
			c = creators.firstChild;
			while(c) {
				t = creatorMap[c.nodeName];
				if(!t) continue;

				item.creators.push(
					ZU.cleanAuthor(getValue(c,'md:DisplayName'), t)
				);

				c = c.nextSibling;
			}
		}

		/**TODO: Handle producers*/

		item.complete();
	});
}