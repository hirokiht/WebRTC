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
var socket = io.connect(window.location.href)
  , videoPC = null	//video peerConnection
  , dataPCs = new Array()
  , conWin = null			//Conference window reference
  , buffer = null;			//buffer to transfer argument to new window

function signalCh(data){
	var self = this;
	if(data == 'bye')
		socket.emit(data,{peer: this.peer, type: this.type});
	else if(data == null || typeof data.sdp == 'string')//data instanceof RTCSessionDescription)
		if(data == null || this.peerConnection.remoteDescription)
			this.callback(data);
		else{
			console.log('Sending offer to '+this.peer);
			socket.emit('offer', {callee: this.peer, type: this.type, rtc: data},function(answer){
				if(answer == null){
					if(self.type == 'conference' && conWin && !conWin.closed){
						self.end(self.peer+' failed to provide valid answer!');
						conWin.alert(self.peer+' is unavailable right now!');
					}else{
						self.end(self.peer+' failed to provide valid answer!');
						alert(self.peer+' is unavailable right now!');
					}
				}else self.setAnswer(answer);
			});
		}
	else if(typeof data.candidate == 'string')//data instanceof RTCIceCandidate)
		socket.emit('ice',{'to': this.peer,'icecandidate': data});
	else console.log('Signal Channel dont know how to deal with this: '+JSON.stringify(data));
}

function remoteVideoMediaCallback(remoteVid){
	if(remoteVid){		//initiating call
		attachMediaStream(document.getElementById('vid1'),remoteVid);
		document.getElementById('vid1').style.display = 'block';
		document.getElementById('endcall').onclick = function() {videoPC.end("User requested to end");};
		document.getElementById('endcall').style.display = 'block';
	}else{				//ending call
		document.getElementById('vid1').pause();
		document.getElementById('vid1').style.display = 'none';
		document.getElementById('endcall').style.display = 'none';
		videoPC = null;
	}
}

function localVideoMediaCallback(localVid){
	if(localVid){		//initiating call
		attachMediaStream(document.getElementById('vid2'),localVid);
		document.getElementById('vid2').style.display = 'block';
	}else{				//ending call
		document.getElementById('vid2').pause();
		document.getElementById('vid2').style.display = 'none';
	}
}

function remoteDataMediaCallback(remoteData){
	if(!remoteData)
		return;
	if(document.getElementById('tabs-'+this.peer)){
		var msg = document.createElement('p');
		msg.innerHTML = this.peer+': '+remoteData;
		document.getElementById('tabs-'+this.peer).firstChild.appendChild(msg);
		document.getElementById('tabs-'+this.peer).firstChild.scrollTop = document.getElementById('tabs-'+this.peer).firstChild.scrollHeight;	//scroll to bottom
	}else console.log('tab for '+this.peer+' not found!')
}

function localDataMediaCallback(action){
	if(action == 'enable')
		if(document.getElementById('tabs-'+this.peer))
			document.getElementById('tabs-'+this.peer).style.display('block');
		else addTab(this.peer);
	else if(action == 'disable' || action == null){
		removeTab(this.peer);
		console.log('delete pc:'+this.peer);
		delete dataPCs[this.peer];
	}
}

socket.on('connect', function(){
		document.getElementById('friendlist').style.color = 'inherit';
		document.getElementById('status').selectedIndex = 0;
		console.log('Socket connected!');
		if(conWin && !conWin.closed)
			conWin.connected();
	},function(err){
		document.getElementById('friendlist').style.color = '#BBB';
		document.getElementById('status').selectedIndex = 1;
		console.log('Connection failed! Error: '+JSON.stringify(err));
		if(conWin && !conWin.closed)
			conWin.disconnected(err);
	});

socket.on('bye',function(data){
	console.log('Received bye from '+data.peer);
	if(videoPC && videoPC.peer == data.peer && data.type == 'video')
		videoPC.end('Received bye');
	if(dataPCs[data.peer] && data.type == 'data')
		dataPCs[data.peer].end('Received bye from '+data.peer);
	if(conWin && !conWin.closed && data.type == 'conference')
		conWin.bye(data.peer);
});

socket.on('ice',function(data){
	console.log('Received ice from '+data.peer);
	if(videoPC && videoPC.peer == data.peer)
		videoPC.addIceCandidate(data.candidate);
	if(dataPCs[data.peer])
		dataPCs[data.peer].addIceCandidate(data.candidate);
	if(conWin && !conWin.closed)
		conWin.ice(data);
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
		this.parentNode.className = 'onCall';
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
	if(conWin && !conWin.closed)
		conWin.online(data);
});

socket.on('offline',function(data){
	if(document.getElementById('friend_'+data))
		document.getElementById('friends').removeChild(document.getElementById('friend_'+data));
	if(conWin && !conWin.closed)
		conWin.offline(data);
});

socket.on('disconnect',function(){
	document.getElementById('friendlist').style.color = '#BBB';
	document.getElementById('status').selectedIndex = 1;
	document.getElementById('friends').innerHTML = '';
	console.log('Server connection disconnected!');
	if(conWin && !conWin.closed)
		conWin.close();
});

socket.on('offer',function(data,fn){
	console.log('Received offer from '+data.caller);//+': '+data.rtc.sdp);
	if(data.rtc.type == 'offer'){	
		if(data.type == 'video'){
			if(data.rtc.sdp.indexOf('m=vid') < 0){//video call
				console.log('Received invalid sdp for video call');
				fn(null);
				return;
			}
			if(videoPC && videoPC.peer)	//buzy
				fn(null);
			else{
				if(confirm('Accept video call from '+data.caller+'?')){
					videoPC = new pc(data.caller,'video',signalCh);
					videoPC.start(localVideoMediaCallback,remoteVideoMediaCallback,data.rtc,fn);	
				}else fn(null);
			}
		}else if(data.type == 'data'){		//data peerconnection
			if(!dataPCs[data.caller])
				dataPCs[data.caller] = new pc(data.caller,'data',signalCh);
			dataPCs[data.caller].start(localDataMediaCallback,remoteDataMediaCallback,data.rtc,fn);
		}else if(data.type == 'conference'){
			if(!conWin || conWin.closed){
				fn(null);
				console.log('Not READY for conference!!!!');
			}else conWin.offer(data,fn);
		}else console.log('Unsupported offer type: '+data.type);
	}
});

socket.on('conference',function(data){
	if(!Array.isArray(data)){
		console.log('Invalid conference data');
		return;
	}
	if(!conWin || conWin.closed){
		if(dialogIsOpen && buffer != null && Array.isArray(buffer)){
			if(buffer.indexOf(data[0]) != -1){
				for(var i = 0 ; i < data.length ; i++)
					if(buffer.indexOf(data[i]) == -1)
						buffer.push(data[i]);
				document.getElementById('confirm').innerHTML = data.toString();
				showDialog(function(){
					conWin = window.open('/conference','conference','menubar=no,status=no');
				});
			}else console.log('Pending conference request unresolved yet, reject current request');
		}else{
			buffer = data;
			document.getElementById('confirm').innerHTML = data.toString();
			showDialog(function(){
				conWin = window.open('/conference','conference','menubar=no,status=no');
			});
		}
	}else conWin.conference(data);
});

function videoCall(callee){
	videoPC = new pc(callee,'video',signalCh);
	videoPC.start(localVideoMediaCallback,remoteVideoMediaCallback);
}

function text(textee){
	if(!dataPCs[textee] || !dataPCs[textee].peer){
		dataPCs[textee] = new pc(textee,'data',signalCh);
		dataPCs[textee].start(localDataMediaCallback,remoteDataMediaCallback);
	}else if(document.getElementById('tabs-'+textee))
		showTab(textee);
	else addTab(textee);
}

function sendMsg(form){
	var p = document.createElement('p');
	p.innerHTML = 'Me: '+form.msg.value.replace(/\n/g, '<br>');
	form.firstChild.appendChild(p);
	form.firstChild.scrollTop = form.firstChild.scrollHeight;	//scroll to bottom
	if(dataPCs[form.id.substr(5)] && dataPCs[form.id.substr(5)].dataCh)
		dataPCs[form.id.substr(5)].dataCh.send(form.msg.value);
	else console.log('Data channel is not opened!');
	form.reset();
	return false;	//prevent form submit
}			

function addTab(label){
	var tabs = $('#chattabs');
	var tabTemplate = '<li><a href="#{href}" class="fa fa-user"> #{label}</a> <span class="fa fa-times" role="presentation"></span></li>';
	var id = 'tabs-'+label, li = $(tabTemplate.replace( /#\{href\}/g, "#" + id ).replace( /#\{label\}/g, label )),
	tabContentHtml = '<div class="content"></div><div class="controls"><textarea name="msg"></textarea><button type="submit" class="fa fa-envelope-o"> Send</button></div>';
	tabs.find('.ui-tabs-nav').append( li );
	tabs.prepend('<form id="'+id+'" onsubmit="return sendMsg(this);">'+tabContentHtml+'</form>');
	tabs.tabs('refresh');
	$('.tabs-bottom .ui-tabs-nav, .tabs-bottom .ui-tabs-nav > *').removeClass('ui-corner-all ui-corner-top');
	$('.tabs-bottom .ui-tabs-nav, .tabs-bottom .ui-tabs-nav > *').addClass('ui-corner-bottom');
	document.getElementById(id).msg.onkeypress = function(event){
			if(event.keyCode == 13 && !event.shiftKey){	//enter to send while shift key is not on hold
				sendMsg(this.form);
				return false;							//prevent newline occur after reset the form
			}
		}
	if(!tabs.tabs('option','active'))
		tabs.tabs('option','active',-1);	//show this new tab if all tabs are collapsed
}

function showTab(label){
	$('#chattabs-'+label).show();
	$('#chattabs>ul.ui-tabs-nav>li[aria-controls=tabs-'+label+']').show();
	$('#vidbox').css('height','70%');
}

function removeTab(label){
	var tab;
	if(tab = document.getElementById('tabs-'+label))
		document.getElementById('chattabs').removeChild(tab);
	$('#chattabs>ul.ui-tabs-nav>li[aria-controls=tabs-'+label+']').remove();
	if(!$('#chattabs >ul >li').length)
		$('#vidbox').css('height','99%');
	$('#chattabs').tabs('refresh');
}

function dialogIsOpen(){
	return $('#confirm').dialog('isOpen');
}

function showDialog(acceptCB,denyCB){
	if(dialogIsOpen())
		$('#confirm').dialog('close');
	updateDialog(acceptCB,denyCB);
	$('#confirm').dialog('open');
}

function updateDialog(acceptCB,denyCB){
	var buttons = $('#confirm').dialog('option','buttons');
	if(typeof acceptCB == 'function')
		buttons[0].click = function(){
			acceptCB();
			$(this).dialog('close');
		}
	if(typeof denyCB == 'function')
		buttons[1].click = function(){
			denyCB();
			$(this).dialog('close');
		}
	$('#confirm').dialog('option','buttons',buttons);
}

$(function() {
	var tabs = $('#chattabs').tabs({show:'slideDown', hide: 'slideUp', collapsible: true, heightStyle: 'fill'});
	$('.tabs-bottom .ui-tabs-nav, .tabs-bottom .ui-tabs-nav > *').removeClass('ui-corner-all ui-corner-top');
	$('.tabs-bottom .ui-tabs-nav, .tabs-bottom .ui-tabs-nav > *').addClass('ui-corner-bottom');
	
	tabs.on('tabsactivate',function(event,ui){
		$('#chattabs').css('width','100%');
		if(!ui.newTab[0] && !ui.newPanel[0]){	//collapsed
			$('#vidbox').css('height','95%');
		}else{
			$('#vidbox').css('height','70%');
		}
	});
	tabs.on('click','span.fa-times',function(){	//hide it until disconnected
		var panelId = $( this ).closest('li').attr('aria-controls');//.remove().attr('aria-controls');
		$('#'+panelId).hide();
		$( this ).closest('li').hide();
		if($('#chattabs >ul').find("li:hidden").length == $('#chattabs >ul >li').length)	//all hidden
			$('#vidbox').css('height','99%');
//		$('#'+panelId).remove();
//		tabs.tabs('refresh');
	});
	$('#confirm').dialog({
		resizable: false,
		draggable: false,
		closeOnEscape: false,
		autoOpen: false,
		modal: true,
		buttons: [{
			text: 'Accept',
			icons: {primary: 'ui-icon-check'},
			click: function(){
				$(this).dialog('close');
			}
		},{ text: 'Decline',
			icons: {primary: 'ui-icon-closethick'},
			click: function(){
				$(this).dialog('close');
			}
		}],
		show: true
	});
});

window.onbeforeunload = function(){
}

window.onload = function(){
	document.getElementById('status').onchange = function(){
		if(document.getElementById('status').selectedIndex)
			socket.disconnect()
		else socket.socket.connect();
	}
	document.getElementById('conference').onclick = function(){
		if(conWin && !conWin.closed)
			conWin.focus();
		else conWin = window.open('/conference','conference','menubar=no,status=no');
	}
}

window.onbeforeunload = function(){
	if(conWin && !conWin.closed)
		return 'Are you sure? This will close all video and conference calls!';
	else return null;
}

window.onunload = function(){
	if(videoPC)
		videoPC.end();
	for(key in dataPCs)
		dataPCs[key].end();
	if(conWin && !conWin.closed)
		conWin.close();
}
