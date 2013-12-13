/* Copyright 2013 Hiroki Takeuchi

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
   */
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server)
  , UglifyJS = require('socket.io/node_modules/socket.io-client/node_modules/uglify-js')
  , connect = require('express/node_modules/connect')
  , cookie = require('express/node_modules/cookie')
  , MongoClient = require('mongodb').MongoClient
  , crypto = require('crypto')
  , collection = null;

server.listen(80);

//app.use(express.bodyParser());//for Connect-3.0
app.use(express.json());		//for Connect-2.X
app.use(express.urlencoded());	//for Connect-2.X
app.use(express.cookieParser('my super secret for session'));
app.use(express.session({key: 'express.sid'}));

MongoClient.connect('mongodb://127.0.0.1:27017/test',function(err,db){
	if(err)
		throw err;
	db.collection('users',function(err,col){
		if(err)
			throw err;
		collection = col;
		console.log('Mongodb collection obtained!');
	});
});

app.get('/server.js',function(req, res){	//prevent client reading source code
	res.send(500,'Error loading '+req.url);
});
app.get('/',function(req, res){
  if(!req.session || !req.session.name)
	res.redirect('/login');
  else res.sendfile(__dirname+'/index.htm',function(err){
		res.send(500,'Error loading '+req.url);
	});
});
app.get('/login', function(req, res){	//can be changed to app.engine to use view that enables caching
  if(req.session && req.session.name)
	res.redirect('/');
  else res.sendfile(__dirname+'/login.htm',function(err){
		res.send(500,'Error loading '+req.url);
  	});
});
app.get('/register', function(req, res){	//can be changed to app.engine to use view that enables caching
  if(req.session && req.session.name)
	res.redirect('/');
  else res.sendfile(__dirname+'/register.htm',function(err){
		res.send(500,'Error loading '+req.url);
  	});
});
app.get('/conference', function(req, res){	//can be changed to app.engine to use view that enables caching
  if(req.session && req.session.name)
	res.sendfile(__dirname+'/conference.htm',function(err){
		res.send(500,'Error loading '+req.url);
  	});
  else	res.redirect('/login');
});
app.get('*', function(req, res){
	res.charset = 'utf-8';
	var ext = req.url.substr(req.url.lastIndexOf('.'));
	if(ext == '.css' || ext == '.png')
		res.sendfile(__dirname+req.url,function(err){
			res.send(500,'Error loading '+req.url);
		});
	else if(ext == '.js'){
		var result = UglifyJS.minify(__dirname+req.url);
		res.send(result.code);
	}
	else res.send(500,'Error loading '+req.url);
});

app.post('/login', function(req, res){
  if(!req.body.uid || !req.body.pw){
	console.log('Received invalid login request: '+JSON.stringify(req.body));
	res.redirect('/login');
  }
  else auth(req.body.uid,req.body.pw,function(authed){
	if(authed){
	  req.session.name = req.body.uid;
	  res.cookie('name',req.body.uid, {signed: true});
	  res.redirect('/');
	}else res.redirect('/login');
  });
});

app.post('/register', function(req, res){
	if(!req.body.uid || !req.body.pw || !req.body.pw2 || !req.body.email || !req.body.fname){
		console.log('Received an invalid login request: '+JSON.stringify(req.body));
		res.redirect('/register');
	}else if(!req.body.uid.match(/^\w+$/) || !req.body.email.match(/^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[A-Z]{2}|com|org|net|edu|gov|mil|biz|info|mobi|name|aero|asia|jobs|museum)\b$/) ||  req.body.pw != req.body.pw2){
	  	console.log('Received an illegal register request');
	  	res.redirect('/register');
	}else{
  		createUser(req.body.uid,req.body.pw,req.body.fname,req.body.email);
		res.redirect('/');
	}
});

function auth(uid, pass, callback){
	collection.findOne({_id: uid, pw: crypto.createHash('sha256').update(pass).digest('hex')}, function(err, doc){
		if(err)
			throw err;
		callback(doc? true : false);
	});
}

function createUser(uid,pw,fname,email){
	collection.insert({_id: uid, pw: crypto.createHash('sha256').update(pw).digest('hex'), name: fname, email: email}, function(err, rec){
		if(err)
			throw err;
		console.log('Record added:'+JSON.stringify(rec));
		//incomplete
	});
}


io.set('authorization', function (handshakeData, accept) {	//adapted from http://howtonode.org/socket-io-auth
  if (handshakeData.headers.cookie) {
    handshakeData.cookie = cookie.parse(handshakeData.headers.cookie);
    if(!handshakeData.cookie['express.sid'] || !handshakeData.cookie['name'])
      return accept('Cookie is invalid.', false);
    handshakeData.sessionID = connect.utils.parseSignedCookie(handshakeData.cookie['express.sid'], 'my super secret for session');
    handshakeData.name = connect.utils.parseSignedCookie(handshakeData.cookie['name'], 'my super secret for session');
    if (!handshakeData.sessionID || !handshakeData.name || handshakeData.cookie['express.sid'] == handshakeData.sessionID)
      return accept('Cookie data is invalid.', false);
  }else return accept('No cookie transmitted.', false);
  console.log(handshakeData.name+' is authed!');
  accept(null, true);
});

io.sockets.on('connection', function (socket) {
  if(io.sockets.sockets[socket.handshake.name])
  	io.sockets.sockets[io.sockets.sockets[socket.handshake.name]].disconnect();	//disconnect previous connection
  io.sockets.sockets[socket.handshake.name] = socket.id;
  console.log(socket.handshake.name+'(socket id: '+socket.id+') is logged on!');
  socket.broadcast.emit('online',socket.handshake.name);
  for(var i in io.sockets.sockets)
  	if(typeof(io.sockets.sockets[i]) != 'object' && io.sockets.sockets[i] != socket.id)
  		socket.emit('online',i);
  socket.on('offer', function (data,fn) {
	if(!data.callee || !io.sockets.sockets[data.callee]){
		console.log((data.callee? data.callee : 'data.callee')+' not found!');
		fn(null);
		return;
	}
	if(io.sockets.sockets[io.sockets.sockets[data.callee]] == socket){
		console.log('Not going to send the offer back to itself!');
		fn(null);
		return;
	}
	if(!data.type || !data.rtc){
		console.log((data.type? 'data.rtc' : data.rtc? 'data.type' : 'data.type and data.rtc')+' not found!');
		fn(null);
		return;
	}
	console.log('Calling '+data.callee+'('+data.type+')\nSession Desc:'+data.rtc);
	console.log(data.callee+'\'s id: '+io.sockets.sockets[data.callee]);
	io.sockets.sockets[io.sockets.sockets[data.callee]].emit('offer',{caller: socket.handshake.name, type: data.type, rtc: data.rtc},function(ans){
		console.log('Received answer from '+data.callee+' to '+socket.handshake.name+': '+JSON.stringify(ans));
		fn(ans? ans : null);
	});
  });
  socket.on('ice',function(data){
	if(!data.to || io.sockets.sockets[data.to] == null){
		console.log((data.to? data.to : 'data.to')+' not found!');
		return;
	}
	io.sockets.sockets[io.sockets.sockets[data.to]].emit('ice',{'peer': socket.handshake.name, 'candidate': data.icecandidate});
  });
  socket.on('disconnect', function(data){
	console.log(socket.handshake.name+' is disconnected!');
	socket.broadcast.emit('offline',socket.handshake.name);
	delete io.sockets.sockets[socket.handshake.name];
  });
  socket.on('bye',function(to){
  	if(io.sockets.sockets[to] && io.sockets.sockets[io.sockets.sockets[to]])
	  	io.sockets.sockets[io.sockets.sockets[to]].emit('bye',socket.handshake.name);
  });
  socket.on('conference',function(participants){
  	if(!Array.isArray(participants))
  		return;	//data parsed is not array
  	if(participants.indexOf(socket.handshake.name) == -1)
	  	participants.unshift(socket.handshake.name);			//add sender to array
	else if(participants.indexOf(socket.handshake.name) != 0)
		participants[0] = participants.splice(participants.indexOf(socket.handshake.name),1,participants[0])[0];	//swap sender to [0]
  	for(var i = 0 ; i < participants.length ; i++)
	  	if(typeof participants[i] == 'string' && participants[i] != socket.handshake.name && io.sockets.sockets[participants[i]] && io.sockets.sockets[io.sockets.sockets[participants[i]]]){
	  		var arr = participants.slice(0);	//clone
	  		arr.splice(i,1);					//remove the participant himself
			io.sockets.sockets[io.sockets.sockets[participants[i]]].emit('conference',arr);
		}
  });
});
