/* 
 * OPC UA Client
 * 
 * Browse Server namespace using crawl
 * save result to client and add subscription
 * to nodes from list matching browse name
 * 
 * On value change send data as JSON message.
 * 
 * Author: Jonas Andersson, Actemium
 * 
 */
var enableLogging;
var logLevel;

var opcua;
var async;
var _;
var mm;
var treeify;
var fs;
var path;
var traverse;

var client;


var clientData = {
    reconnectionCount: 0,
    tokenRenewalCount: 0,
    receivedBytes: 0,
    sentBytes: 0,
    sentChunks: 0,
    receivedChunks: 0,
    backoffCount: 0,
    transactionCount: 0,
};

var the_session, the_subscription, endpointUrl;

var monitoredItems = {};  // Object for holding monitored OPC Items

var NodeCrawler;

var configPath;
var config;

var useQuickConfig = true;

console.log('STARTING');

try {

    opcua = require("node-opcua"); // OPC UA Lib
    _ = require("underscore");
    async = require("async");
    mm = require("micromatch");

    treeify = require("treeify");

    fs = require('fs')
    path = require('path');

    traverse = require('traverse');

    // Read config from json file
    var configPath = path.join(__dirname, 'clientConfig.json')
    var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (useQuickConfig) {

        // Overide config with quick setting
        config.server.endpointUrl.host = "opc.tcp://" + "192.168.200.55";
        config.server.endpointUrl.port = "4840";
        
        config.server.session.parameters.requestedPublishingInterval = 100;
        config.server.session.parameters.requestedLifetimeCount = 1000;
        config.server.session.parameters.requestedMaxKeepAliveCount = 12;
        config.server.session.parameters.maxNotificationsPerPublish = 100;
        config.server.session.parameters.publishingEnabled = true;
        config.server.session.parameters.priority = 10;

        config.server.session.monitor.rootNode.browseName = "ObjectsFolder";

        config.server.session.monitor.settings.samplingInterval = 10000;
        config.server.session.monitor.settings.discardOldest = true;
        config.server.session.monitor.settings.queueSize = 100;

        config.server.session.monitor.crawler.any.push("*voltage*");
        config.server.session.monitor.crawler.all.push("*.value");
        config.server.session.monitor.crawler.not.push("");

    }

    NodeCrawler = opcua.NodeCrawler;

    client = new opcua.OPCUAClient(config.server.options);

    endpointUrl = config.server.endpointUrl.host + ":" + config.server.endpointUrl.port;

    client.on("send_request", function () {
        clientData.transactionCount++;
    });

    client.on("send_chunk", function (chunk) {
        clientData.sentBytes += chunk.length;
        clientData.sentChunks++;
    });

    client.on("receive_chunk", function (chunk) {
        clientData.receivedBytes += chunk.length;
        clientData.receivedChunks++;
    });

    client.on("backoff", function (number, delay) {
        clientData.backoffCount += 1;
        console.log('backoff  attempt #${number} retrying in ${delay / 1000.0} seconds');
    });

    client.on("start_reconnection", function () {
        console.log(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + endpointUrl);
    });

    client.on("connection_reestablished", function () {
        console.log(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + endpointUrl);
        clientData.reconnectionCount++;
    });

    // monitoring des lifetimes
    client.on("lifetime_75", function (token) {
        if (true) {
            console.log("received lifetime_75 on " + endpointUrl);
        }
    });

    client.on("security_token_renewed", function () {
        clientData.tokenRenewalCount += 1;
        if (true) {
            console.log(" security_token_renewed on " + endpointUrl);
        }
    });

    Run();

}
catch (e) {
    console.log(null, '00001', e);
}

function Run(message, context) {
    me = this;

    async.series([

        // step 1 : connect to
        function (callback) {
            client.connect(endpointUrl, function (err) {
                if (err) {
                    console.log(" cannot connect to endpoint :" + endpointUrl);
                } else {
                    console.log("***connected !");
                }
                callback(err);
            });
        },

        // step 2 : createSession
        function (callback) {
            client.createSession(function (err, session) {
                if (!err) {
                    the_session = session;
                    console.log("Session created !");
                }
                callback(err);
            });
        },

        // step 3: install a subscription
        function (callback) {

            var err;

            the_subscription = new opcua.ClientSubscription(the_session, config.server.session.parameters);

            console.log("Subscription created !");

            callback(err);

        },

        // step 4: crawl namespace of server
        function (callback) {

            const crawler = new NodeCrawler(the_session);

            crawler.maxNodesPerRead = config.server.session.monitor.crawler.maxNodesPerRead;
            crawler.maxNodesPerBrowse = config.server.session.monitor.crawler.maxNodesPerBrowse;

            crawler.on("browsed", function (element) {
                // console.log("->",element.browseName.name,element.nodeId.toString());
            });

            // Set start node for browse 
            const nodeId = opcua.resolveNodeId(config.server.session.monitor.rootNode.browseName);

            console.log("Now crawling " + config.server.session.monitor.rootNode.browseName + " folder ...please wait...");
            crawler.read(nodeId, function (err, obj) {

                if (!err) {
                    console.log("Crawling done!");


                    var filterdItems = walkNameSpace(obj, config.server.session.monitor)

                    for (var key in filterdItems) {
                        if (filterdItems.hasOwnProperty(key)) {
                            monitor_filtered_item(the_subscription, filterdItems[key]);
                        }
                    }

                    // Dump result to file and console
                    fs.writeFileSync('./data.json', JSON.stringify(obj), 'utf-8');
                    // treeify.asLines(obj, true, true, function (line) {
                    //     console.log(line);
                    // });
                } else {
                    console.log("Crawling failed, error: " + err);
                }
                callback(err);
            });
        },

        // close session
        function (callback) {
            // the_session.close(function (err) {
            //     if (err) {
            //         console.log("session closed failed ?");
            //     }
            //     callback();
            // });
        }

    ],
        function (err) {
            if (err) {
                console.log(" failure " + err);
            } else {
                console.log("done!");
            }
            //client.disconnect(function () { });
        });
}

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

function walkNameSpace(nameSpaceData, monitorConfig) {

    var monitorList = {};

    traverse(nameSpaceData).forEach(function (x) {

        var monitorItem = {};

        if (this.isLeaf && this.key === "browseName") {

            var nodeBrowsePath = parentsToStringPath(this.parents);

            var browseMatch = findBrowseMatch(nodeBrowsePath, monitorConfig.nodes);

            if (browseMatch) {
                console.log("[Browse] Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

                monitorItem["browseName"] = nodeBrowsePath;
                monitorItem["node"] = this.parent.node;
                monitorItem["settings"] = browseMatch[0].settings ? browseMatch[0].settings : monitorConfig.settings;

                monitorList[this.parent.node.nodeId] = monitorItem;

            } else if (mm.any(nodeBrowsePath, monitorConfig.crawler.any, { nocase: true }) &&
                mm.all(nodeBrowsePath, monitorConfig.crawler.all, { nocase: true }) &&
                !mm.any(nodeBrowsePath, monitorConfig.crawler.not, { nocase: true })
            ) {
                console.log("[Crawl] Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

                monitorItem["browseName"] = nodeBrowsePath;
                monitorItem["node"] = this.parent.node;
                monitorItem["settings"] = monitorConfig.settings;

                monitorList[this.parent.node.nodeId] = monitorItem;
            }

        }
    });

    return monitorList;
}

function monitor_filtered_item(g_subscription, item) {

    const monitoredItem = g_subscription.monitor({
        nodeId: item.node.nodeId,
        attributeId: opcua.AttributeIds.Value,
        dataEncoding: { namespaceIndex: 0, name: null }
    },
        item.settings,
        opcua.read_service.TimestampsToReturn.Both
    );

    // Add monitored nodes to map list
    createNodeObject(item.node.nodeId, function (err, data) {

        if (!err) {
            monitoredItems[item.node.nodeId.toString()] = data;
            monitoredItems[item.node.nodeId.toString()].browsePath = item.browseName;
            console.log("Add " + monitoredItems[item.node.nodeId.toString()].browseName.name.toString() + " to monitoring list");
        }
        else {
            console.log("#createObject error:" + err);
        }
    });

    monitoredItem.on("changed", function (dataValue) {

        if (item.node.nodeId.toString() in monitoredItems) {

            monitoredItems[item.node.nodeId.toString()].value = dataValue.value;
            monitoredItems[item.node.nodeId.toString()].statusCode = dataValue.statusCode;
            monitoredItems[item.node.nodeId.toString()].serverTimestamp = dataValue.serverTimestamp;
            monitoredItems[item.node.nodeId.toString()].sourceTimestamp = dataValue.sourceTimestamp;
            monitoredItems[item.node.nodeId.toString()].clientTimestamp = new Date();

            console.log("Value change: " + JSON.stringify(monitoredItems[item.node.nodeId.toString()], null, 4));

        }
        else {
            console.log("Value changed unknown nodeId: " + item.node.nodeId.toString());
        }
    });

}

function createNodeObject(node_Id, callback) {

    the_session.readAllAttributes(node_Id, function (err, result) {

        if (!err) {
            callback(err, result);
        }
        else {
            callback(err, null);
        }
    })
}