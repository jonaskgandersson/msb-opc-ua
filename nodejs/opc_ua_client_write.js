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
var { OPCUAClient, MessageSecurityMode, SecurityPolicy, OPCUACertificateManager, DataValue, AttributeIds, DataType } = require("node-opcua");

const connectionStrategy = {
    initialDelay: 2000,
    maxDelay: 10 * 1000,
    // maxRetry: 10,
};

const options = {
    applicationName: "MyClient",
    connectionStrategy: connectionStrategy,
    securityMode: MessageSecurityMode.Sign,
    securityPolicy: SecurityPolicy.Basic256,
    endpoint_must_exist: true
};

const credentials = {
    userName: "",
    password: ""
};

const endpointUrl = "opc.tcp://127.0.0.1:49320";

// Tag to write
const nodeId = "ns=2;s=Channel1.Device1.Tag2";

const dataValue = new DataValue({
    value: {
        dataType: DataType.Float,
        value: 46.00000
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

const selfSignedCert = {
    applicationUri: "OPCUA-TEST2",
    subject: "/CN=sdfsdf;/L=Sweden",
    dns: [],
    // ip: [],
    startDate: new Date(),
    validity: 365 * 10,
}

const clientCertificateManager = new OPCUACertificateManager({
    automaticallyAcceptUnknownCertificate: true,
});

let client = OPCUAClient.create(options);

client.on("backoff", (nbRetry, maxDelay) => {
    console.log("retrying ", nbRetry);
});

async.series([

    // Setup Certificate manager
    function (callback) {
        clientCertificateManager.initialize((err) => {
            if (!err) {
                clientCertificateManager.createSelfSignedCertificate(selfSignedCert, (callback));
            } else {
                callback(err);
            }
        });
    },

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
