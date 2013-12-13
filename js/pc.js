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
function pc(peer, type, signal){
	this.type = type || 'video';
	var self = this;
	var pcMediaConstrains = [{DtlsSrtpKeyAgreement: true}];//this.type == 'video'? [{DtlsSrtpKeyAgreement: true}] : [{DtlsSrtpKeyAgreement: true},{RtpDataChannels: true}];	//chrome doesn't enable dtlsSrtpKeyAgreement by default
	var servers = [ createIceServer('stun:stun.l.google.com:19302') ];
	//firefox enables rtpdatachannel by default, hence keepalive in video only works in firefox and only needs in firefox
	this.peerConnection = new RTCPeerConnection({iceServers: servers}, {optional: pcMediaConstrains});
	this.peer = peer;
	this.dataCh = null;
	this.signal = signal || function(){};	//Send/reply local RTCSessionDescription and RTCIceCandidate signalling
	this.ice = Array();
	this.callback = null;		//Reply signalling for RTCSessionDescription
	this.keepAliveInterval = null;
	this.deadCounter = 0;		//failed to keepalive counter
	this.localMediaCb = null;	//local media acquired callback function
	this.remoteMediaCb = null;	//remote media acquired callback function
	this.debug = false;

	this.peerConnection.onicecandidate = function(event){
		if(event.candidate){
			debugLog('Sending ice candidate to '+self.peer+':'+JSON.stringify(event.candidate));
			self.signal(event.candidate);
		}else	debugLog('Finish sending ice candidates!');
	};
	this.peerConnection.onaddstream = function(event){
		if(!event)
			return;
		debugLog('Receiving stream: '+JSON.stringify(event.stream));
		self.remoteMediaCb(event.stream);
	};
	this.peerConnection.onnegotiationneeded = function(event){
		debugLog('Negotiation needed: '+JSON.stringify(event));	//cannot implement createoffer here since firefox doesn't support
	}
	this.peerConnection.onremovestream = function(event){
		debugLog('Stream removed: '+JSON.stringify(event));
	}
	this.peerConnection.oniceconnectionstatechange = function(event){		//firefox v24 doesn't support it yet
		if(this.iceConnectionState == 'closed' || this.iceConnectionState == 'failed')
			self.end('ice '+this.iceConnectionState+'!');
		else if(this.iceConnectionState == 'disconnected')
			setTimeout(function(){
				if(self.peerConnection && self.peerConnection.iceConnectionState == 'disconnected')
					self.end('Ice Connection State is disconnected for 3 seconds');
			},3000);	//force disconnect after 3 seconds if connect is not restored
		else debugLog('iceConnectionState changed: '+this.iceConnectionState);
	}
	this.peerConnection.onsignalingstatechange = function(event){
		debugLog('signalingState changed: '+self.peerConnection.signalingState);
		if(self.peerConnection.signalingState == 'stable' && this.iceConnectionState == 'connected')
			console.log('Established '+self.type+' connection to '+self.peer);
	}
	this.peerConnection.ondatachannel = function(event){	//receives datachannel "offer"
		debugLog('On data channel...');
		self.initDataCh(event.channel);
	}

	this.addIceCandidate = function(candidate){	//function to add ice candidate
		if(this.peerConnection.iceGatheringState == 'new'){
			this.ice.push(candidate);
			debugLog('Received ice for '+this.peer+', add to queue');
		}else try{
				this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate),function(){
					console.log('Adding ICE candidate: '+JSON.stringify(candidate));
				},function(err){
					console.log('Failed to add ICE candidate: '+JSON.stringify(err));
				});
			}catch(err){
				this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
				console.log('Adding ICE candidate(fallback): '+JSON.stringify(candidate));
			}
	};
	
	var debugLog = function(message){
		if(self.debug)
			console.log(message);
	}

	var createOfferAnswer = function(sessionDesc){
		self.peerConnection.setLocalDescription(sessionDesc, function(){
			debugLog('Sending '+(self.peerConnection.remoteDescription? 'answer' : 'offer')+' to '+self.peer+':\n'+sessionDesc.sdp);
			self.signal(sessionDesc);
		},function(err){
			console.log('Error setLocalDescription: '+JSON.stringify(err));
			this.close();
		});
	}

	var keepalive = function(){
		if(self.deadCounter >= 1)
			self.deadCounter++;
		try{
			self.dataCh.send('hello');
		}catch(err){
			console.log('Unable to send hello, reason:'+JSON.stringify(err));
		}
		if(self.deadCounter > 6)	//keepalive retry count
			self.end('PC seems to be dead, killing it.');
	}

	this.initDataCh = function(dataCh){		//function to initiate data channel internally(dataCh == null) or externally
		this.dataCh = dataCh || this.peerConnection.createDataChannel('dataCh');
		try{
			this.dataCh.binaryType = 'blob';//webrtcDetectedBrowser == 'chrome'? 'arraybuffer' : 'blob';
		}catch(err){
			this.dataCh.binaryType = 'arraybuffer';
		}
		this.dataCh.onmessage = function(event){
			debugLog(self.peer+': '+event.data);
			if (event.data instanceof Blob) {
				alert('blob');
			}
			if(self.type == 'data' || self.type == 'conference')
				self.remoteMediaCb(event.data);
			else if(event.data == 'hello')
				this.send('clr');	//keepalive
			else if(event.data == 'clr')
				self.deadCounter = 1;
		}
		this.dataCh.onopen = function(){
			debugLog('DataCh onopen event, readyState: '+this.readyState);
			if(self.type == 'data')
				self.localMediaCb('enable');
			else if(self.type == 'video')
				self.keepAliveInterval = setInterval(keepalive,2000);	//keepalive interval
		}
		this.dataCh.onclose = function(){
			if(self.type == 'data' && typeof self.localMediaCb == 'function')
				self.localMediaCb('disable');
			self.end('Data Channel on close event');
		}
		if(!dataCh && this.type == 'data')	//if not offeree; conference no need here cause offer is created after video
			this.peerConnection.createOffer(createOfferAnswer,function(err){
				console.log('Failed to create offer: '+JSON.stringify(err));
			});
	}

	var setRemoteDesc = function(){	//just as good as create answer since before create answer remote description is set
		while(self.ice.length){// && self.peerConnection.iceGatheringState != 'new'){
			var candidate = self.ice.pop();
			try{
				self.peerConnection.addIceCandidate(new RTCIceCandidate(candidate),function(){
					console.log('Adding ICE candidate: '+JSON.stringify(candidate));
				},function(err){
					console.log('Failed to add ICE candidate: '+JSON.stringify(err));
				});
			}catch(err){
				self.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
				console.log('Adding ICE candidate(fallback): '+JSON.stringify(candidate));
			}
		}
		if(!self.peerConnection.localDescription){
			self.peerConnection.createAnswer(createOfferAnswer,function(err){
				self.signal(null);
				self.end('Failed to create answer to '+self.peer+'\nError: '+JSON.stringify(err));
			});
		}else debugLog('No need create answer...');	//Since it is the offerer not the offeree
		debugLog('Successfully set remote description!');
	};

	this.setAnswer = function(sessionDesc){
		debugLog('Received answer from '+this.peer+': '+sessionDesc.sdp);
		this.peerConnection.setRemoteDescription(new RTCSessionDescription(sessionDesc),setRemoteDesc,function(err){
			self.end('Failed to set remote description, error: '+JSON.stringify(err));
		});
	}

	this.start = function(localMedia, remoteMedia, sessionDesc, callback){
		if(!window.MediaStream && window.webkitMediaStream)
			MediaStream = webkitMediaStream;
		if(this.type == 'video' || this.type == 'conference')
			if(typeof localMedia == 'function')
				getUserMedia({ audio:true, video: true }, function (stream){
					localMedia(stream);
					self.start(stream,remoteMedia,sessionDesc,callback);			//recursive to simplify code
				}, function(err) {
					console.log('ERROR on getUserMedia(): '+JSON.stringify(err));
				});
			else if(localMedia instanceof MediaStream){
				self.peerConnection.addStream(localMedia);
				if(callback == null){	//initiator
					self.initDataCh();
					self.peerConnection.createOffer(createOfferAnswer,function(err){
						console.log('Failed to create offer: '+JSON.stringify(err));
					});
				}else if(sessionDesc && sessionDesc.sdp.indexOf('m=vid') >= 0){
					self.peerConnection.setRemoteDescription(new RTCSessionDescription(sessionDesc),setRemoteDesc,function(err){
						console.log('Failed to set remote description, error: '+JSON.stringify(err));
						self.signal(null);
					});
					this.callback = callback;
				}else console.log('Invalid session description received, no video media for conference peer connection!\n'+JSON.stringify(sessionDesc));
				this.remoteMediaCb = remoteMedia;
			}else console.log('Invalid localMedia type, unable to initialize peer connection');
		else if(this.type == 'data'){
			if(callback == null)	//initiator
				this.initDataCh();
			else if(sessionDesc){
				this.peerConnection.setRemoteDescription(new RTCSessionDescription(sessionDesc),setRemoteDesc,function(err){
					console.log('Failed to set remote description, error: '+JSON.stringify(err));
					self.signal(null);
				});
				this.callback = callback;
			}else console.log('Invalid start parameters!');
			this.localMediaCb = typeof localMedia == 'function'? localMedia : function(data){};
			this.remoteMediaCb = remoteMedia;
		}else console.log('Unrecognized pc type: '+this.type);
	}
	
	this.restart = function(localMedia, remoteMedia, sessionDesc, callback){
		if(this.peerConnection && this.peerConnection.signalingState != 'closed')
			this.peerConnection.close();
		this.localMediaCb = null;
		this.remoteMediaCb = null;
		this.peerConnection = new RTCPeerConnection({iceServers: servers}, {optional: pcMediaConstrains});
		this.start(localMedia, remoteMedia, sessionDesc, callback);
	}

	this.end = function(reason){
		if(reason)
			console.log('Peer Connection closed, reason:\n'+reason);
		else console.log('Peer connection closed due to unspecified reason.');
		if(this.peerConnection && this.peerConnection.signalingState != 'closed')
			this.peerConnection.close();
		this.peerConnection = null;
		if(this.signal)
			this.signal('bye');
		this.signal = null;
		if(this.localMediaCb)
			this.localMediaCb(null);
		if(this.remoteMediaCb)
			this.remoteMediaCb(null);
		this.peer = null;
		if(this.keepAliveInterval)
			clearInterval(this.keepAliveInterval);
		this.keepAliveInterval = null;
		this.deadCounter = 0;
		this.localMediaCb = null;
		this.remoteMediaCb = null;
		delete this;
	}
}
