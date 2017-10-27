/* 
 * Service template for node.js
 * 
 * To use this template, simply add your code in Start and Stop method

*/
var timerEvent; // In case you use a timer for fetching data
var interval;

//var opcua;
//var async;

//var client;
//var endpointUrl;

//var the_session, the_subscription;


var exports = module.exports = {
    
    Start : function () {
        me = this;
        this.Debug('Start')
        interval = this.GetPropertyValue('static', 'interval');
        
        this.AddNpmPackage('node-opcua, async', true, function(err){
            me.Debug('STARTING');
            if(err == null || err == ''){
                try{                    
                    
                    var opcua = require("node-opcua");
                    var async = require("async");
                    
                    var client = new opcua.OPCUAClient();
                    var endpointUrl = "opc.tcp://" + "192.168.200.10" + ":4840";
                    
                    
                    var the_session, the_subscription;
                    
                    
                    async.series([
                    
                        // step 1 : connect to
                        function(callback)  {
                            client.connect(endpointUrl,function (err) {
                                if(err) {
                                    me.Debug(" cannot connect to endpoint :" , endpointUrl );
                                } else {
                                    me.Debug("connected !");
                                }
                                callback(err);
                            });
                        },
                    
                        // step 2 : createSession
                        function(callback) {
                            client.createSession( function(err,session) {
                                if(!err) {
                                    the_session = session;
                                }
                                callback(err);
                            });
                        },
                        //"ns=0;i=85" "RootFolder"
                        // step 3 : browse
                        function(callback) {
                           the_session.browse(  "ns=0;i=85"  , function(err,browse_result){
                               if(!err) {
                                   browse_result[0].references.forEach(function(reference) {
                                    me.Debug( reference.browseName.toString());
                    
                                    the_session.browse( reference.nodeId.toString() , function(err,browse_result){
                                        if(!err) {
                                            browse_result[0].references.forEach(function(reference) {                       
                                             //console.log("|");
                                             me.Debug( "-" + reference.browseName.toString());
                                            });
                                        }
                                    });              
                                    
                                   });
                               }
                               callback(err);
                           });
                        },
                    
                        // step 4 : read a variable with readVariableValue
                        function(callback) {
                           the_session.readVariableValue("ns=2;s=3", function(err,dataValue) {
                               if (!err) {
                                   me.Debug(" C2 = " , dataValue.toString());
                               }
                               callback(err);
                           });
                           
                           
                        },
                        
                        // step 4' : read a variable with read
                        function(callback) {
                           var max_age = 0;
                           var nodes_to_read = [
                              { nodeId: "ns=2;s=2", attributeId: opcua.AttributeIds.BrowseName } 
                           ];
                           the_session.read(nodes_to_read, max_age, function(err,nodes_to_read,dataValues) {
                               if (!err) {
                                   me.Debug(" C1 = " , dataValues[0]);
                               }
                               callback(err);
                           });
                           
                           
                        },
                        
                        // step 5: install a subscription and install a monitored item for 10 seconds
                        function(callback) {
                           
                           the_subscription=new opcua.ClientSubscription(the_session,{
                               requestedPublishingInterval: 1000,
                               requestedLifetimeCount: 10,
                               requestedMaxKeepAliveCount: 2,
                               maxNotificationsPerPublish: 10,
                               publishingEnabled: true,
                               priority: 10
                           });
                           
                           the_subscription.on("started",function(){
                               me.Debug("subscription started for 2 seconds - subscriptionId=",the_subscription.subscriptionId);
                           }).on("keepalive",function(){
                               me.Debug("keepalive");
                           }).on("terminated",function(){
                               callback();
                           });
                           
                           setTimeout(function(){
                               the_subscription.terminate();
                           },10000);
                           
                           // install monitored item
                           var monitoredItem  = the_subscription.monitor({
                               nodeId: opcua.resolveNodeId("ns=2;s=2"),
                               attributeId: opcua.AttributeIds.Value
                           },
                           {
                               samplingInterval: 100,
                               discardOldest: true,
                               queueSize: 10
                           },
                           opcua.read_service.TimestampsToReturn.Both
                           );
                           me.Debug("-------------------------------------");
                           
                           monitoredItem.on("changed",function(dataValue){
                              me.Debug(" C1 = ",dataValue.value.value);
                           });
                        },
                    
                        // close session
                        function(callback) {
                            the_session.close(function(err){
                                if(err) {
                                    me.Debug("session closed failed ?");
                                }
                                callback();
                            });
                        }
                    
                    ],
                    function(err) {
                        if (err) {
                            me.Debug(" failure ",err);
                        } else {
                            me.Debug("done!");
                        }
                        client.disconnect(function(){});
                    }) ;
                    //me.Process();
                                        
                }
                catch(e){
                    me.ThrowError(null, '00001', e);
                }
            }
            else{
                me.ThrowError(null, '00001', 'Unable to install node-opcua npm package');
                me.ThrowError(null,'00001',JSON.stringify(err));
                return;
            }
        });        

        
    },

    // The Stop method is called from the Host when the Host is 
    // either stopped or has updated integrations. 
    Stop : function () {
        this.Debug('The Stop method is called.');
    
    },    
    
    Process : function (message, context) {
        me = this;
    
        

    },    
}
