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
  , offerBuffer = new Array();

function remoteMediaCallback(remoteData){
	if(remoteData instanceof MediaStream){		//initiating call
		if(!document.getElementById('vid_'+this.peer)){
			var vid = document.createElement('video');
			vid.id = 'vid_'+this.peer;
			vid.title = this.peer;
			vid.autoplay = true;
			vid.onclick = function(){
				document.getElementById('vid1').title = this.title;
				reattachMediaStream(document.getElementById('vid1'),this);
			}
			var newVid = document.getElementById('sidevidin').appendChild(vid);
			if(document.getElementById('sidevidin').firstChild.nextSibling == newVid){
				document.getElementById('vid1').title = this.peer;
				attachMediaStream(document.getElementById('vid1'),remoteData);
				document.getElementById('vid1').style.display = 'block';
			}
		}
		attachMediaStream(document.getElementById('vid_'+this.peer),remoteData);
	}else if(typeof remoteData == 'string'){
		var msg = document.createElement('p');
		msg.innerHTML = this.peer+': '+remoteData;
		document.getElementById('content').appendChild(msg);
		document.getElementById('content').scrollTop = document.getElementById('content').scrollHeight;	//scroll to bottom
	}else if(remoteData == null){				//ending call
		if(document.getElementById('vid_'+this.peer))
			document.getElementById('sidevidin').removeChild(document.getElementById('vid_'+this.peer));
		if(document.getElementById('vid1').title == this.peer)
			reattachMediaStream(document.getElementById('vid1'),document.getElementById('sidevidin').firstChild);
		console.log('delete pc: '+this.peer);
//		PCs[this.peer] = null;
		delete PCs[this.peer];
	}else console.log('remoteMediaCallback doesn\'t know how to deal with '+JSON.stringify(remoteData));
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
	if(data.rtc.type == 'offer' && data.type == 'conference')	//video call
		if(!PCs[data.caller] || !PCs[data.caller].peer){
			PCs[data.caller] = new pc(data.caller,data.type,window.opener.signalCh);
			PCs[data.caller].start(localstream,remoteMediaCallback,data.rtc,fn);
		}else if(PCs[data.caller].peerConnection.signalingState != 'stable' || (PCs[data.caller].peerConnection.iceConnectionState != 'connected' && PCs[data.caller].peerConnection.iceConnectionState != 'completed')){
			console.log('Already establishing connection with '+data.caller+', restart connection');
			PCs[data.caller].restart(localstream,remoteMediaCallback,data.rtc,fn);
		}else{
			console.log('Already have an established connection with '+data.caller+', reject new connection!');
			fn(null);
		}
}

function invite(invitee){
	if(!localstream){
		alert('Kindly allow the webcam to be accessed first!');
		return;
	}
	if(participants.indexOf(invitee) == -1)
		participants.push(invitee);
	window.opener.socket.emit('conference',participants);
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
			PCs[data[i]] = new pc(data[i],'conference',window.opener.signalCh);
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
	for(key in PCs)
		PCs[key].dataCh.send(form.msg.value);
	form.reset();
	return false;	//prevent form submit
}

function gUM(){
	getUserMedia({audio:true,video:true},function(stream){
		localstream = stream;
		document.getElementById('overlay').style.display = 'none';
		attachMediaStream(document.getElementById('vid2'),stream);
		if(window.opener.buffer && Array.isArray(window.opener.buffer)){
			participants = window.opener.buffer.slice(0);
			window.opener.buffer = null;
		}else participants = new Array();
		for(var i = 0 ; i < offerBuffer.length ; i++)
			offer(offerBuffer[i].data,offerBuffer[i].fn)
		offerBuffer.length = 0;
		conference(participants);
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
