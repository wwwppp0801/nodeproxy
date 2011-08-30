net = require("net");
util=require("util");
URL=require("url");
Logger = require("./log");
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;
log = new Logger(Logger.DEBUG);

CRLF = "\r\n";

function create_remote_connecton(urlStr) {
    var url=URL.parse(urlStr);
    //idx是servers的下标
    var port = url.port?url.port:80;
    var ip= url.hostname;
    socket = net.createConnection(port, ip);
    socket.on("connect", function() {
        log.info("connect successful: " + ip + ":" + port);
    });

    socket.on("error", function(e) {
        log.error("connection error: " + ip + ":" + port);
        log.error(e);
    });
    socket.on("close", function(had_error) {
        log.info("connection has been closed");
        if (had_error) {
            this.destroy();
        }
        clean_server_socket(this);
    });
    return socket;
}

function clean_server_socket(socket) {
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("connect");
}


server=net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        if(this.remote_socket){
            try{
                this.remote_socket.write(buf);
            }catch(e){
                this.destroy();
                this.remote_socket.destroy();
            }
            return;
        }
        if(!this.bm){
            var bm=this.bm=new BufferManager();
        }else{
            var bm=this.bm;
        }
        bm.add(buf);
        var CRLF_index=bm.indexOf(CRLF);
        if(CRLF_index==-1){
            return;
        }
        var head=bm.slice(0,CRLF_index).toString();
        var remote_socket=this.remote_socket=create_remote_connecton(head.split(/\s+/)[1]);
        var socket=this;
        remote_socket.on('data',function(buf){
            try{
                socket.write(buf);
            }catch(e){
                this.destroy();
                socket.destroy();
            }
        });
        try{
            remote_socket.write(bm.toBuffer());
            log.info(bm.toBuffer().toString());
        }catch(e){
            this.destroy();
            remote_socket.destroy();
        }
    });
    socket.on("end", function() {
        log.info("client end " + this.remoteAddress);
    });
    socket.on("error", function() {
        log.notice("client error");
    });
});
server.maxConnections=2000;
server.listen('8080','127.0.0.1');
