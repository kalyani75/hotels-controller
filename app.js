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

var getsessionid = function() {
  var sha = crypto.createHash('sha256');
  sha.update(Math.random().toString());
  
  return sha.digest('hex');
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

  request(reqoptions, function (dealserror, dealsresponse, dealsbody) {
    dealsJSON = JSON.parse(dealsbody);

    /*for (var ilp = 0; ilp < dealsJSON.deals.length; ilp ++)
      deals.push(dealsJSON.deals[ilp]);*/
    
    return dealcallback(null, dealsJSON);
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

  request(reqoptions, function (hotelerror, hotelresponse, hotelbody) {
	  if (!hotelerror && hotelresponse.statusCode == 200) {
      hotelsJSON = JSON.parse(hotelbody);
      hotels = _.propertyOf(hotelsJSON)('hotelsearch');

      var modifiedhotelsJSON = {};
      modifiedhotelsJSON.sessionid = sessionid;

      async.parallel({
        alldeals: getalldeals.bind(null, sessionid)
      }, function(fullhotelinfoerror, fullhotelinforesults) {
        var modifiedhotels = [];
        for (var i = 0; i < hotels.length; i ++)
        {
          var modifiedhotel = {};
          modifiedhotel = hotels[i];

          hotelid = String(hotels[i].id)
          if (hotelid in fullhotelinforesults.alldeals) modifiedhotel.deals = _.propertyOf(fullhotelinforesults.alldeals)(hotelid);

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