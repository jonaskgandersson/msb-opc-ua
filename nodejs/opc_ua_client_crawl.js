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

var port;
var host;
var enableLogging;
var logLevel;


var opcua;
var async;
var _;
var assert;
var chalk;
var mm;

var util;

var NodeClass;
var attributeIdtoString;
var DataTypeIdsToString;

var client;

var makeRelativePath;
var makeBrowsePath

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

var options = {
    endpoint_must_exist: false,
    keepSessionAlive: true,
    connectionStrategy: {
        maxRetry: 10,
        initialDelay: 2000,
        maxDelay: 10 * 1000
    }
};


var the_session, the_subscription, endpointUrl;

var monitoredFilteredItemsListData = {};  // Object for holding monitored OPC Items

var NodeCrawler;
var treeify;
var fs;
var path;

port = "4840";
host = "192.168.200.55";

console.log('STARTING');

try {

    opcua = require("node-opcua"); // OPC UA Lib
    _ = require("underscore");
    assert = require("assert");
    async = require("async");
    mm = require("micromatch");

    treeify = require("treeify");

    util = require('util');
    fs = require('fs')
    path = require('path');

    NodeCrawler = opcua.NodeCrawler;

    NodeClass = opcua.NodeClass;
    attributeIdtoString = _.invert(opcua.AttributeIds);
    DataTypeIdsToString = _.invert(opcua.DataTypeIds);

    client = new opcua.OPCUAClient(options);

    endpointUrl = "opc.tcp://" + host + ":" + port;

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

    var configPath = path.join(__dirname, 'clientConfig.json')
    var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    Process();

}
catch (e) {
    console.log(null, '00001', e);
}

function Process(message, context) {
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

        // step 3: install a subscription and install a monitored item for 10 seconds
        function (callback) {

            var err;

            // assert(the_session);
            const parameters = {
                requestedPublishingInterval: 100,
                requestedLifetimeCount: 1000,
                requestedMaxKeepAliveCount: 12,
                maxNotificationsPerPublish: 100,
                publishingEnabled: true,
                priority: 10
            };
            the_subscription = new opcua.ClientSubscription(the_session, parameters);

            console.log("Subscription created !");

            callback(err);

        },

        // step 4: crawl namespace of server
        function (callback) {

            const crawler = new NodeCrawler(the_session);

            crawler.maxNodesPerRead = 10;
            crawler.maxNodesPerBrowse = 2;

            crawler.on("browsed", function (element) {
                // console.log("->",element.browseName.name,element.nodeId.toString());
            });

            const nodeId = opcua.resolveNodeId("ObjectsFolder");

            console.log("now crawling object folder ...please wait...");
            crawler.read(nodeId, function (err, obj) {

                 fs.writeFileSync('./data.json', JSON.stringify(obj) , 'utf-8');

                if (!err) {
                    treeify.asLines(obj, true, true, function (line) {
                        console.log(line);
                    });


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