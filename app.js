var express = require('express');
var request = require('request');

var cfenv = require('cfenv');
var _ = require('underscore');

var app = express();
var appEnv = cfenv.getAppEnv();

var cors = require('cors')
var async = require("async");

var crypto = require('crypto');
var redis = require('redis');

const zipkin = require('zipkin');
const wrapRequest = require('zipkin-instrumentation-request');
const { HttpLogger } = require('zipkin-transport-http');
const CLSContext = require('zipkin-context-cls');
 
const ctxImpl = new CLSContext('zipkin');
const recorder = new zipkin.BatchRecorder({
  logger: new HttpLogger({
    endpoint: 'http://' + (process.env.ZIPKINHOST || zipkin) + ':' + (process.env.ZIPKINPORT || 9411) +'/api/v1/spans'
  })
});
const tracer = new zipkin.Tracer({
  recorder: recorder,
  ctxImpl: ctxImpl,
  sampler: new zipkin.sampler.CountingSampler(process.env.ZIPKINSAMPLERATE || 1)
});

const serviceName = 'hotels.com';
const remoteServiceName = 'hotels.com:internalserives';

const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;
const zipkinRequest = wrapRequest(request, { tracer, serviceName, remoteServiceName });

app.use(zipkinMiddleware({
  tracer,
  serviceName: 'hotels.com' 
}));
 
var locationqueryoptions = {
  host: process.env.LOCATIONQUERYHOST || 'http://locationquery-service',
  port: process.env.LOCATIONQUERYPORT || 9011,
  path: '/hotels.com/api/v1.0/locations',
  headers: {
    'Content-Type': 'application/json'
  }
};

var hotelqueryoptions = {
  host: process.env.HOTELQUERYHOST || 'http://hotelquery-service',
  port: process.env.HOTELQUERYPORT || 9012,
  path: '/hotels.com/api/v1.0/hotels',
  headers: {
    'Content-Type': 'application/json'
  }
};

var dealqueryoptions = {
  host: process.env.DEALQUERYHOST || 'http://dealsquery-service',
  port: process.env.DEALQUERYPORT || 9013,
  path: '/hotels.com/api/v1.0/deals',
  headers: {
    'Content-Type': 'application/json'
  }
};

var amenitiesqueryoptions = {
  host: process.env.AMENITIESQUERYHOST || 'http://amenitiesquery-service',
  port: process.env.AMENITIESQUERYPORT || 9014,
  path: '/hotels.com/api/v1.0/amenities',
  headers: {
    'Content-Type': 'application/json'
  }
};

var eventhandleroptions = {
  host: process.env.EVENTHANDLERHOST || 'http://eventhandler-service',
  port: process.env.EVENTHANDLERPORT || 9102,
  path: '/hotels.com/api/v1.1/eventhandler',
  headers: {
    'Content-Type': 'application/json'
  }
};

app.get('/hotels.com/controller/v1.0/locations/autocomplete/:searchtext', cors(), function(controllerrequest, controllerresponse)
{
  searchtext = controllerrequest.params.searchtext;
  if (searchtext.length <= 0) controllerresponse.status(400).end();
  
  pagelength = parseInt(controllerrequest.query.pagelength);
  if (!pagelength) pagelength = 50;
  
  var reqoptions = {
	  url: locationqueryoptions.host + ':' + locationqueryoptions.port + locationqueryoptions.path + '/autocomplete/' + searchtext,
	  method: 'GET',
	  headers: locationqueryoptions.headers,
	  qs: {
	    'pagelength': pagelength
	  }
  };

  zipkinRequest(reqoptions, function (locationerror, locationresponse, locationbody) {
	  if (!locationerror && locationresponse.statusCode == 200) {
      controllerresponse.json(JSON.parse(locationbody));
    }
	  else {
	    controllerresponse.status(400).end();
	  }
  });
});

app.get('/hotels.com/controller/v1.0/hotels/autocomplete/:searchtext', cors(), function(controllerrequest, controllerresponse)
{
  searchtext = controllerrequest.params.searchtext;
  if (searchtext.length <= 0) controllerresponse.status(400).end();

  pagelength = parseInt(controllerrequest.query.pagelength);
  if (!pagelength) pagelength = 50;

  var reqoptions = {
	  url: hotelqueryoptions.host + ':' + hotelqueryoptions.port + hotelqueryoptions.path + '/autocomplete/' + searchtext,
	  method: 'GET',
	  headers: hotelqueryoptions.headers,
	  qs: {
	    'pagelength': pagelength
	  }
  };

  zipkinRequest(reqoptions, function (hotelerror, hotelresponse, hotelbody) {
	  if (!hotelerror && hotelresponse.statusCode == 200) {
      controllerresponse.json(JSON.parse(hotelbody));
    }
	  else {
	    controllerresponse.status(400).end();
	  }	
  });
});

var getsessionid = function() {
  var sha = crypto.createHash('sha256');
  sha.update(Math.random().toString());
  
  return sha.digest('hex');
}

var gethotels = function(sessionid, latitude, longitude, radius, hotelscallback) {
  var hotels = [];  
  var reqoptions = {
	  url: hotelqueryoptions.host + ':' + hotelqueryoptions.port + hotelqueryoptions.path + '/search/' + latitude + '/' + longitude,
	  method: 'GET',
	  headers: hotelqueryoptions.headers,  
	  qs: {
      'sessionid': sessionid,
	    'radius': radius
	  }
  };

  zipkinRequest(reqoptions, function (hotelserror, hotelsresponse, hotelsbody) {
    hotelsJSON = JSON.parse(hotelsbody);
    return hotelscallback(null, hotelsJSON);
  });
}

var getalldeals = function(sessionid, dealcallback) {
  var deals = [];  
	var reqoptions = {
	  url: dealqueryoptions.host + ':' + dealqueryoptions.port + dealqueryoptions.path + '/dealsbyhotel',
	  method: 'GET',
	  headers: dealqueryoptions.headers,
    qs: {
      'sessionid': sessionid
	  }    
  };

  zipkinRequest(reqoptions, function (dealserror, dealsresponse, dealsbody) {
    if (typeof dealsbody !== 'undefined' && dealsbody) 
    {    
      dealsJSON = JSON.parse(dealsbody);
      return dealcallback(null, dealsJSON);
    }
    else
      return dealcallback(null, null);
  });
}

var topamenities = function(sessionid, amenitiescallback) {
  var amenities = [];  
	var reqoptions = {
	  url: amenitiesqueryoptions.host + ':' + amenitiesqueryoptions.port + amenitiesqueryoptions.path + '/topamenitiesbyhotel',
	  method: 'GET',
	  headers: amenitiesqueryoptions.headers,
    qs: {
      'sessionid': sessionid
	  }    
  };

  zipkinRequest(reqoptions, function (amenitieserror, amenitiesresponse, amenitiesbody) {
    if (typeof amenitiesbody !== 'undefined' && amenitiesbody) 
    {
      amenitiesJSON = JSON.parse(amenitiesbody);
      return amenitiescallback(null, amenitiesJSON);
    }
    else
      return amenitiescallback(null, null);
  });
}

app.get('/hotels.com/controller/v1.0/hotels/search/:latitude/:longitude', cors(), function(controllerrequest, controllerresponse)
{ 
  latitude = parseFloat(controllerrequest.params.latitude);
  if (!latitude) controllerresponse.status(400).end();

  longitude = parseFloat(controllerrequest.params.longitude);
  if (!longitude) controllerresponse.status(400).end();

  radius = parseInt(controllerrequest.query.radius);
  if (!radius) radius = 5;

  sessionid = getsessionid();
  var reqoptions = {
	  url: hotelqueryoptions.host + ':' + hotelqueryoptions.port + hotelqueryoptions.path + '/search/' + latitude + '/' + longitude,
	  method: 'GET',
	  headers: hotelqueryoptions.headers,  
	  qs: {
      'sessionid': sessionid,
	    'radius': radius
	  }
  };
  
  zipkinRequest(reqoptions, function (hotelerror, hotelresponse, hotelbody) {
	  if (!hotelerror && hotelresponse.statusCode == 200) {
      hotelsJSON = JSON.parse(hotelbody);
      hotels = _.propertyOf(hotelsJSON)('hotelsearch');

      var modifiedhotelsJSON = {};
      modifiedhotelsJSON.sessionid = sessionid;

      async.parallel({
        alldeals: getalldeals.bind(null, sessionid),
        topamenities: topamenities.bind(null, sessionid)
      }, function(fullhotelinfoerror, fullhotelinforesults) {
        var modifiedhotels = [];
        for (var i = 0; i < hotels.length; i ++)
        {
          var modifiedhotel = {};
          modifiedhotel = hotels[i];

          hotelid = String(hotels[i].id)
          if (hotelid in fullhotelinforesults.alldeals) modifiedhotel.deals = _.propertyOf(fullhotelinforesults.alldeals)(hotelid);
          if (hotelid in fullhotelinforesults.topamenities) modifiedhotel.topamenities = _.propertyOf(fullhotelinforesults.topamenities)(hotelid);
          
          modifiedhotels.push(modifiedhotel);
        }

        modifiedhotelsJSON.hotelsearch = modifiedhotels;
        controllerresponse.json(modifiedhotelsJSON);
      });
    }
    else {
	    controllerresponse.status(400).end();
	  }
  });
});

app.get('/hotels.com/controller/v1.1/hotels/search/:latitude/:longitude', cors(), function(controllerrequest, controllerresponse)
{ 
  latitude = parseFloat(controllerrequest.params.latitude);
  if (!latitude) controllerresponse.status(400).end();

  longitude = parseFloat(controllerrequest.params.longitude);
  if (!longitude) controllerresponse.status(400).end();

  radius = parseInt(controllerrequest.query.radius);
  if (!radius) radius = 5;

  sessionid = getsessionid();
  async.parallel({
    allhotels: gethotels.bind(null, sessionid, latitude, longitude, radius),
    alldeals: getalldeals.bind(null, sessionid),
    topamenities: topamenities.bind(null, sessionid)
  }, function(fullhotelinfoerror, fullhotelinforesults) {
    hotelsJSON = _.propertyOf(fullhotelinforesults.allhotels)('hotelsearch');

    var hotels = [];
    hotels = hotelsJSON;

    var modifiedhotelsJSON = {};
    modifiedhotelsJSON.sessionid = sessionid;    
    
    var finalhotelsearchresults = [];
    for (var i = 0; i < hotels.length; i ++)
    {
      var hotel = {};
      hotel = hotels[i];

      hotelid = String(hotel.id)
      if (typeof fullhotelinforesults.alldeals != undefined &&  fullhotelinforesults.alldeals && hotelid in fullhotelinforesults.alldeals) 
        hotel.deals = _.propertyOf(fullhotelinforesults.alldeals)(hotelid);
        
      if (typeof fullhotelinforesults.topamenities != undefined &&  fullhotelinforesults.topamenities && hotelid in fullhotelinforesults.topamenities) 
        hotel.topamenities = _.propertyOf(fullhotelinforesults.topamenities)(hotelid);
          
      finalhotelsearchresults.push(hotel);
    }

    modifiedhotelsJSON.hotelsearch = finalhotelsearchresults;
    controllerresponse.json(modifiedhotelsJSON);
  });  
});

// start server on the specified port and binding host
app.listen(process.env.PORT || 9101, function() {
	// print a message when the server starts listening
	console.log("server starting on " + appEnv.url);
});