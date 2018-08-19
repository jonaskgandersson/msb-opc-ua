var fs = require('fs')
var path = require('path');
var traverse = require('traverse');
var mm = require("micromatch");

var dataPath = path.join(__dirname, 'dataAll.json')
var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

var configPath = path.join(__dirname, 'clientConfig.json')
var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

var monitorList = {};

traverse(data).forEach(function (x) {

    if (this.isLeaf && this.key === "browseName") {
        
        var nodeBrowsePath = parentsToStringPath(this.parents);

        findBrowseMatch( nodeBrowsePath, config );

        if (mm.any(nodeBrowsePath, config.server.session.monitor.crawl.any, { nocase: true }) &&
            mm.all(nodeBrowsePath, config.server.session.monitor.crawl.all, { nocase: true }) &&
            !mm.any(nodeBrowsePath, config.server.session.monitor.crawl.not, { nocase: true })
        ) {
            console.log("Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

            monitorList[this.parent.node.nodeId] = this.parent.node;
        }
        
    }
});

console.log(JSON.stringify(monitorList));


function parentsToStringPath(array) {

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

function findBrowseMatch(browsePath, configData){

    traverse(configData).forEach(function(x){
        if (this.isLeaf && this.key === "browsePath") {
            var pattern = [];
            pattern.push(x)
            
            if (mm.any(browsePath, pattern, { nocase: true })
            ) {
                console.log("Node: " + browsePath + ", Id: " + this.parent.node.nodeId);                
            }            
        }
    })

}