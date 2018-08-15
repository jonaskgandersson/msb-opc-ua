/* 
 * OPC UA Client
 * 
 * Connect to OPC UA Server, browse server and create subscriptions for 
 * nodes that match filer strings.
 * 
 * On value change send data as JSON message.
 * 
 * Author: Jonas Andersson, Actemium
 * 
 */


var timerEvent; // In case you use a timer for fetching data
var interval;
var port;
var host;
var enableLogging;
var logLevel;
var filter_AND;
var filter_OR;
var filter_NOT;
var mSB_filter_AND;
var mSB_filter_OR;
var mSB_filter_NOT;


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


//filter_OR = ["*voltage*", "*power*"];
//filter_AND = ["*.value"];
//filter_NOT = [];    //[ "*active*", "*factor*"];

port = "4840";
host = "192.168.200.55";

filter_AND = ["*.value"];
filter_OR = ["*voltage*", "*power*"];
filter_NOT = [];


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
        /* step 3 : read a variable with readVariableValue
      function(callback) {
         the_session.readVariableValue("ns=2;s=1", function(err,dataValue) {
             if (!err) {
                 console.log(" C0 = " , dataValue.toString());
             }
             callback(err);
         });
         
         
      },*/


        // step 4: install a subscription and install a monitored item for 10 seconds
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

        function (callback) {

            const crawler = new NodeCrawler(the_session);

            crawler.maxNodesPerRead = 10;
            crawler.maxNodesPerBrowse = 2;

            // const data = {};

            // let t = Date.now();
            // client.on("send_request", function () {
            //     t1 = Date.now();
            // });


            //client.on("receive_response", print_stat);

            // t = Date.now();
            //xx crawler.on("browsed", function (element) {
            //xx     console.log("->",(new Date()).getTime()-t,element.browseName.name,element.nodeId.toString());
            //xx });

            // "ns=2;s=Actemium [ProcessingUnit]" //ObjectsFolder "Real Devices" D0 
            // const nodeId = opcua.resolveNodeId("ns=2;s=D0");
            //const nodeId =  opcua.makeNodeId(opcua.ObjectIds.Server);
            // console.log("now crawling object folder ...please wait...");
            // crawler.read(nodeId, function (err, obj) {
            //     console.log(" Time         = ", (new Date()).getTime() - t);
            //     console.log(" read        = ", crawler.readCounter);
            //     console.log(" browse      = ", crawler.browseCounter);
            //     console.log(" transaction = ", crawler.transactionCounter);
            //     if (!err) {


            //         console.log("Crawl done!");

            //     }
            //     //client.removeListener("receive_response", print_stat);
            //     callback(err);
            // });

            // crawler.on("browsed", function (nodeElement, data) {
            //     console.log("Crawler browsed data: " + data)
            // });

            // crawler.crawl(nodeId, data, function (err) {
            //     if (err) {
            //         console.log("Crawler done error: " + err);
            //         return;
            //     }
            //     crawler.crawl(nodeId, data, function (err) {
            //         console.log("Crawler done error: " + err);
            //     });

            // });


            crawler.on("browsed", function (element) {
                // console.log("->",element.browseName.name,element.nodeId.toString());
            });

            // const nodeId = opcua.resolveNodeId("ns=2;s=Real Devices");
            const nodeId = opcua.resolveNodeId("ObjectsFolder");

            console.log("now crawling object folder ...please wait...");
            crawler.read(nodeId, function (err, obj) {

                // fs.writeFileSync('./data.json', JSON.stringify(obj) , 'utf-8');

                if (!err) {
                    // treeify.asLines(obj, true, true, function (line) {
                    //     console.log(line);
                    // });

                    
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



function expand_opcua_node_all(g_session, node_Id, filter_OR, filter_AND, filter_NOT, callback) {

    if (!g_session) {
        return callback(new Error("No Connection"));
    }

    const children = [];

    const b = [
        {
            nodeId: node_Id,
            referenceTypeId: "HierarchicalReferences",//"Organizes",
            includeSubtypes: true,
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f

        },
        {
            nodeId: node_Id,
            referenceTypeId: "Aggregates",
            includeSubtypes: true,
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f

        }

    ];

    g_session.browse(b, function (err, results) {

        if (!err) {

            let result = results[0];

            for (let i = 0; i < result.references.length; i++) {

                const ref = result.references[i];

                // console.log( ref.toString() );

                if (ref.nodeClass === opcua.NodeClass.Variable) {
                    var nodeTemp = {

                        nodeId: ref.nodeId,
                        attributeId: opcua.AttributeIds.BrowseName,
                        indexRange: null,
                        dataEncoding: { namespaceIndex: 0, name: null }
                    };
                    g_session.read(nodeTemp, function (err, data) {

                        if (!err) {

                            if (data.statusCode === opcua.StatusCodes.Good) {

                                const s = data.value.value.toString();

                                if (mm.any(s, filter_OR, { nocase: true }) &&
                                    mm.all(s, filter_AND, { nocase: true }) &&
                                    !mm.any(s, filter_NOT, { nocase: true })
                                ) {

                                    //console.log(" Browse name: " + s);
                                    monitor_filtered_item(the_subscription, ref.nodeId);

                                }
                            }

                        } else {
                            console.log("*************\r\n" + ref.toString() + "*************\r\n");
                            //console.log("#readAllAttributes returned ", err.message);
                        }
                    });
                }
                else {
                    expand_opcua_node_all(g_session, ref.nodeId, filter_OR, filter_AND, filter_NOT, function (err, results) {

                        if (err) {
                            console.log(" Error auto browse ");
                        }

                    });

                }


            }

        } else {
            console.log("Error browse: " + b.toString())
        }
        callback(err, children);
    });
}



function monitor_filtered_item(g_subscription, node_Id) {

    const monitoredItem = g_subscription.monitor({
        nodeId: node_Id,
        attributeId: opcua.AttributeIds.Value,
        dataEncoding: { namespaceIndex: 0, name: null }
    },
        {
            samplingInterval: 10000,
            discardOldest: true,
            queueSize: 100
        },
        opcua.read_service.TimestampsToReturn.Both
    );


    // Add monitored nodes to map list
    createNodeObject(node_Id, function (err, data) {

        if (!err) {
            monitoredFilteredItemsListData[node_Id.toString()] = data;
            console.log("Add " + monitoredFilteredItemsListData[node_Id.toString()].browseName.name.toString() + " to monitoring list");
            // console.log(JSON.stringify(data));
        }
        else {
            console.log("#createObject:" + err);
        }
    });

    // subscription.on("item_added",function(monitoredItem){
    //xx monitoredItem.on("initialized",function(){ });
    //xx monitoredItem.on("terminated",function(value){ });

    monitoredItem.on("changed", function (dataValue) {

        //       console.log("Value change: \r\n" + JSON.stringify(dataValue));

        if (node_Id.toString() in monitoredFilteredItemsListData) {


            monitoredFilteredItemsListData[node_Id.toString()].value = dataValue.value;
            monitoredFilteredItemsListData[node_Id.toString()].statusCode = dataValue.statusCode;
            monitoredFilteredItemsListData[node_Id.toString()].serverTimestamp = dataValue.serverTimestamp;
            monitoredFilteredItemsListData[node_Id.toString()].sourceTimestamp = dataValue.sourceTimestamp;
            monitoredFilteredItemsListData[node_Id.toString()].clientTimestamp = new Date();

            // console.log("Value change: " +  monitoredFilteredItemsListData[node_Id.toString()].BrowseName.toString() + ": "  + JSON.stringify(monitoredFilteredItemsListData[node_Id.toString()].DataValue.value.value));
            console.log("Value change: " + JSON.stringify(monitoredFilteredItemsListData[node_Id.toString()], null, 4));


        }
        else {
            console.log(" Unknown nodeId: " + node_Id.toString());
        }

        //console.log(" value ", dataValue.toString(), node_Id.toString(), " changed to ", chalk.green(dataValue.value.toString()));


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

function enumerateAllConditionTypes(the_session, callback) {

    const tree = {};

    const conditionEventTypes = {};

    function findAllNodeOfType(tree, typeNodeId, browseName, callback) {

        const browseDesc1 = {
            nodeId: typeNodeId,
            referenceTypeId: opcua.resolveNodeId("HasSubtype"),
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            includeSubtypes: true,
            resultMask: 63

        };
        const browseDesc2 = {
            nodeId: typeNodeId,
            referenceTypeId: opcua.resolveNodeId("HasTypeDefinition"),
            browseDirection: opcua.browse_service.BrowseDirection.Inverse,
            includeSubtypes: true,
            resultMask: 63

        };
        const browseDesc3 = {
            nodeId: typeNodeId,
            referenceTypeId: opcua.resolveNodeId("HasTypeDefinition"),
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            includeSubtypes: true,
            resultMask: 63

        };

        const nodesToBrowse = [
            browseDesc1,
            browseDesc2,
            browseDesc3
        ];
        the_session.browse(nodesToBrowse, function (err, browseResults) {

            //xx console.log(" exploring".yellow ,browseName.cyan, typeNodeId.toString());
            tree[browseName] = {};
            if (!err) {
                browseResults[0].references = browseResults[0].references || [];
                async.forEach(browseResults[0].references, function (el, _inner_callback) {
                    conditionEventTypes[el.nodeId.toString()] = el.browseName.toString();
                    findAllNodeOfType(tree[browseName], el.nodeId, el.browseName.toString(), _inner_callback);
                }, callback);
            } else {
                callback(err);
            }
        });
    }

    const typeNodeId = opcua.resolveNodeId("ConditionType");
    findAllNodeOfType(tree, typeNodeId, "ConditionType", function (err) {
        if (!err) {
            return callback(null, conditionEventTypes, tree);
        }
        callback(err);
    });
}