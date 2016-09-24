'use strict';

// Module imports
var async = require('async')
  , dcl = require('./device-library.node')
  , Device = require('./device')
  , log = require('npmlog')
  , util = require('util')
  , express = require('express')
  , WebSocketServer = require('ws').Server
  , http = require('http')
  , bodyParser = require('body-parser')
;

// Initializing IoTCS stuff BEGIN
dcl = dcl({debug: false});
var storePassword = 'welcome1';
var urn = [
     'urn:oracle:iot:device:data:anki:car:speed'
   , 'urn:oracle:iot:device:data:anki:car:lap'
   , 'urn:oracle:iot:device:data:anki:car:transition'
//   , 'urn:oracle:iot:device:event:anki:car:offtrack'
];
var carSpeed      = new Device(urn[0]);
var carLap        = new Device(urn[1]);
var carTransition = new Device(urn[2]);
var devices = [ carSpeed, carLap, carTransition];

// Init Devices
carSpeed.setStoreFile(process.argv[2], storePassword);
carSpeed.setUrn(urn);
carLap.setStoreFile(process.argv[2], storePassword);
carLap.setUrn(urn);
carTransition.setStoreFile(process.argv[2], storePassword);
carTransition.setUrn(urn);
// Initializing IoTCS stuff END

// Initializing REST & WS stuff BEGIN
var PORT = process.env.PORT || 8888;
var wsURI = '/ws';
var restURI = '/iot';

var app    = express()
  , router = express.Router()
  , server = http.createServer(app)
  , wss = new WebSocketServer({
    server: server,
    path: wsURI,
    verifyClient: function (info) {
      return true;
    }
  });
  ;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


wss.on('connection', function(ws) {
  console.log("WS session connected");
  ws.on('close', function() {
    console.log("WS session disconnected");
  });
  ws.on('message', function(data, flags) {
    console.log("WS Data: " + data);
    ws.send("Hello, " + data);
  });
});

router.post('/', function(req, res) {
  console.log("POST request: " + JSON.stringify(req.body));
  var response = req.body;
  response.result = "OK";
  res.send(response);
});

app.use(restURI, router);

server.listen(PORT, function() {
  log.info(PROCESS, "REST server running on http://localhost:" + PORT + restURI);
  log.info(PROCESS, "WS server running on http://localhost:" + PORT + wsURI);
});

// Initializing REST & WS stuff END

// Misc BEGIN
const PROCESS = 'PROCESS';
const IOTCS   = 'IOTCS';
log.level ='verbose';
// Misc END

function getModel(device, urn, callback) {
  device.getDeviceModel(urn, function (response, error) {
    if (error) {
      callback(error);
    }
    callback(null, response);
  });
}

// Main handlers registration - BEGIN
// Main error handler
process.on('uncaughtException', function (err) {
  console.log("Uncaught Exception: " + err);
  console.log("Uncaught Exception: " + err.stack);
});
process.on('SIGINT', function() {
  log.info(PROCESS, "Caught interrupt signal");
  log.info(PROCESS, "Exiting gracefully");
  process.removeAllListeners()
  if (typeof err != 'undefined')
    log.error(PROCESS, err)
  process.exit(2);
});
// Main handlers registration - END

// Main initialization code
// Sequentially, we initialize IoTCS and then the WS and REST servers

async.series( {
  iot: function(callback) {
    log.info(IOTCS, "Initializing IoTCS devices");
    async.eachSeries( devices, function(d, cb) {
      async.series( [
        function(cb1) {
          // Initialize Device
          log.verbose(IOTCS, "Initializing IoT device '" + d.getName() + "'");
          d.setIotDcd(new dcl.device.DirectlyConnectedDevice(d.getIotStoreFile(), d.getIotStorePassword()));
          cb1(null);
        },
        function(cb2) {
          // Check if already activated. If not, activate it
          if (!d.getIotDcd().isActivated()) {
            log.verbose(IOTCS, "Activating IoT device '" + d.getName() + "'");
            d.getIotDcd().activate(d.getUrn(), function (device, error) {
              if (error) {
                log.error(IOTCS, "Error in activating '" + d.getName() + "' device (" + d.getUrn() + "). Error: " + error.message);
                cb2(error);
              }
              d.setIotDcd(device);
              if (!d.getIotDcd().isActivated()) {
                log.error(IOTCS, "Device '" + d.getName() + "' successfully activated, but not marked as Active (?). Aborting.");
                cb2("Not activated");
              }
              cb2(null);
            });
          } else {
            log.verbose(IOTCS, "'" + d.getName() + "' device is already activated");
            cb2(null);
          }
        },
        function(cb3) {
          // When here, the device should be activated. get device model
          getModel(d.getIotDcd(), d.getName(), (function (error, model) {
            if (error !== null) {
              log.error(IOTCS, "Error in retrieving '" + d.getName() + "' model. Error: " + error.message);
              cb3(error);
            } else {
              d.setIotModel(model);
              d.setIotVd(d.getIotDcd().createVirtualDevice(d.getIotDcd().getEndpointId(), model));
              log.verbose(IOTCS, "'" + d.getName() + "' intialized successfully");
              console.log(util.inspect(model, true, null));
            }
            cb3();
          }).bind(this));
        }
      ], function(err, results) {
        cb();
      });
    }, function(err) {
      if (err) {
        callback(err);
      } else {
        callback(null, true);
      }
    });
  },
  websockets: function(callback) {

  },
  rest: function(callback) {

  }
}, function(err, results) {
  if (err) {
  } else {
    log.info(PROCESS, 'Initialization completed');
  }
});
