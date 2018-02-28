/* 
 * Service template for node.js
 * 
 * To use this template, simply add your code in Start and Stop method

*/
"use strict";

var timerEvent; // In case you use a timer for fetching data
var interval;
var port;
var host;
var enableLogging;
var logLevel;
var filter_AND;
var filter_OR;
var filter_NOT;

var opcua;
var async;

var client;


var the_session, the_subscription, endpointUrl;

const monitoredFilteredItemsListData = {};  // Object for holding monitored OPC Items

filter_OR = ["*voltage*", "*power*"];
filter_AND = ["*.value"];
filter_NOT = [ "*active*", "*factor*"];

const _ = require("underscore");
const assert = require("assert");
const chalk = require("chalk");
const mm = require('micromatch');

opcua = require("node-opcua");
async = require("async");

const NodeClass = opcua.NodeClass;
const attributeIdtoString = _.invert(opcua.AttributeIds);
const DataTypeIdsToString = _.invert(opcua.DataTypeIds);


//services
client = new opcua.OPCUAClient();

const data = {
    reconnectionCount: 0,
    tokenRenewalCount: 0,
    receivedBytes: 0,
    sentBytes: 0,
    sentChunks: 0,
    receivedChunks: 0,
    backoffCount: 0,
    transactionCount: 0,
};

client.on("send_request", function () {
    data.transactionCount++;
});

client.on("send_chunk", function (chunk) {
    data.sentBytes += chunk.length;
    data.sentChunks++;
});

client.on("receive_chunk", function (chunk) {
    data.receivedBytes += chunk.length;
    data.receivedChunks++;
});

client.on("backoff", function (number, delay) {
    data.backoffCount += 1;
    console.log(chalk.yellow(`backoff  attempt #${number} retrying in ${delay / 1000.0} seconds`));
});

client.on("start_reconnection", function () {
    console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + endpointUrl));
});

client.on("connection_reestablished", function () {
    console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + endpointUrl));
    data.reconnectionCount++;
});

// monitoring des lifetimes
client.on("lifetime_75", function (token) {
    if (true) {
        console.log(chalk.red("received lifetime_75 on " + endpointUrl));
    }
});

client.on("security_token_renewed", function () {
    data.tokenRenewalCount += 1;
    if (true) {
        console.log(chalk.green(" security_token_renewed on " + endpointUrl));
    }
});


//browseDirection = new opcua.BrowseDirection();
endpointUrl = "opc.tcp://" + "192.168.200.55" + ":" + 4840;

async.series([

    // step 1 : connect to
    function (callback) {
        client.connect(endpointUrl, function (err) {
            if (err) {
                console.log(" cannot connect to endpoint :", endpointUrl);
            } else {
                console.log("connected !");
            }
            callback(err);
        });
    },

    // step 2 : createSession
    function (callback) {
        client.createSession(function (err, session) {
            if (!err) {
                the_session = session;
            }
            callback(err);
        });
    },

    // step 3 : read a variable with readVariableValue
    function (callback) {
        the_session.readVariableValue("ns=2;s=3", function (err, dataValue) {
            if (!err) {
                console.log(" C2 = " + dataValue.toString());
            }
            callback(err);
        });


    },
    // step 5: install a subscription and install a monitored item for 10 seconds
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

        callback(err);

    },

    function (callback) {

        var err;
        //opcua.resolveNodeId("ObjectsFolder"), "ns=2;s=D0"
        expand_opcua_node_all(the_session, opcua.resolveNodeId("ObjectsFolder"), filter_OR, filter_AND, filter_NOT, function (err, results) {

            if (err) {
                console.log(chalk.cyan(" Error auto browse "));
            }
        });

        callback(err);

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
            console.log(" failure ", err);
        } else {
            console.log("done!");
        }
        //client.disconnect(function () { });
    });



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

                                if ( mm.any( s, filter_OR, {nocase: true}) &&
                                        mm.all( s, filter_AND, {nocase: true}) &&
                                        !mm.any(s, filter_NOT, {nocase: true} )
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
            console.log("Value change: " + JSON.stringify(monitoredFilteredItemsListData[node_Id.toString()]));


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
