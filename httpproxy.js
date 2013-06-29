net = require("net");
util=require("util");
URL=require("url");
DNS=require("dns");
Logger = require("./log");
log = new Logger(Logger.INFO);
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;
local_request=require('./request').local_request;
remote_response=require('./response').remote_response;

CRLF = "\r\n";
SERVER_CMD_START=[0x00,0x01];
SERVER_CMD_END=[0xfe,0xff];
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
var remote_connection_pool={};
function get_cached_remote_connection(url){
    var key=url.hostname+":"+(url.port?url.port:80);
    if(!remote_connection_pool[key]){
        return false;
    }else{
        log.info("re use keepalive connection: "+key);
        return remote_connection_pool[key].pop();
    }
}
function release_connection(remote_socket){
    var url=remote_socket.url;
    var key=url.hostname+":"+(url.port?url.port:80);
    if(typeof(remote_connection_pool[key])=='undefined'){
        remote_connection_pool[key]=[];
    }
    log.info("release keepalive connection: "+key);
    remote_connection_pool[key].push(remote_socket);
}
function delete_from_connection(remote_socket){
    var k,i,tmp;
    for(k in remote_connection_pool){
        tmp=[];
        for(i=0;i<remote_connection_pool[k].length;i++){
            if(remote_connection_pool[k][i]!==remote_socket){
                tmp.push(remote_connection_pool[k][i]);
            }else{
                log.info("delete remote connection from pool");
            }
        }
        remote_connection_pool[k]=tmp;
    }
}

function create_remote_connecton(request,socket) {
    var url=request.getUrl();
    var port = url.port?url.port:80;
    var hostname= url.hostname;
    var remote_socket;
    //socket = net.createConnection(port, hostname);
    if(remote_socket=get_cached_remote_connection(url)){
        remote_socket.socket=socket;
        var header=request.getSendHeader();
        log.debug("send:\n"+header);
        remote_socket.write(header);
        return remote_socket;
    }
    remote_socket = new net.Socket();
    remote_socket.socket=socket;
    try{
        connectTo(remote_socket,hostname,port);
    }catch(e){
        log.error(e)
    }
    remote_socket.url=url;
    remote_socket.on("connect", function() {
        log.debug("connect successful: " + hostname + ":" + port);
    });

    remote_socket.on("error", function(e) {
        log.error("connection error: " + hostname + ":" + port);
        log.error(e);
        delete_from_connection(this);
        clean_remote_socket(this);
    });
    var response;
    remote_socket.on('data',function(buf){
        if(!this.bm){
            this.bm=new BufferManager();
        }
        var bm=this.bm;
        try{
            this.socket.write(buf);
            bm.add(buf);
            //log.info(buf);
        }catch(e){
            this.destroy();
            this.socket.destroy();
        }
        if(!response){
            response=parse_remote_response(bm);
        }
        if(response && response.isKeepAlive() && response.responseIsEnd(bm)){
            release_connection(this);
            response=false;
            delete this.bm;
        }
    });
    remote_socket.on("close",function(had_error){
        log.info("remote connection has been closed");
        if (had_error) {
            this.destroy();
        }
        delete_from_connection(this);
        clean_remote_socket(this);
        clean_client_socket(this.socket);
    });
    remote_socket.on("connect",function(){
        this.is_connected=true;
        try{
            this.removeListener("connect",arguments.callee);
            var header=request.getSendHeader();
            log.info("remote connection established");
            log.debug("send:\n"+header);
            this.write(header);
        }catch(e){
            throw e;
        }
    });
    return remote_socket;
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
        clean_remote_socket(socket);
    }
    delete socket.remote_socket;
    socket.end();
    socket.destroy();
}
function parse_local_request(bm){
    var CRLF_index=bm.indexOf(CRLF);
    var http_header_length=bm.indexOf(CRLF+CRLF);
    if(CRLF_index==-1||http_header_length==-1){
        log.debug("not enough request content");
        return null;
    }
    http_header_length+=CRLF.length*2;
    var raw_header=bm.slice(0,http_header_length).toString();
    
    var request=local_request(raw_header);
    //TODO
    //should parse request body
    
    var rest=bm.slice(http_header_length);
    bm.clear();
    bm.add(rest);
    return request;
}

function parse_remote_response(bm){
    var CRLF_index=bm.indexOf(CRLF);
    var http_header_length=bm.indexOf(CRLF+CRLF);
    if(CRLF_index==-1||http_header_length==-1){
        log.debug("not enough response content");
        return null;
    }
    http_header_length+=CRLF.length*2;
    var raw_header=bm.slice(0,http_header_length).toString();
    
    var response=remote_response(raw_header);
    
    var rest=bm.slice(http_header_length);
    bm.clear();
    bm.add(rest);
    return response;
}


function parse_server_cmd(bm){
    var start=bm.indexOf(SERVER_CMD_START),
        end=bm.indexOf(SERVER_CMD_END);
    if(start!=0 || end==-1){
        return null;
    }
    var cmd=bm.slice(SERVER_CMD_START.length,end-SERVER_CMD_END.length).toString(),
        rest=bm.slice(end+SERVER_CMD_END.length);
    bm.clear();
    bm.add(rest);
    log.debug('recieved server command:'+cmd);
    return cmd;
}

COMMAND_TABLE={
    list:function(){
         },
    info:function(){
         },
    loadconf:function(){
        },
    dnsshow:function(){
            return DNSCache;
        },
    dnsclean:function(){         
            log.debug('dnsclean');
            DNSCache=[];
            load_hosts();
            return DNSCache;
        }
}

function load_hosts(){
    //TODO load file "hosts" to DNSCache
}

function process_server_cmd(cmd,socket){
    var tokens=cmd.split(/\s+/);
    var cmd_type=tokens[0].toLowerCase();
    if(COMMAND_TABLE.hasOwnProperty(cmd_type)){
        result=COMMAND_TABLE[cmd_type](tokens.slice(1));
    }else{
        log.error('not implement: "'+cmd+'"');
        result='not implement';
    }
    var bm=new BufferManager(
            new Buffer(SERVER_CMD_START),
            new Buffer(JSON.stringify(result)),
            new Buffer(SERVER_CMD_END)
            );
    socket.write(bm.toBuffer());
}


server=net.createServer(
function(socket) {
    //socket.on("connect", function() {
    log.info("local connection established: " + socket.remoteAddress);
    //});
    socket.on("end", function() {
        log.info("local connection closed: " + this.remoteAddress);
        clean_client_socket(this);
        //log.debug("client end " + this.remoteAddress);
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
            log.debug(server_cmd);
        }
        if(server_cmd){
            process_server_cmd(server_cmd,this);
            return;
        }
        var request=parse_local_request(bm);
        if(request===null){
            log.error(bm.toBuffer().toString());
            return;
        }

        var remote_socket=this.remote_socket=create_remote_connecton(request,socket);
    });
    /*
    socket.on("close", function() {
        clean_client_socket(this);
        log.info("local connection closed: " + this.remoteAddress);
    });*/
    socket.on("error", function() {
        clean_client_socket(this);
        log.notice("client error");
    });
});

function process_request(header){
    return header;
}

server.maxConnections=2000;
server.listen('8083','127.0.0.1');

