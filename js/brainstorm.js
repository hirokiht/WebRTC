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

var PCs = new Array()		//conference peerConnection
  , participants = null
  , localstream = null
  , offerBuffer = new Array()
  , board = null
  , eventBuffer = new Array()
  , inviter = null
  , eventHeader = new Array();

function signalCh(data){
	var self = this;
	if(data == 'bye')
		window.opener.socket.emit(data,{peer: this.peer, type: 'brainstorm'});
	else if(data == null || typeof data.sdp == 'string')//data instanceof RTCSessionDescription)
		if(data == null || this.peerConnection.remoteDescription)
			this.callback(data);
		else{
			console.log('Sending offer to '+this.peer);
			window.opener.socket.emit('offer', {callee: this.peer, type: 'brainstorm', rtc: data},function(answer){
				if(answer == null){
					self.end(self.peer+' failed to provide valid answer!');
					alert(self.peer+' is unavailable right now!');
				}else self.setAnswer(answer);
			});
		}
	else if(typeof data.candidate == 'string')//data instanceof RTCIceCandidate)
		window.opener.socket.emit('ice',{'to': this.peer,'icecandidate': data});
	else console.log('Signal Channel dont know how to deal with this: '+JSON.stringify(data));
}

function remoteMediaCallback(remoteData){
	if(remoteData instanceof MediaStream){		//initiating call
		if(!document.getElementById('vid_'+this.peer)){
			var vid = document.createElement('video');
			vid.id = 'vid_'+this.peer;
			vid.title = this.peer;
			vid.autoplay = true;
			var newVid = document.getElementById('sidevidin').appendChild(vid);
		}
		attachMediaStream(document.getElementById('vid_'+this.peer),remoteData);
	}else if(typeof remoteData == 'string'){
		var obj = JSON.parse(remoteData);
		if(obj.msg){
			var msg = document.createElement('p');
			msg.innerHTML = this.peer+': '+obj.msg;
			document.getElementById('content').appendChild(msg);
			document.getElementById('content').scrollTop = document.getElementById('content').scrollHeight;	//scroll to bottom
		}else if(obj.img)
			if(obj.img == 'request')
				PCs[this.peer].dataCh.send(JSON.stringify({img:board.getImg()}));
			else board.setImg(obj.img);
		else if(Array.isArray(obj)){
			processArray(this.peer,obj);
		}else console.log('Invalid String Data: '+remoteData);
	}else if(remoteData == null){				//ending call
		if(document.getElementById('vid_'+this.peer))
			document.getElementById('sidevidin').removeChild(document.getElementById('vid_'+this.peer));
		var i = participants.indexOf(this.peer);
		if(i >= 0)
			participants.splice(i);
		delete PCs[this.peer];
	}else if(remoteData.dataCh && remoteData.dataCh == 'open' && this.peer == participants[0] && !inviter){
		PCs[this.peer].dataCh.send('{"img":"request"}');
		inviter = true;
	}else if(!remoteData.dataCh)
		console.log('remoteMediaCallback doesn\'t know how to deal with '+JSON.stringify(remoteData));
}

function processArray(peer,arr){
	var obj = arr.shift();
	console.log(peer+': '+JSON.stringify(obj));
	if(obj.e && (obj.e.type == 'touchstart' || obj.e.type == 'mousedown'))
		eventHeader[peer] = {e: {type: obj.e.type == 'touchstart'? 'touchmove' : 'mousemove', pageX: obj.e.pageX, pageY: obj.e.pageY }
							,color: obj.color, size: obj.size};
	if(eventHeader[peer])
		processEvent(obj.e? obj.e : eventHeader[peer].e,obj.coords,eventHeader[peer].color,eventHeader[peer].size);
	if(arr.length && obj)
		setTimeout(function(){processArray(peer,arr)},1);	//must delay if not it is not rendered, could be browser specific
}

function processEvent(e,coord,color,size){
	e.preventDefault = function(){};
	var strokeStyle = board.ctx.strokeStyle, lineWidth = board.ctx.lineWidth;
	board.ctx.strokeStyle = color;
	board.ctx.lineWidth = size;
	if(e.type == 'touchstart' || e.type == 'mousedown')
		board._onInputStart(e,coord);
	else if(e.type == 'touchmove' || e.type == 'mousemove')
		board._onInputMove(e,coord);
	else if(e.type == 'mouseup' || e.type == 'touchend')
		board._onInputStop(e,coord);
	else if(e.type == 'mouseover')
		board._onMouseOver(e,coord);
	else if(e.type == 'mouseout')
		board._onMouseOut(e,coord);
	else console.log('Unregconized type: '+e.type);
	setTimeout(function(){
		board.ctx.strokeStyle = strokeStyle;
		board.ctx.lineWidth = lineWidth;
	},1);
}

function connected(){
	document.getElementById('friendlist').style.color = 'inherit';
	document.getElementById('status').selectedIndex = 0;
	console.log('Socket connected!');
}

function disconnected(err){
	document.getElementById('friendlist').style.color = '#BBB';
	document.getElementById('status').selectedIndex = 1;
	console.log('Connection failed! Error: '+JSON.stringify(err));
}

function bye(peer){
	if(PCs[peer])
		PCs[peer].end('Received bye from '+peer);
}

function ice(data){
	console.log('Received ice from '+data.peer);
	if(PCs[data.peer])
		PCs[data.peer].addIceCandidate(data.candidate);
	else console.log('Unable to add ice due to PCs['+(data.peer? data.peer : 'data.peer')+'] not found');
}

function online(friend){
	console.log(friend+' is online =)');
	var li = document.createElement('li');
	li.id = 'friend_';
	li.id += li.innerHTML = li.title = friend;
	var joinC = document.createElement('button');
	joinC.className = 'fa fa-comment-o';
	joinC.type = 'button';
	joinC.innerHTML = ' Invite';
	joinC.onclick = function(){
		this.parentNode.className='onCall';
		invite(this.parentNode.title);
	};
	li.appendChild(joinC);
	document.getElementById('friends').appendChild(li);
}

function offline(data){
	if(document.getElementById('friend_'+data))
		document.getElementById('friends').removeChild(document.getElementById('friend_'+data));
}

function disconnect(){
	document.getElementById('friendlist').style.color = '#BBB';
	document.getElementById('status').selectedIndex = 1;
	document.getElementById('friends').innerHTML = '';
	console.log('Server connection disconnected!');
}

function offer(data,fn){
	console.log('Received offer from '+data.caller);//+': '+data.rtc.sdp);
	if(!localstream){
		console.log('Local stream not ready!');
		offerBuffer.push({data: data, fn: fn});
		return;
	}
	if(participants.indexOf(data.caller) == -1){
		console.log('Offerer is not in participants!');
		fn(null);
		return;
	}
	if(data.rtc.type == 'offer' && data.type == 'brainstorm')	//video call
		if(!PCs[data.caller] || !PCs[data.caller].peer){
			PCs[data.caller] = new pc(data.caller,'conference',signalCh);
			PCs[data.caller].start(localstream,remoteMediaCallback,data.rtc,fn);
		}else if(PCs[data.caller].peerConnection.signalingState != 'stable' || (PCs[data.caller].peerConnection.iceConnectionState != 'connected' && PCs[data.caller].peerConnection.iceConnectionState != 'completed')){
			console.log('Already establishing connection with '+data.caller+', restart connection');
			PCs[data.caller].restart(localstream,remoteMediaCallback,data.rtc,fn);
		}else{
//			console.log('Already have an established connection with '+data.caller+', reject new connection!');
//			fn(null);
			console.log('Already established connection with '+data.caller+', restart connection');
			PCs[data.caller].end('reset connection');
			PCs[data.caller] = new pc(data.caller,'conference',signalCh);
			PCs[data.caller].start(localstream,remoteMediaCallback,data.rtc,fn);
		}
}

function invite(invitee){
	if(!localstream){
		alert('Kindly allow the webcam to be accessed first!');
		return;
	}
	if(participants.indexOf(invitee) == -1)
		participants.push(invitee);
	window.opener.socket.emit('brainstorm',participants);
	inviter = true;
}

function conference(data){
	if(!Array.isArray(data) || !data.length)
		return;
	if(participants.indexOf(data[0]) == -1){
		console.log('Inviter not in participants!');
		return;
	}
	for(var i = 0 ; i < data.length ; i++){
		if(participants.indexOf(data[i]) == -1){
			console.log('Added '+data[i]+' into participants');
			participants.push(data[i]);
		}else if(!PCs[data[i]] || !PCs[data[i]].peer){
			PCs[data[i]] = new pc(data[i],'conference',signalCh);
			PCs[data[i]].start(localstream,remoteMediaCallback);
		}
	}
}

function sendMsg(){
	var form = document.getElementById('chatbox');
	console.log('Message:'+form.msg.value);
	var p = document.createElement('p');
	p.innerHTML = 'Me: '+form.msg.value.replace(/\n/g, '<br>');
	document.getElementById('content').appendChild(p);
	document.getElementById('content').scrollTop = document.getElementById('content').scrollHeight;	//scroll to bottom
	sendAll({msg: form.msg.value});
	form.reset();
	return false;	//prevent form submit
}

function sendAll(obj){
	for(key in PCs)
		if(PCs[key].dataCh){
			if(obj.coords || obj.e){
				if(obj.e && (obj.e.type == 'mousedown' || obj.e.type == 'touchstart')){
					var last = eventBuffer.pop();		//all the moving without drawing, take the last as starting point
					eventBuffer.length = 0;	//clear buffer
					if(last)
						eventBuffer.push(last);
					eventBuffer.push(obj);
				}else if((obj.e && (obj.e.type == 'mouseup' || obj.e.type == 'touchend')) || obj.length > 20){
					eventBuffer.push(obj);
					PCs[key].dataCh.send(JSON.stringify(eventBuffer));
					eventBuffer.length = 0;	//clear buffer
				}else eventBuffer.push(obj);
			}else PCs[key].dataCh.send(JSON.stringify(obj));
		}else ; //add into buffer and process later?
}

function gUM(){
	getUserMedia({audio:true,video:true},function(stream){
		localstream = stream;
		document.getElementById('overlay').style.display = 'none';
		attachMediaStream(document.getElementById('vid2'),stream);
		if(window.opener.buffer2 && Array.isArray(window.opener.buffer2)){
			participants = window.opener.buffer2.slice(0);
			window.opener.buffer2 = null;
		}else participants = new Array();
		for(var i = 0 ; i < offerBuffer.length ; i++)
			offer(offerBuffer[i].data,offerBuffer[i].fn)
		offerBuffer.length = 0;
		conference(participants);
		var options = {webStorage: false, controls: ['Color', { Size: { type: "auto" } }, {DrawingMode: {filler: false}},{ Navigation: { back: false, forward: false, reset: false } }, 'Download'	]};
		board = new DrawingBoard.Board('drawbox',options);
		board.dom.$canvas.on('mousedown touchstart', function(evnt){
			sendAll({e: {type: evnt.type, pageX: evnt.pageX? evnt.pageX : 0, pageY: evnt.pageY? evnt.pageY : 0}, coords: board._getInputCoords(evnt), color: board.ctx.strokeStyle, size: board.ctx.lineWidth});
		});
		board.dom.$canvas.on('mousemove touchmove', function(evnt){
			sendAll({coords: board._getInputCoords(evnt)});
		});
		board.dom.$canvas.on('mouseup touchend', function(evnt){
			sendAll({e: {type: evnt.type, pageX: evnt.pageX? evnt.pageX : 0, pageY: evnt.pageY? evnt.pageY : 0}, coords: board._getInputCoords(evnt)});
		});
	},function(err){
		console.log('Get user media error: '+JSON.stringify(err));
		if(confirm('Unable to detect your webcam (check your settings), try again?'))
			gUM();
		else window.close();
	});
}

window.onload = function(){
	if(!window || !window.opener)
		window.location = window.location.protocol+'//'+window.location.hostname;	//redirect to homepage
	document.getElementById('status').onchange = window.opener.document.getElementById('status').onchange;
	window.moveTo(0,0);
	window.resizeTo(screen.availWidth,screen.availHeight);
	var lis = window.opener.document.getElementById('friends').getElementsByTagName('li');
	for(var i = 0 ; i < lis.length ; i++)
		online(lis[i].title);
	document.getElementById('chatbox').onsubmit = function(){return sendMsg()};
	document.getElementById('chatbox').msg.onkeypress = function(event){
			if(event.keyCode == 13 && !event.shiftKey){	//enter to send while shift key is not on hold
				sendMsg(this.form);
				return false;							//prevent newline occur after reset the form
			}
		}
	gUM();
}

window.onunload = function(){
	for(key in PCs)
		PCs[key].end();
}
