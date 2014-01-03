WebRTC
======
A complete open source framework for video chatting and conference based on WebRTC

WebRTC specification:
http://www.w3.org/TR/webrtc/

Future Improvement/Alternate Architecture:
WebRTC MCU:
https://npmjs.org/package/erizo-api
Licode based on erizo
http://lynckia.com/licode/

INSTALL PROCEDURE for ubuntu:
sudo apt-get install npm mongodb libcap2-bin
sudo apt-get clean
echo -e "\nsmallfiles=true" | sudo tee -a /etc/mongodb.conf >/dev/null
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/nodejs
sudo npm -g install webchat
sudo nano /usr/local/lib/node_modules/webchat/node_modules/mongodb/node_modules/bson/binding.gyp
	replace 'node' with 'nodejs'
sudo make -C /usr/local/lib/node_modules/webchat/node_modules/mongodb/node_modules/bson/
echo -e "description \"webchat\"\nstart on startup\nstart on started mongodb\nstop on runlevel [!2345]\n\nexec npm -g start webchat" | sudo tee /etc/init/webchat.conf >/dev/null

sudo service webchat start
