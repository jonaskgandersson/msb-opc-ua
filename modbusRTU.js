/* 
 * Service template for node.js
 * 
 * To use this template, simply add your code in Start and Stop method

*/
var timerEvent; // In case you use a timer for fetching data
var interval;
var baudRate;
var serialPortPath;
var batchSize;
var me;
var client;
var uuid = require('uuid');
var moment = require('moment');
var baseReading = [];
var value;
var configuration;
var sensors;
var exports = module.exports = {

    Start: function () {
        me = this;
        // Fetch all the static properties of the service
        interval = this.GetPropertyValue('static', 'interval');
        serialPortPath = this.GetPropertyValue('static', 'serialPortPath');
        baudRate = this.GetPropertyValue('static', 'baudRate');
        batchSize = this.GetPropertyValue('static', 'batchSize');
        
        configuration = this.GetPropertyValue('static', 'configuration');
        sensors = JSON.parse(configuration);
       // me.Debug("Sensors: " + JSON.stringify(sensors));

        this.AddNpmPackage('modbus-serial,async-foreach', true, function (err) {
            if (err == null || err == '') {
                var ModbusRTU = require("modbus-serial");

                // me.Debug("client:" + client);
                // Creates a client if the service has not already created one
                if (!client) {
                    console.log("TEST")
                    me.Debug("Creating client");
                    client = new ModbusRTU();
                    var options = {
                        baudrate: baudRate,
                        parity: 'even',
                        stopBits: 1,
                        dataBits: 8 // alt 7
                    };
                    // open connection to a serial port 
                    client.connectRTUBuffered(serialPortPath, options, function(err){
                        me.Debug("CONNECTED: " + err);
                        me.Run();
                       timerEvent = setInterval(function () {
                           me.Run();
                       },
                       1000 * interval);
                    });
                }
                
            }
            else {
                me.ThrowError(null, '00001', 'Unable to install the modbus-stream npm package');
                return;
            }
        });
    },

    // The Stop method is called from the Host when the Host is 
    // either stopped or has updated integrations. 
    Stop: function () {
        me.Debug('The Stop method is called.');
        //Close the connection with the serial-port and clear the timerInterval to avoid redundancy
        client.close();
        clearInterval(timerEvent);

    },

    Process: function (message, context) { },
    Run: function(){
        var forEach = require('async-foreach').forEach;
        me.Debug("Run is called...")
         forEach(sensors, function (reading, index, arr) {
                        var done = this.async();
                        me.Debug("reading: " + JSON.stringify(reading));
                        me.Debug("index: " + index);
                        
                        if (baseReading.length < batchSize) {
                            // Calling readHoldingRegisters to fetch data for sensor
                            client.setID(reading.slaveAdress);
                            me.Debug("Now reading slave adress " + reading.slaveAdress);

                            value = null;
                            //me.Debug("Now reading data from sensortype" + reading.type);
                            client.readHoldingRegisters(reading.registerAdress, reading.registerSize, function (err, data) {
                                if (err) {
                                    me.Debug("error1: " + JSON.stringify(err));
                                    done();
                                    return;
                                }
                                else {
                                    me.Debug("Reading complete");
                                    var buf = Buffer.from(data.data);
                                    
                                    value = 0;
                                    if(reading.slaveAdress < 20){    
                                        for (var i = 0; i < buf.length; ++i) {        
                                            value += buf[i];        
                                            if (i < buf.length-1) {
                                                value = value << 8;
                                            }
                                        }
                                        value = value / 1000;
                                    }
                                    if(reading.slaveAdress  > 20){    
                                        value = data.data[1] / 100;
                                    }
                                 
                                    //Save data in KWh and sets all the properties of the reading
                                      //  if(reading.slaveAdress === 10 || reading.slaveAdress === 11)
                                           // value = data.data //[2] / 1000;
                                            //if(reading.slaveAdress === 29 || reading.slaveAdress === 28)
                                               // value = data.data[1] * 10;
                                        
                                    me.Debug("Data: " + value + " " + reading.unit);
                                    me.Debug("unitRegisterAdress for Slave Adress "+ reading.slaveAdress  + ": "+ reading.unitRegisterAdress);
                                    
                                    if (reading.unitRegisterAdress !== undefined) {
                                        me.Debug("Now reading unitdata for slaveAdress " + reading.slaveAdress);
                                        client.readHoldingRegisters(reading.unitRegisterAdress, reading.unitRegisterSize, function (err, data) {
                                            if (err) {
                                                me.Debug("unit error: " + JSON.stringify(err));
                                                done();
                                                return;
                                            }
                                            else {
                                                reading.unit = data.data[0];
                                                if(reading.unit === 18){
                                                    value = value *1000;
                                                    reading.unit = 'kWh';
                                                    
                                                }
                                                else{
                                                    reading.unit = 'kWh';
                                                }
                                                me.Debug("Updated data " + value);
                                                me.Debug("unit:" + reading.unit);
                                                let sensorReading =
                                                    {
                                                        id: uuid.v1(),
                                                        device: me.NodeName,
                                                        sensor: reading.sensor,
                                                        type: reading.type,
                                                        ts: moment.utc(),
                                                        v: value,
                                                        u: reading.unit
                                                    };
                                                baseReading.push(sensorReading);
                                                done();
                                                //me.Debug("data: " + value);

                                            }
                                        });
                                    }
                                    else {
                                        let sensorReading =
                                            {
                                                id: uuid.v1(),
                                                device: me.NodeName,
                                                sensor: reading.sensor,
                                                type: reading.type,
                                                ts: moment.utc(),
                                                v: value,
                                                u: reading.unit
                                            };
                                        baseReading.push(sensorReading);
                                        //me.Debug("Data pushed to readingsArray: " + value);
                                        done();
                                    }
                                }
                            });

                        }
                        else {
                            //Submit the message containing a number of readings
                            me.SubmitMessage(baseReading, 'application/json', []);
                            me.Debug("Message has been submitted");
                            baseReading = [];
                            done();
                        }
                        
                    
                    });
    }
}


