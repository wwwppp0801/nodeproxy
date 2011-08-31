net = require("net");
util=require("util");
URL=require("url");
DNS=require("dns");
Logger = require("./log");
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;
log = new Logger(Logger.DEBUG);

CRLF = "\r\n";

function connectTo(socket,hostname,port){
    if(net.isIP(hostname)){
        socket.connect(port,hostname);
    }else{
        DNS.resolve4(hostname,function(err,addresses){
                if (err) {
                    throw err;
                }
                socket.connect(port,addresses[0]);
        });
    }
}

function create_remote_connecton(urlStr) {
    var url=URL.parse(urlStr);
    //idx是servers的下标
    var port = url.port?url.port:80;
    var hostname= url.hostname;
    //socket = net.createConnection(port, hostname);
    socket = new net.Socket();
    connectTo(socket,hostname,port);
    socket.url=url;
    socket.on("connect", function() {
        log.info("connect successful: " + hostname + ":" + port);
    });

    socket.on("error", function(e) {
        log.error("connection error: " + hostname + ":" + port);
        log.error(e);
        clean_remote_socket(this);
    });
    socket.on("close", function(had_error) {
        log.info("connection has been closed");
        if (had_error) {
            this.destroy();
        }
        clean_remote_socket(this);
    });
    return socket;
}

function clean_remote_socket(socket) {
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("connect");
    delete socket.url;
    delete socket.bm;
}

function clean_client_socket(socket) {
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("connect");
    delete socket.bm;
    if(socket.remote_socket){
        socket.remote_socket.destroy();
    }
    delete socket.remote_socket;
}


server=net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        if(!this.bm){
            var bm=this.bm=new BufferManager();
        }else{
            var bm=this.bm;
        }
        bm.add(buf);
        var CRLF_index=bm.indexOf(CRLF);
        var http_header_length=bm.indexOf(CRLF+CRLF)+CRLF.length*2;
        if(CRLF_index==-1||http_header_length==-1){
            log.error(bm.toBuffer().toString());
            return;
        }
        var head=bm.slice(0,CRLF_index).toString();
        var remote_socket=this.remote_socket=create_remote_connecton(head.split(/\s+/)[1]);
        var socket=this;
        remote_socket.on('data',function(buf){
            socket.write(buf);
            return;
            /*
            if(!this.bm){
                var bm=this.bm=new BufferManager();
            }else{
                var bm=this.bm;
            }
            bm.add(buf);
            var header_index=bm.indexOf(CRLF+CRLF);
            if(header_index!=-1){
                var header=bm.slice(0,header_index+CRLF*2);
                socket.write(header);
            }else{
                return;
            }
            var headers=header.toString().split(CRLF);
            for (var i=0;i<headers.length;i++){
                if(headers[i].match(/connection:\sclose/i)){
                    //this.destroy();
                    //socket.destroy();
                }
            }*/

        });
        remote_socket.on("close",function(){
            //log.error("remote close");
            //this.destroy();
            //socket.destroy();
            //clean_client_socket(socket);
            //clean_remote_socket(this);
        });
        var clientIp=this.remoteAddress;
            remote_socket.on("connect",function(){
                this.is_connected=true;
                try{
                    this.removeListener("connect",arguments.callee);
                    var header_first=bm.slice(0,bm.indexOf(CRLF)+CRLF.length);
                    var header_rest=bm.slice(bm.indexOf(CRLF)+CRLF.length,http_header_length);
                    var rest=bm.slice(http_header_length);
                    var first_arr=header_first.toString().split(" ");
                    first_arr[1]=this.url.pathname+(typeof this.url.search=='undefined'?'':this.url.search);
                    var header=first_arr.join(" ")+header_rest.toString();
                    log.info(header);
                    this.write(header);
                    bm=socket.bm=new BufferManager();
                    bm.add(rest);
                }catch(e){
                    throw e;
                    //this.destroy();
                }
            });
    });
    socket.on("end", function() {
        clean_client_socket(this);
        log.info("client end " + this.remoteAddress);
    });
    socket.on("close", function() {
        clean_client_socket(this);
        log.info("client close " + this.remoteAddress);
    });
    socket.on("error", function() {
        clean_client_socket(this);
        log.notice("client error");
    });
});

function process_request(header){
    return header;
}

server.maxConnections=2000;
server.listen('8080','127.0.0.1');

