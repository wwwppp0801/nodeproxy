net = require("net");
util=require("util");
URL=require("url");
DNS=require("dns");
Logger = require("./log");
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;
log = new Logger(Logger.INFO);

CRLF = "\r\n";

DNSCache={};
function connectTo(socket,hostname,port){
    if(net.isIP(hostname)){
        socket.connect(port,hostname);
    }else{
        if(typeof DNSCache[hostname]!='undefined'){
            hostname=DNSCache[hostname].addresses[0];
            socket.connect(port,hostname);
        }else{
            DNS.resolve4(hostname,function(err,addresses){
                if (err) {
                    throw err;
                }
                DNSCache[hostname]={addresses:addresses};
                socket.connect(port,addresses[0]);
            });
        }
    }
}

function create_remote_connecton(url) {
    var port = url.port?url.port:80;
    var hostname= url.hostname;
    socket = net.createConnection(port, hostname);
    //socket = new net.Socket();
    //connectTo(socket,hostname,port);
    socket.on("connect", function() {
        log.info("connect successful: " + hostname + ":" + port);
    });

    socket.on("error", function(e) {
        log.error("connection error: " + hostname + ":" + port);
        log.error(e);
        clean_remote_socket(this);
    });
    return socket;
}

function clean_remote_socket(socket) {
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("connect");
    delete socket.bm;
    socket.destroy();
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
    socket.destroy();
}

function parse_local_request(bm){
    var CRLF_index=bm.indexOf(CRLF);
    var http_header_length=bm.indexOf(CRLF+CRLF);
    if(CRLF_index==-1||http_header_length==-1){
        log.info("not enough request content");
        return null;
    }
    http_header_length+=CRLF.length*2;
    var raw_header=bm.slice(0,http_header_length).toString();
    bm.clear();
    bm.add(bm.slice(http_header_length));
    return {
        getQueryString:function(){
            return raw_header.substr(0,CRLF_index).split(/\s+/)[1];
        },
        getSendHeader:function(){
            var header_first=raw_header.substr(0,raw_header.indexOf(CRLF)+CRLF.length);
            var header_rest=raw_header.substr(raw_header.indexOf(CRLF)+CRLF.length,http_header_length);
            var first_arr=header_first.split(" ");
            var url=URL.parse(first_arr[1]);
            first_arr[1]=url.pathname+(typeof url.search=='undefined'?'':url.search);
            return first_arr.join(" ")+header_rest.toString();
        },
        getUrl:function(){
            var queryStr=this.getQueryString();
            log.info(queryStr);
            if(!queryStr){
                log.error(raw_header);
            }
            return URL.parse(queryStr);       
        }
    };
}


function parse_server_cmd(){
    //TODO
    return null;
}

function process_server_cmd(){
    //TODO
    return null;
}


server=net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        log.debug("recievied:\n"+buf.toString());
        if(!this.bm){
            var bm=this.bm=new BufferManager();
        }else{
            var bm=this.bm;
        }
        bm.add(buf);

        var server_cmd=parse_server_cmd(bm);
        if(server_cmd){
            process_server_cmd(server_cmd);
            return;
        }
        var request=parse_local_request(bm);
        if(request===null){
            log.error(bm.toBuffer().toString());
            return;
        }
        var remote_socket=this.remote_socket=create_remote_connecton(request.getUrl());
        remote_socket.on('data',function(buf){
            try{
                socket.write(buf);
            }catch(e){
                this.destroy();
                socket.destroy();
                
            }
        });
        remote_socket.on("close",function(had_error){
            log.info("connection has been closed");
            if (had_error) {
                this.destroy();
            }
            clean_remote_socket(this);
            clean_client_socket(socket);
        });
        remote_socket.on("connect",function(){
            this.is_connected=true;
            try{
                this.removeListener("connect",arguments.callee);
                var header=request.getSendHeader();
                log.debug("send:\n"+header);
                this.write(header);
            }catch(e){
                throw e;
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

