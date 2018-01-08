
/*global require,console,setTimeout */
var opcua = require("node-opcua");
var async = require("async");

var client = new opcua.OPCUAClient();
var endpointUrl = "opc.tcp://" + "192.168.200.55" + ":4840";


var the_session, the_subscription;

var node = { nodeId: "ns=2;s=Actemium PDU [ProcessingUnit]"};


async.series([

    // step 1 : connect to
    function(callback)  {
        client.connect(endpointUrl,function (err) {
            if(err) {
                console.log(" cannot connect to endpoint :" , endpointUrl );
            } else {
                console.log("connected !");
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
    //"2:Actemium PDU [ProcessingUnit]"
    function(callback) {
       the_session.browse(  "ns=2;s=Actemium PDU [ProcessingUnit]" , function(err,browse_result){
        if(!err) {
            browse_result[0].references.forEach(function(reference) {
                
                //console.log( reference.nodeId.toString());
             
                browseTree( the_session, reference );
                         
             
            });
        }
        //callback(err);
       });
    },
   
    
    // step ' : read a variable with read
    function(callback) {
       var max_age = 0;
       var nodes_to_read = [
          { nodeId: "ns=2;s=V0.25", attributeId: opcua.AttributeIds.BrowseName } 
       ];
       the_session.read(nodes_to_read, max_age, function(err,nodes_to_read,dataValues) {
           if (!err) {
               console.log(" Phase L1.Voltage = " , dataValues[0]);
           }
           callback(err);
       });
       
       
    },

    // close session
    function(callback) {
        the_session.close(function(err){
            if(err) {
                console.log("session closed failed ?");
            }
            callback();
        });
    }

],
function(err) {
    if (err) {
        console.log(" failure ",err);
    } else {
        console.log("done!");
    }
    client.disconnect(function(){});
}) ;



function browseTree( _session, _reference )
{
   
    //console.log( "Name: " + _reference.browseName.toString() + "   Class:" +  _reference.nodeClass.toString() );


    var browseDescription =  [
        {
            nodeId: _reference.nodeId,
            referenceTypeId: "HierarchicalReferences",//"Organizes",
            includeSubtypes: true,
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f
    
        },
        {
            nodeId: _reference.nodeId,
            referenceTypeId: "Aggregates",
            includeSubtypes: true,
            browseDirection: opcua.browse_service.BrowseDirection.Forward,
            resultMask: 0x3f
    
        }
        
    ];

    _session.browse( browseDescription , function(err,browse_result){
        if(!err) {

            browse_result[0].references.forEach(function(l_reference) {                       
                
                browseTree( _session, l_reference );

            });

            browse_result[1].references.forEach(function(l_reference) {                       
                
                //browseTree( _session, l_reference );
                //console.log("BrowseName: " + l_reference.browseName.toString() );
                var str = _reference.browseName.toString();
                var n = str.search( "Voltage" );
            
                if( n != -1)
                {
                    console.log("BrowseName: " + _reference.browseName.toString() + "DisplayName: " + _reference.displayName.toString()  );
                }
                

            });
        }
        else{
            console.log("Error : " + err);
        }
    
    });  

}

