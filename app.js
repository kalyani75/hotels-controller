var express = require('express');
var request = require('request');

var cfenv = require('cfenv');
var _ = require('underscore');

var app = express();
var appEnv = cfenv.getAppEnv();

var cors = require('cors')
var async = require("async");

var crypto = require('crypto');
var locationqueryoptions = {
  host: 'http://locationquery-service',
  port: 9002,
  path: '/hotels.com/api/v1.0/locations',
  headers: {
    'Content-Type': 'application/json'
  }
};

var hotelqueryoptions = {
  host: 'http://hotelquery-service',
  port: 9003,
  path: '/hotels.com/api/v1.0/hotels',
  headers: {
    'Content-Type': 'application/json'
  }
};

var dealqueryoptions = {
  host: 'http://dealsquery-service',
  port: 9004,
  path: '/hotels.com/api/v1.0/deals',
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

  request(reqoptions, function (locationerror, locationresponse, locationbody) {
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

  request(reqoptions, function (hotelerror, hotelresponse, hotelbody) {
	  if (!hotelerror && hotelresponse.statusCode == 200) {
      controllerresponse.json(JSON.parse(hotelbody));
    }
	  else {
	    controllerresponse.status(400).end();
	  }	
  });
});

var getsessionid = function(sessioncallback) {
  var sha = crypto.createHash('sha256');
  sha.update(Math.random().toString());
  
  return sessioncallback(null, sha.digest('hex'));
}

var getalldeals = function(hotels, dealcallback) {
  var deals = [];
	var reqoptions = {
	  url: dealqueryoptions.host + ':' + dealqueryoptions.port + dealqueryoptions.path + '/alldeals/101',
	  method: 'GET',
	  headers: dealqueryoptions.headers
  };
  
  request(reqoptions, function (dealserror, dealsresponse, dealsbody) {
    dealsJSON = JSON.parse(dealsbody);
    for (var ilp = 0; ilp < dealsJSON.deals.length; ilp ++)
      deals.push(JSON.parse(dealsJSON.deals[ilp]));
      
    return dealcallback(null, deals);
  });
}

app.get('/hotels.com/controller/v1.0/hotels/search/:latitude/:longitude', cors(), function(controllerrequest, controllerresponse)
{
  latitude = parseFloat(controllerrequest.params.latitude);
  if (!latitude) controllerresponse.status(400).end();

  longitude = parseFloat(controllerrequest.params.longitude);
  if (!longitude) controllerresponse.status(400).end();

  radius = parseInt(controllerrequest.query.radius);
  if (!radius) pagelength = 5;

  var reqoptions = {
	  url: hotelqueryoptions.host + ':' + hotelqueryoptions.port + hotelqueryoptions.path + '/search/' + latitude + '/' + longitude,
	  method: 'GET',
	  headers: hotelqueryoptions.headers,
	  qs: {
	    'radius': radius
	  }
  };

  request(reqoptions, function (hotelerror, hotelresponse, hotelbody) {
	  if (!hotelerror && hotelresponse.statusCode == 200) {
      hotelsJSON = JSON.parse(hotelbody);
      hotels = _.propertyOf(hotelsJSON)('hotelsearch');

      async.parallel({
        sessionid: getsessionid.bind(null),
        alldeals: getalldeals.bind(null, hotels)
      }, function(fullhotelinfoerror, fullhotelinforesults) {
        var modifiedhotelsJSON = {};
        modifiedhotelsJSON.sessionid = fullhotelinforesults.sessionid;
        
        var modifiedhotels = [];
        for (var i = 0; i < hotels.length; i ++)
        {
          var modifiedhotel = {};
          modifiedhotel = hotels[i];
          
          modifiedhotel.deals = fullhotelinforesults.alldeals;
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

// start server on the specified port and binding host
app.listen(process.env.PORT || 9101, function() {
	// print a message when the server starts listening
	console.log("server starting on " + appEnv.url);
});