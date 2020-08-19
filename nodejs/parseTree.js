"use strict"

var fs = require('fs')
var path = require('path');
var traverse = require('traverse');
var mm = require("micromatch");

var dataPath = path.join(__dirname, 'dataSmall.json')
var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

var configPath = path.join(__dirname, 'clientConfig.json')
var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

var monitorList = {};

traverse(data).forEach(function (x) {

    var monitorItem = {};

    if (this.isLeaf && this.key === "browseName") {

        var nodeBrowsePath = parentsToStringPath(this.parents);

        var browseMatch = findBrowseMatch(nodeBrowsePath, config.server.session.monitor.nodes);

        if (browseMatch) {
            console.log("[Browse] Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

            monitorItem["browseName"] = nodeBrowsePath;
            monitorItem["node"] = this.parent.node;
            monitorItem["settings"] = browseMatch[0].settings ? browseMatch[0].settings : config.server.session.monitor.settings;

            monitorList[this.parent.node.nodeId] = monitorItem;

        } else if (mm.any(nodeBrowsePath, config.server.session.monitor.crawler.any, { nocase: true }) &&
            mm.all(nodeBrowsePath, config.server.session.monitor.crawler.all, { nocase: true }) &&
            !mm.any(nodeBrowsePath, config.server.session.monitor.crawler.not, { nocase: true })
        ) {
            console.log("[Crawl] Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

            monitorItem["browseName"] = nodeBrowsePath;
            monitorItem["node"] = this.parent.node;
            monitorItem["settings"] = config.server.session.monitor.settings;

            monitorList[this.parent.node.nodeId] = monitorItem;
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

function findBrowseMatch(browsePath, configData) {

    var match = traverse(configData).reduce(function (acc, x) {
        if (this.isLeaf && this.key === "browsePath" && x) {

            if (browsePath.toUpperCase() === x.toUpperCase()) {
                acc.push(this.parent.node);
            }
        }
        return acc;
    }, []);

    return match.length ? match : null;
}