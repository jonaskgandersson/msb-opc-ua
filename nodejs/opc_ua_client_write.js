/* 
 * OPC UA Client
 * 
 * Client connecting with user/passwd
 * Read server time
 * Writing some value
 * 
 * Author: Jonas Andersson, Actemium
 * 
 */

"use strict"
const async = require("async");
const { OPCUAClient, MessageSecurityMode, SecurityPolicy, DataValue, AttributeIds, DataType } = require("node-opcua");

const connectionStrategy = {
    initialDelay: 2000,
    maxDelay: 10 * 1000,
    maxRetry: 10,
};

const options = {
    applicationName: "MyClient",
    connectionStrategy: connectionStrategy,
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,
    endpoint_must_exist: false
};

const credentials = {
    userName: "Administrator",
    password: ""
};

const endpointUrl = "opc.tcp://127.0.0.1:49320";

// Tag to write
const nodeId = "ns=2;s=Channel1.Device1.Tag2";

const dataValue = new DataValue({

    // serverTimestamp: null,
    // serverPicoseconds: 0,

    // sourceTimestamp: null,
    // sourcePicoseconds: 0,

    value: {
        dataType: DataType.Float,
        value: 42.0
    }
});

const nodesToWrite = [
    {
        nodeId: nodeId,
        attributeId: AttributeIds.Value,
        indexRange: null,
        value: dataValue
    }
];

// Nodes to read
const nodesToRead = [
    {
        nodeId: nodeId,
        attributeId: AttributeIds.Value,
        indexRange: null,
        dataEncoding: null
    }
];

let clientSession;
let client = OPCUAClient.create(options);

async.series([

    // connect
    function (callback) {
        client.connect(endpointUrl, callback);
    },

    // create session
    function (callback) {

        client.createSession(credentials, function (err, session) {
            if (!err) {
                clientSession = session;
            }
            callback(err);
        });
    },

    // Read value
    function (callback) {

        clientSession.read(nodesToRead, function (err, dataValues) {
            if (!err) {
                console.log("Read before write: " + dataValues[0].value.value)
            }
            callback(err);
        });
    },

    // Write value
    function (callback) {

        clientSession.write(nodesToWrite, function (err, result) {
            if (!err) {
                console.log("Write: " + JSON.stringify(result));
            }
            callback(err);
        });
    },

    // Read value
    function (callback) {

        clientSession.read(nodesToRead, function (err, dataValues) {
            if (!err) {
                console.log("Read after write: " + dataValues[0].value.value)
            }
            callback(err);
        });
    },

    // closing session
    function (callback) {
        clientSession.close(function (err) {
            callback(err);
        });
    },

    // disconnect
    function (callback) {
        client.disconnect(function () {
            client = null;
            callback();
        });
    }

], function (err) {
    if (err && client) {
        client.disconnect(function () {
            console.log(err);
        });
    } else {
        console.log(err);
    }
});
