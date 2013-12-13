var socket = io.connect(window.location.href)
  , peerConnection = null
  , dataCh = null	//store the data channel reference
  , peers = new Array()	//store peers so that ice candidate will be pushed to them
  , ice = new Array()	//store ice candidate to add them after peerconnection is established
  , callback = null	//callback for socket.on(offer)
  , videoConstrain = true;/*{	//videoConstrain for getUserMedia, accepted but not supported by any browsers yet
  mandatory: {
    width: { min: 640 },
    height: { min: 480 }
  },
  optional: [
    { width: 650 },
    { width: { min: 650 }},
    { frameRate: 60 },
    { width: { max: 800 }},
    { facingMode: "user" }
  ]
};*/

socket.on('connect', initPeerConnection,function(err){
	console.log('Connection failed! Error: '+JSON.stringify(err));
});

socket.on('ice',function(candidate){
	if(peerConnection.iceGatheringState == 'new'){
		ice.push(candidate);
		console.log('Received ice, add to queue');
	}else{
		peerConnection.addIceCandidate(new RTCIceCandidate(candidate),function(){
			console.log('Adding ICE candidate: '+JSON.stringify(candidate));
		},function(err){
			console.log('Failed to add ICE candidate: '+JSON.stringify(err));
		});
	}
});

socket.on('online',function(data){
	console.log(data+' is online =)');
	var friend = document.createElement('li');
	friend.innerHTML = friend.title = data;
	friend.appendChild(document.createElement('br'));
	friend.id = 'friend_'+data;
	var vidCall = document.createElement('button');
	vidCall.type = 'button';
	vidCall.innerHTML = 'Video Call';
	vidCall.onclick = function(){
		this.parentNode.className='onCall';
		videoCall(this.parentNode.title);
	};
	friend.appendChild(vidCall);
	var txtChat = document.createElement('button');
	txtChat.innerHTML = 'Text Chat';
	txtChat.onclick = function(){
		text(this.parentNode.title)
	};
	friend.appendChild(txtChat);
	document.getElementById('friends').appendChild(friend);
});

socket.on('offline',function(data){
	document.getElementById('friends').removeChild(document.getElementById('friend_'+data));
});

socket.on('disconnect',function(){
	document.getElementById('chat').style.visibility='hidden';
	document.getElementById('friends').innerHTML = '';
	alert('Connection disconnected!');
	socket = null;
});

socket.on('offer',function(data,fn){
	console.log('Received offer from '+data.caller+': '+data.rtc.sdp);
	if(data.rtc.type == 'offer'){
		if(data.rtc.sdp.indexOf('m=vid') >= 0){
			document.getElementById('waiting').innerHTML = data.caller+' calling... Please allow the access to your webcam and mic to receive the call!';
			getUserMedia({ audio:true, video: videoConstrain }, function (stream){
				peers.push(data.caller);
				attachMediaStream(document.getElementById('vid2'),stream);
				document.getElementById('vid2').style.display = 'block';
				peerConnection.addStream(stream);
				callback = fn;
				peerConnection.setRemoteDescription(new RTCSessionDescription(data.rtc),setRemoteDesc,function(err){
					console.log('Failed to set remote description, error: '+JSON.stringify(err));
					fn(null);
				});
			}, function(err) {
				console.log('ERROR on getUserMedia(): '+JSON.stringify(err));
				document.getElementById('waiting').innerHTML = 'Unable to access your webcam/mic!';
			});
		}else{		//data peerconnection
			peers.push(data.caller);
			callback = fn;
			peerConnection.setRemoteDescription(new RTCSessionDescription(data.rtc),setRemoteDesc,function(err){
				console.log('Failed to set remote description, error: '+JSON.stringify(err));
				fn(null);
			});
		}
	}
});

function setRemoteDesc(){
	while(ice.length){
		var candidate = ice.pop();
		peerConnection.addIceCandidate(new RTCIceCandidate(candidate),function(){
			console.log('Adding ICE candidate: '+JSON.stringify(candidate));
		},function(err){
			console.log('Failed to add ICE candidate: '+JSON.stringify(err));
		});
	}
	if(callback){
		peerConnection.createAnswer(function(sessionDesc){
			peerConnection.setLocalDescription(sessionDesc);
			console.log('Sending answer to '+peers[peers.length-1]);
			callback(sessionDesc);
			callback = null;
		},function(err){
			console.log('Failed to create answer to '+peers[peers.length-1]+'\nError: '+JSON.stringify(err));
			callback(null);
			callback = null;
		});
	}else	console.log('No need create answer...');
	console.log('Successfully set remote description!');
}

function initPeerConnection(){
	peerConnection = new RTCPeerConnection({ 'iceServers': [{ 'url': 'stun:stun.l.google.com:19302' }] },{ 'optional': [{'DtlsSrtpKeyAgreement': true},{'RtpDataChannels': true}] });	//chrome doesn't enable dtlsSrtpKeyAgreement
	peerConnection.onicecandidate = function(event){
		if (!peerConnection || !event || !event.candidate)
			return;
		if(!peers.length)
			console.log('NO PEERS!!!!!!!!');
		for(var i in peers){
			console.log('Sending ice candidate to '+peers[i]+':'+JSON.stringify(event.candidate));
			socket.emit('ice',{'to': peers[i],'icecandidate': event.candidate});
		}
	};
	peerConnection.onaddstream = function(event){
		if(!event)
			return;
		console.log('Receiving stream: '+JSON.stringify(event.stream));
		attachMediaStream(document.getElementById('vid1'),event.stream);
		document.getElementById('vid1').style.display = 'block';
	};
	peerConnection.onnegotiationneeded = function(event){
		console.log('Negotiation needed: '+JSON.stringify(event));	//cannot implement createoffer here since firefox doesn't support
	}
	peerConnection.onremovestream = function(event){
		console.log('Stream removed: '+JSON.stringify(event));
	}
	peerConnection.oniceconnectionstatechange = function(event){		//firefox v24 doesn't support it yet
		if(!peerConnection || !peerConnection.iceGatheringState || !peerConnection.iceConnectionState)
			return;
		if(peerConnection.iceConnectionState == 'closed' || peerConnection.iceConnectionState == 'failed'){
			endPeerConnection();
		}else if(peerConnection.iceConnectionState == 'disconnected')
			setTimeout(function(){
				if(peerConnection.iceConnectionState == 'disconnected')
					endPeerConnection();
			},3000);	//force disconnect after 3 secolocands if connect is not restored
		else	console.log('iceConnectionState changed: '+peerConnection.iceConnectionState);
	}
	peerConnection.ondatachannel = function(event){	//receives datachannel "offer"
		dataCh = event.channel;
		dataCh.binaryType = webrtcDetectedBrowser == 'chrome'? 'arraybuffer' : 'blob';
		dataCh.onmessage = function(event){
			console.log('Message: '+event.data);
		        if (event.data instanceof Blob) {
				alert('blob');
			}
			var msg = document.createElement('p');
			msg.innerHTML = 'Message: '+event.data;
			document.getElementById('msg_content').appendChild(msg);
			document.getElementById('msg_content').scrollTop = document.getElementById('msg_content').scrollHeight;	//scroll to bottom
			
		}
		dataCh.onopen = function(){
			console.log('Data Channel ready state: '+dataCh.readyState);
			console.log('On open event');
			document.getElementById('msg_content').innerHTML += 'Data channel is open!';
			document.getElementById('chatbox').msg.disabled = false;
			document.getElementById('chatbox').send.disabled = false;
			document.getElementById('chatbox').msg.onkeypress = function(event){
				if(event.keyCode == 13 && !event.shiftKey)
					sendMsg();
			};
		}
		dataCh.onclose = function(){
			console.log('Data Channel ready state: '+dataCh.readyState);
			console.log('On close event');
			document.getElementById('msg_content').innerHTML += 'Data channel is closed!';
			document.getElementById('chatbox').msg.disabled = true;
			document.getElementById('chatbox').send.disabled = true;
			endPeerConnection();
		}
	}
	document.getElementById('waiting').innerHTML = 'Ready to use!';
}

function endPeerConnection(){
	if(!peerConnection)
		return;
	console.log('Connection closed, iceConnectionState: '+peerConnection.iceConnectionState);
	peers.length = 0;	//remove ICE peers, empty the array
	peerConnection.close();
	peerConnection = null;
	document.getElementById('vid1').style.display = 'none';
	document.getElementById('waiting').innerHTML = 'Standing by...';
	initPeerConnection();
}

function sendOffer(sessionDesc){
	peerConnection.setLocalDescription(sessionDesc,function(){
		for(var i in peers){
			console.log('Sending offer to '+peers[i]);
			socket.emit('offer', {callee: peers[i], rtc: sessionDesc},function(answer){
				if(answer == null){
					endPeerConnection();
					alert(peers[i]+' failed to provide valid answer!');
					return;
				}
				console.log('Received answer from '+peers[i]+': '+answer.sdp);
				callback = null;	//just in case
				peerConnection.setRemoteDescription(new RTCSessionDescription(answer),setRemoteDesc,function(err){
					console.log('Failed to set remote description, error: '+JSON.stringify(err));
				});
			});
		}
	},function(err){
		console.log('Error setLocalDescription: '+JSON.stringify(err));
	});
}

function videoCall(callee){
	document.getElementById('waiting').innerHTML = 'Please allow the access to your webcam and mic!';
	getUserMedia({ audio:true, video: videoConstrain}, function (stream){
		peers.push(callee);
		attachMediaStream(document.getElementById('vid2'),stream);
		document.getElementById('vid2').style.display = 'block';
		peerConnection.addStream(stream);
		peerConnection.createOffer(sendOffer,function(err){
			console.log('ERROR on createOffer(): '+JSON.stringify(err));
			document.getElementById('waiting').style.display = 'block';
		});
		document.getElementById('waiting').innerHTML = 'Calling '+callee+'...';
	}, function(err) {
		console.log('ERROR on getUserMedia(): '+JSON.stringify(err));
		document.getElementById('waiting').innerHTML = 'Unable to access your webcam/mic!';
	});
}

function text(textee){
	peers.push(textee);
	dataCh = peerConnection.createDataChannel('dataCh');
	dataCh.binaryType = webrtcDetectedBrowser == 'chrome'? 'arraybuffer' : 'blob';
	dataCh.onmessage = function(event){
		console.log('Message: '+event.data);
	        if (event.data instanceof Blob) {
			alert('blob');
		}
		var msg = document.createElement('p');
		msg.innerHTML = 'Message: '+event.data;
		document.getElementById('msg_content').appendChild(msg);
		document.getElementById('msg_content').scrollTop = document.getElementById('msg_content').scrollHeight;	//scroll to bottom
	}
	dataCh.onopen = function(){
		console.log('Data Channel ready state: '+dataCh.readyState);
		console.log('On open event');
		document.getElementById('msg_content').innerHTML += 'Data channel is open!';
		document.getElementById('chatbox').msg.disabled = false;
		document.getElementById('chatbox').send.disabled = false;
		document.getElementById('chatbox').msg.onkeypress = function(event){
			if(event.keyCode == 13 && !event.shiftKey)	//enter to send while shift key is not on hold
				sendMsg();
		};
	}
	dataCh.onclose = function(){
		console.log('Data Channel ready state: '+dataCh.readyState);
		console.log('On close event');
		document.getElementById('msg_content').innerHTML += 'Data channel is closed!';
		document.getElementById('chatbox').msg.disabled = true;
		document.getElementById('chatbox').send.disabled = true;
		endPeerConnection();
	}
	peerConnection.createOffer(sendOffer,function(err){
		console.log('ERROR on createOffer(): '+JSON.stringify(err));
		document.getElementById('waiting').style.display = 'block';
	});
}

function sendMsg(){
	dataCh.send(document.getElementById('chatbox').msg.value);
	var msg = document.createElement('p');
	msg.innerHTML = 'Me: '+document.getElementById('chatbox').msg.value.replace(/\n/g, '<br>');
	document.getElementById('msg_content').appendChild(msg);
	document.getElementById('msg_content').scrollTop = document.getElementById('msg_content').scrollHeight;	//scroll to bottom
	document.getElementById('chatbox').msg.value = '';
	return false;	//prevent form submit
}
