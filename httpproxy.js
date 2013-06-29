net = require("net");
util=require("util");
URL=require("url");
DNS=require("dns");
Logger = require("./log");
log = new Logger(Logger.INFO);
optparser = require("./optparser");
BufferManager=require('./buffermanager').BufferManager;

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

function create_remote_connecton(url) {
    var port = url.port?url.port:80;
    var hostname= url.hostname;
    //socket = net.createConnection(port, hostname);
    socket = new net.Socket();
    connectTo(socket,hostname,port);
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
function local_request(raw_header){
    var CRLF_index=raw_header.indexOf(CRLF);
    var http_header_length=raw_header.indexOf(CRLF+CRLF);

    return {
        getQueryString:(function(){
            var queryStr;
            return function(){
                if(!queryStr){
                    queryStr=raw_header.substr(0,CRLF_index).split(/\s+/)[1];
                }
                return queryStr;
            }
        })(),
        getHttpVersion:(function(){
            var version;
            return function(){
                if(!version){
                    version=raw_header.substr(0,CRLF_index).split(/\s+/)[2]=='HTTP/1.0'?"1.0":"1.1";
                }
                return version;
            };
        })(),
        getMethod:(function(){
            var method;
            return function(){
                if(!method){
                    method=raw_header.substr(0,CRLF_index).split(/\s+/)[0];
                }
                return method;
            };
        })(),
        getHeader:(function(){
            var headers;
            return function (name){
                if(!headers){
                    var header_rest=raw_header.substr(raw_header.indexOf(CRLF)+CRLF.length,http_header_length);
                    headers={};
                    header_rest.split(CRLF).forEach(function(line){
                        if(line){
                            var tmp=line.split(":",2);
                        }
                        if(tmp){
                            headers[tmp[0].trim()]=tmp[1].trim();
                        }
                    });
                }
                if(name){
                    return headers[name];
                }else{
                    return headers;
                }
            };
        })(),
        getSendHeader:function(){
            var headerStr="";
            var headers=this.getHeader();
            for(h in headers){
                headerStr+=h+":"+headers[h]+CRLF;
            }
            return this.getMethod()+" "+this.getQueryString()+" HTTP/"+this.getHttpVersion()+CRLF+
                headerStr+CRLF;
        },
        getUrl:function(){
            var queryStr=this.getQueryString();
            if(queryStr[0]=='/' && this.getHeader("Host")){
                queryStr="http://"+this.getHeader("Host")+queryStr;
            }
            log.info(queryStr);
            if(!queryStr){
                log.error(raw_header);
            }
            return URL.parse(queryStr);       
        }
    };
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
    
    request=local_request(raw_header);
    //TODO
    //shold parse request body
    
    var rest=bm.slice(http_header_length);
    bm.clear();
    bm.add(rest);
    return request;
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
    log.info('recieved server command:'+cmd);
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
            log.info('dnsclean');
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
    socket.on("connect", function() {
        log.info("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        log.info("recievied:\n"+buf.toString());
        if(!this.bm){
            var bm=this.bm=new BufferManager();
        }else{
            var bm=this.bm;
        }
        bm.add(buf);

        var server_cmd=parse_server_cmd(bm);
        if(server_cmd){
            log.info(server_cmd);
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
                log.info("send:\n"+header);
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
server.listen('8083','127.0.0.1');

