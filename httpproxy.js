net = require("net");
util=require("util");
URL=require("url");
DNS=require("dns");
Logger = require("./log");
log = new Logger(Logger.ERROR);
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;
local_request=require('./request').local_request;
remote_response=require('./response').remote_response;

CRLF = "\r\n";
SERVER_CMD_START=[0x00,0x01];
SERVER_CMD_END=[0xfe,0xff];
DNSCache={};
DNSCache['www.baidu.com']={addresses:['127.0.0.1']};
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
                    //throw new Error(hostname+" can't be resolved to ip");
                    //close remote socket
                    //clean_remote_socket(socket);
                    return;
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
function delete_from_connection_pool(remote_socket){
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
        try{
            //var request_raw=request.getSendHeader()+request.getBody();
            // 这个是错的，string 和 buffer相加，如果发送2进制数据就会出错！
            log.info("remote connection established");
            log.info("send:\n"+request_raw);
            //remote_socket.write(request_raw);
            remote_socket.write(request.getSendHeader());
            remote_socket.write(request.getBody());
            log.info("write to cached connection:"+hostname+":port");
            return remote_socket;
        }catch(e){
            clean_remote_socket(remote_socket);
            log.error("can't write to cached connection");
        }
    }
    remote_socket = new net.Socket();
    remote_socket.socket=socket;
    try{
        connectTo(remote_socket,hostname,port);
    }catch(e){
        log.error("remote connection fail:"+e)
    }
    remote_socket.url=url;
    remote_socket.on("connect", function() {
        log.debug("connect successful: " + hostname + ":" + port);
    });

    remote_socket.on("error", function(e) {
        log.error("connection error: " + hostname + ":" + port+"  "+e);
        clean_remote_socket(this);
        clean_client_socket(this.socket);
    });
    var response;
    remote_socket.on('data',function(buf){
        log.info("recv remote data length:"+buf.length);
        if(!this.bm){
            this.bm=new BufferManager();
        }
        var bm=this.bm;
        try{
            this.socket.write(buf);
            bm.add(buf);
        }catch(e){
            this.destroy();
            this.socket.destroy();
        }
        if(!response){
            response=parse_remote_response(bm);
        }
        if(response 
            && response.getResponseCode()<200//100－199都是报状态的，响应还没结束
            && response.getResponseCode()>=100
            ){
            log.info("recv 1xx response:"+response.getResponseCode());
            response=false;
            return;
        }
        if(response 
            && response.isKeepAlive()
            && response.responseIsEnd(bm) 
            ){
            log.info("response end:"+response.getResponseCode());
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
        clean_remote_socket(this);
        clean_client_socket(this.socket);
    });
    remote_socket.on("connect",function(){
        this.is_connected=true;
        try{
            this.removeListener("connect",arguments.callee);
            //var request_raw=request.getSendHeader()+request.getBody();
            log.info("remote connection established");
            log.info("send:\n"+request.getSendHeader());
            this.write(request.getSendHeader());
            this.write(request.getBody());
        }catch(e){
            throw e;
        }
    });
    return remote_socket;
}

function clean_remote_socket(remote_socket) {
    delete_from_connection_pool(remote_socket);
    if(!remote_socket){
        return;
    }
    remote_socket.removeAllListeners("data");
    remote_socket.removeAllListeners("error");
    remote_socket.removeAllListeners("close");
    remote_socket.removeAllListeners("connect");
    delete remote_socket.bm;
    if(remote_socket.socket){
        delete remote_socket.socket.remote_socket;
        clean_client_socket(remote_socket.socket);
        delete remote_socket.socket;
    }
    remote_socket.end();
    remote_socket.destroy();
}

function clean_client_socket(socket) {
    if(!socket){
        return;
    }
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    socket.removeAllListeners("connect");
    delete socket.bm;
    if(socket.remote_socket){
        delete socket.remote_socket.socket;
        clean_remote_socket(socket.remote_socket);
        delete socket.remote_socket;
    }
    socket.end();
    socket.destroy();
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
        log.info("recievied local length:\n"+buf.length);
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
        var request=local_request(bm);
        if(request===null){
            log.info("not full request");
            return;
        }

        var remote_socket=this.remote_socket=create_remote_connecton(request,socket);
    });
    
    socket.on("close", function() {
        clean_client_socket(this);
        log.info("local connection closed: " + this.remoteAddress);
    });
    socket.on("error", function() {
        clean_client_socket(this);
        log.error("client error");
    });
});

function process_request(header){
    return header;
}

server.maxConnections=1000;
server.listen('8083','127.0.0.1');

