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

var self;

var logLevel;
var enableLogging;

var opcua;
var _;
var async = require("async");
var mm;
var treeify;
var fs;
var path;
var traverse;

// Configuration for server connections
var config;

// OPC UA client
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

const credentials = {
    userName: "test",
    password: "test"
};

var the_session, the_subscription, endpointUrl;
var NodeCrawler;

// Object for holding monitored OPC Items
var monitoredItems = {};

var exports = module.exports = {

    Start: function () {
        self = this;
        this.Debug('Start');

        // logLevel = this.GetPropertyValue('static', 'logLevel');
        // enableLogging = this.GetPropertyValue('static', 'enableLogging');
        try {
            config = JSON.parse(self.GetPropertyValue('static', 'advancedConfig'));
            var useQuickConfig = self.GetPropertyValue('static', 'useQuickConfig');

            if (useQuickConfig) {

                // Overide config with quick setting
                config.server.endpointUrl.host = "opc.tcp://" + self.GetPropertyValue('static', 'host');
                config.server.endpointUrl.port = self.GetPropertyValue('static', 'port');

                config.server.session.parameters.requestedPublishingInterval = self.GetPropertyValue('static', 'publishingInterval');
                config.server.session.parameters.requestedLifetimeCount = 1000;
                config.server.session.parameters.requestedMaxKeepAliveCount = 12;
                config.server.session.parameters.maxNotificationsPerPublish = 100;
                config.server.session.parameters.publishingEnabled = true;
                config.server.session.parameters.priority = 10;

                config.server.session.monitor.rootNode.browseName = self.GetPropertyValue('static', 'rootNodeCrawl');

                config.server.session.monitor.settings.samplingInterval = self.GetPropertyValue('static', 'samplingInterval');
                config.server.session.monitor.settings.discardOldest = self.GetPropertyValue('static', 'discardOldest');
                config.server.session.monitor.settings.queueSize = self.GetPropertyValue('static', 'queueSize');

                config.server.session.monitor.crawler.any = JSON.parse(self.GetPropertyValue('static', 'matchAny'));
                config.server.session.monitor.crawler.all = JSON.parse(self.GetPropertyValue('static', 'matchAll'));
                config.server.session.monitor.crawler.not = JSON.parse(self.GetPropertyValue('static', 'matchNot'));

            }

            endpointUrl = config.server.endpointUrl.host + ":" + config.server.endpointUrl.port;
        } catch (e) {
            self.ThrowError(null, '00001', e);
        }

        this.AddNpmPackage('node-opcua@2.10.0,micromatch,treeify,traverse', true, function (err) {
            self.Debug('STARTING');
            if (err === null || err === '') {
                try {

                    opcua = require("node-opcua");
                    _ = require("underscore");

                    mm = require("micromatch");
                    treeify = require("treeify");
                    fs = require('fs')
                    path = require('path');
                    traverse = require('traverse');

                    NodeCrawler = opcua.NodeCrawler;

                    client = opcua.OPCUAClient.create(config.server.options);

                    // Start OPC UA client
                    Run();

                }
                catch (e) {
                    self.ThrowError(null, '00001', e);
                }
            } else {
                self.ThrowError(null, '00001', 'Unable to install node-opcua npm package');
                self.ThrowError(null, '00001', JSON.stringify(err));
                return;
            }
        });

    },
    // The Stop method is called from the Node when the Node is
    // either stopped or has updated Flows.
    Stop: function () {
        self.Debug('The Stop method is called.');

        // Close OPC UA session and disconnect client from server
        the_session.close(function (err) {
            if (err) {
                console.log("session closed failed ?");
            }
            client.disconnect(function () {});
        });
    },

    Process: function (message, context) {

        self.Debug('The Process method is called.');
        self.Debug('Process complete');
    },
}

// Called on value change, add customization of data here
function sendMessage(data) {


    let payload = {
        id: self.NodeName,
        Time: Date.now(),
        geohash: "u626kuwks"
    };

    payload[data.browseName.name] = data.value.value;

    self.Debug(JSON.stringify(payload));

    self.SubmitMessage(payload, 'application/json', []);
}

function Run() {

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

    async.series([

        // step 1 : connect to server
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
            client.createSession(credentials, function (err, session) {
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

            the_session.createSubscription2(config.server.session.parameters, function (err, subsc) {
                if (!err) {
                    the_subscription = subsc;
                    console.log("Subscription created !");
                }
            });

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

            // Set start node for browse TO DO, use nodeId in config if set
            const nodeId = opcua.resolveNodeId(config.server.session.monitor.rootNode.browseName);

            console.log("Now crawling " + config.server.session.monitor.rootNode.browseName + " folder ...please wait...");
            crawler.read(nodeId, function (err, obj) {

                if (!err) {
                    console.log("Crawling done!");

                    // Walk returned namespace and return matching nodes
                    var filterdItems = walkNameSpace(obj, config.server.session.monitor)

                    // Add filtered items to subscription
                    for (var key in filterdItems) {
                        if (filterdItems.hasOwnProperty(key)) {
                            monitorFilteredItem(the_subscription, filterdItems[key]);
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
        }],
        function (err) {
            if (err) {
                console.log(" failure " + err);
            } else {
                console.log("done!");
            }
        });
}

// Returns browse path for an node in namespace
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

// Check if any exact match for node is in config
function findBrowseMatch(browsePath, configData) {

    var match = traverse(configData).reduce(function (acc, x) {
        if (this.isLeaf && this.key === "browsePath" && x) {

            if (browsePath.toUpperCase() === x.toUpperCase()) {
                acc.push(this.parent.node);
            }
        }
        return acc;
    }, []);

    return match.length ? match: null;
}

// Walk namespace and return nodes mathing nodes in config
function walkNameSpace(nameSpaceData, monitorConfig) {

    var monitorList = {};

    traverse(nameSpaceData).forEach(function (x) {

        var monitorItem = {};

        if (this.isLeaf && this.key === "browseName") {

            var nodeBrowsePath = parentsToStringPath(this.parents);

            var browseMatch = findBrowseMatch(nodeBrowsePath, monitorConfig.nodes);

            // If exact match in config skip crawling for node
            if (browseMatch) {
                console.log("[Browse] Match Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

                monitorItem["browseName"] = nodeBrowsePath;
                monitorItem["node"] = this.parent.node;
                monitorItem["settings"] = browseMatch[0].settings ? browseMatch[0].settings: monitorConfig.settings;

                monitorList[this.parent.node.nodeId] = monitorItem;

            } else if (mm.any(nodeBrowsePath, monitorConfig.crawler.any, {
                    nocase: true
                }) &&
                mm.all(nodeBrowsePath, monitorConfig.crawler.all, {
                    nocase: true
                }) &&
                !mm.any(nodeBrowsePath, monitorConfig.crawler.not, {
                    nocase: true
                })
            ) {
                console.log("[Crawl] Match Node: " + nodeBrowsePath + ", Id: " + this.parent.node.nodeId);

                monitorItem["browseName"] = nodeBrowsePath;
                monitorItem["node"] = this.parent.node;
                monitorItem["settings"] = monitorConfig.settings;

                monitorList[this.parent.node.nodeId] = monitorItem;
            }

        }
    });

    return monitorList;
}

// Add items to monitor list and add an subscription on server
function monitorFilteredItem(g_subscription, item) {

    g_subscription.monitor({
        nodeId: item.node.nodeId,
        attributeId: opcua.AttributeIds.Value,
        dataEncoding: {
            namespaceIndex: 0, name: null
        }
    },
        item.settings,
        opcua.TimestampsToReturn.Both,
        function (err, monitoredItem) {
            if (!err) {

                // Add monitored nodes to map list
                createNodeObject(item.node.nodeId, function (err, data) {

                    if (!err) {
                        monitoredItems[item.node.nodeId.toString()] = data;
                        monitoredItems[item.node.nodeId.toString()].browsePath = item.browseName;
                        console.log("Add " + monitoredItems[item.node.nodeId.toString()].browseName.name.toString() + " to monitoring list");
                    } else {
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

                        // Submit payload to mSB
                        sendMessage(monitoredItems[item.node.nodeId.toString()]);
                    } else {
                        console.log("Value changed unknown nodeId: " + item.node.nodeId.toString());
                    }
                });
            }
        }
    );
}

// Fetch all attributes for an node on server
function createNodeObject(node_Id, callback) {

    the_session.readAllAttributes(node_Id, function (err, result) {

        if (!err) {
            callback(err, result);
        } else {
            callback(err, null);
        }
    })
}