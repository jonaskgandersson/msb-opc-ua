var fs = require('fs')
var path = require('path');
var traverse = require('traverse');
var mm = require("micromatch");

var dataPath = path.join(__dirname, 'dataAll.json')
var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

filter_OR = ["*voltage*", "*power*"];
filter_AND = ["*.value"];
filter_NOT = [];    //[ "*active*", "*factor*"];


const parentsToPath = (array) => {

    var arrayPath = [];
    array.forEach(function (element) {

        if (element.keys.find(function (el) {
            return el === "browseName";
        })) {
            arrayPath.push(element.node.browseName);
        }
    });

    return arrayPath.join('.');
}

traverse(data).forEach(function (x) {

    if (this.isLeaf && this.key === "browseName") {
        
        var nodeBrowsePath = parentsToPath(this.parents);

        if (mm.any(nodeBrowsePath, filter_OR, { nocase: true }) &&
            mm.all(nodeBrowsePath, filter_AND, { nocase: true }) &&
            !mm.any(nodeBrowsePath, filter_NOT, { nocase: true })
        ) {
            console.log("Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);
        }
        
    }
});
