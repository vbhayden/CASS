var caseToCassSchema = "http://schema.cassproject.org/0.3/case2cass";

var caseInterface = {
	CFDocuments: function () {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFDocuments");
	},
	CFDocument: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFDocuments/" + sourcedId);
	},
	CFPackages: function (sourcedId) {
		return httpGet(debug(this.targetUrl + "/ims/case/v1p0/CFPackages/" + sourcedId));
	},
	CFItems: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFItems/" + sourcedId);
	},
	CFAssociations: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFAssociations/" + sourcedId);
	},
	CFItemAssociations: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFItemAssociations/" + sourcedId);
	},
	CFAssociationGroupings: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFAssociationGroupings/" + sourcedId);
	},
	CFConcepts: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFConcepts/" + sourcedId);
	},
	CFItemTypes: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFItemTypes/" + sourcedId);
	},
	CFLicenses: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFLicenses/" + sourcedId);
	},
	CFSubjects: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFSubjects/" + sourcedId);
	},
	CFRubrics: function (sourcedId) {
		return httpGet(this.targetUrl + "/ims/case/v1p0/CFRubrics/" + sourcedId);
	}
}

stripCassNamespace = function(o){
	if (o["@context"].indexOf("http://schema.cassproject.org") == -1)
		return o;
	var keys = EcObject.keys(o);
	for (var i = 0;i < keys.length;i++)
	{
		var k = keys[i];
		if (k.indexOf("cass:")==0){
			o[k.replace("cass:","")] = o[k];
			delete o[k];
		}
	}
	return o;
}

convertCFDocumentToFramework = function(document){
	var f = new EcFramework();
	f.assignId(document.identifier);
	if (document.subjectURI != null)
	for (var j = 0;j < document.subjectURI.length;j++){
		document.subjectURI[j]["@context"] = caseToCassSchema;
		document.subjectURI[j]["@type"] = "reference";
		document.subjectURI[j]["schema:alignmentType"]="educationalSubject";
	}
	document["@type"] = "CFDocument";
	document["@context"] = caseToCassSchema;
	document = jsonLdExpand(JSON.stringify(document));
	document = jsonLdCompact(JSON.stringify(document),"http://schema.cassproject.org/0.3");
	f.copyFrom(document);
	return f;
}

convertCFAssociationIntoRelation = function(a){
	a["@type"] = "CFAssociation";
	a["@context"] = caseToCassSchema;
	a.originNodeURI = a.originNodeURI.uri;
	a.destinationNodeURI = a.destinationNodeURI.uri;
	delete a.CFDocumentURI;
	a = jsonLdExpand(JSON.stringify(a));
	a = jsonLdCompact(JSON.stringify(a),"http://schema.cassproject.org/0.3");
	a.relationType = {"exactMatchOf":Relation.IS_EQUIVALENT_TO,"isChildOf":Relation.NARROWS}[a.relationType];
	a = stripCassNamespace(a);
	var r = new EcAlignment();
	r.copyFrom(a);
	return r;
}

convertCFItemIntoCompetency = function(a){
	a["@type"] = "CFItem";
	a["@context"] = caseToCassSchema;
	delete a.CFDocumentURI;
	if (a.educationLevel != null)
	for (var i = 0;i < a.educationLevel.length;i++)
	{
		if (!EcObject.isObject(a.educationLevel[i]))
			a.educationLevel[i]={
				"@type":"reference",
				"@context":caseToCassSchema,
				"schema:alignmentType":"educationalLevel",
				"schema:targetName":a.educationLevel[i]
			};
	}
	a = jsonLdExpand(JSON.stringify(a));
	a = jsonLdCompact(JSON.stringify(a),"http://schema.cassproject.org/0.3");
	var r = new EcCompetency();
	r.copyFrom(a);
	return r;
}

//Returns array of objects to save.
embedCFPackageIntoFramework = function(f,document){
	var p = httpGet(document.CFPackageURI.uri);
	var results = [f];
	var i = 0;
	for (i = 0;i < p.CFAssociations.length;i++)
	{
		var relation = convertCFAssociationIntoRelation(p.CFAssociations[i]);
		results.push(relation);
		var internalId = stringToHex(md5(relation.id));
		var version = date(relation["schema:dateModified"],null,true);
		var r = new EcAlignment();
		r.assignIdAndVersion(repoEndpoint(),internalId,version);
		p.CFAssociations[i] = r.id;
	}
	f.relation = p.CFAssociations;
	for (i = 0;i < p.CFItems.length;i++)
	{
		var competency = convertCFItemIntoCompetency(p.CFItems[i]);
		results.push(competency);
		var internalId = stringToHex(md5(competency.id));
		var version = date(competency["schema:dateModified"],null,true);
		var r = new EcCompetency();
		r.assignIdAndVersion(repoEndpoint(),internalId,version);
		p.CFItems[i] = r.id;
	}
	f.competency = p.CFItems;
	return results;
}

ingestCase = function () {
	var targetUrl = this.params.caseEndpoint;
	if (targetUrl == null)
		return "Please specify caseEndpoint = <target server> -- we'll add the /ims/case/v1p0.";
	this.targetUrl = targetUrl;
	var documents = caseInterface.CFDocuments.call(this);
	var dx;
	for (var i = 0;i < documents.CFDocuments.length;i++)
	{
	    var document = documents.CFDocuments[i];
	    var f = convertCFDocumentToFramework(document);
	    var listToSave = embedCFPackageIntoFramework(f,document);
	    for (var j = 0;j < listToSave.length;j++)
		{
			var internalId = stringToHex(md5(listToSave[j].id));
			var version = date(listToSave[j]["schema:dateModified"],null,true);
			skyrepoPut.call(this,{obj:listToSave[j].toJson(),type:listToSave[j].getFullType().replace("http://", "").replaceAll("/", "."),id:internalId,version:version});
		}
	}
	return JSON.stringify(dx,null,2);
}
bindWebService("/ims/case/harvest", ingestCase);
