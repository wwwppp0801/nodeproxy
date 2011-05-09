#! /usr/local/bin/node

net = require("net");
Logger = require("./log");
log = new Logger(Logger.INFO);
CONNECTTION_PER_SERVER = 5;
CRLF = "\r\n";

servers = ["127.0.0.1:11220", "127.0.0.1:11221", "127.0.0.1:11222", "127.0.0.1:11223", "127.0.0.1:11224"];
conn_pool = [];

Buffer.prototype.indexOf=function(str){
    var len=str.length,
        buf_len=this.length,
        i,j,ii;
    if(len>0){
        for(i=0;i<buf_len;i++){
            ii=i;
            j=0;
            while(ii<buf_len&&j<len){
                if(this[ii++]!=str.charCodeAt(j++)){
                    break;
                }
                if(j==len){
                    return i;
                }
            }
        }
    }
    return -1;
}

BufferManager=function(){
    //加入几个buffer对象，可以做slice
    this._buffers=Array.prototype.slice.apply(arguments).filter(function(a){
        return Buffer.isBuffer(a);
    });
}
BufferManager.prototype.add=function(buf){
    if(Buffer.isBuffer(buf)){
        this._buffers.push(buf);
    }else{
        log.info("not a Buffer instance");
    }
}
BufferManager.prototype.toBuffer=function(){
    this.slice(0);
}
BufferManager.prototype.size=function(){
    return this._buffers.reduce(function (prev,curr){
        return prev+curr.length;
    },0);
}

BufferManager.prototype.indexOf=function(str){
    var idx=-1,len=0,i,sidx,buf;
    for(i=0;i<this._buffers.length;i++){
        buf=this._buffers[i];
        sidx=buf.indexOf(str);
        if(sidx!=-1){
            idx=len+sidx;
            break;
        }else{
            len+=buf.length;
        }
    }
    return idx;
}
BufferManager.prototype.slice=function(start,length){
    var all_len=this.size();
    length=(typeof length=="undefined"?all_len-start:length);
    var buf=new Buffer(Math.min(all_len,length)),offset=0;
    this._buffers.forEach(function(pbuf,idx){
        if(pbuf.length>start){
            var copy_len=pbuf.copy(buf,offset,start,start+length);
            length-=copy_len;
            start=0;
        }else{
            start-=pbuf.length;
        }
    });
    return buf;
}


function hashCode(str) {
    //hash函数，用于选择memcache，可重新实现，用于选memcache，现在这个兼容java的String.hashCode
    var h = 0,
        off = 0,
        len = str.length,
        t = - 2147483648 * 2;
    for (var i = 0; i < len; i++) {
        h = 31 * h + str.charCodeAt(off++);
        while (h > 2147483647) {
            h += t;
        }
    }
    return h;
}


function create_memcache_connecton(idx,add_to_pool) {
    //idx是servers的下标
    var ip, port, tmp = servers[idx].split(":");
    ip = tmp[0];
    port = tmp[1];
    if (!conn_pool[idx]) {
        conn_pool[idx] = [];
    }
    socket = net.createConnection(port, ip);
    socket.idx = idx;
    socket.on("connect", function() {
        log.info("connect successful: " + ip + ":" + port);
        this.is_connected = true;
        if(add_to_pool){
            conn_pool[idx].push(this);
        }
    });

    socket.on("error", function(e) {
        log.error("memcache connection error: " + ip + ":" + port);
        log.error(e);
    });
    socket.on("close", function(had_error) {
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
    remove_from_pool(socket);
    delete socket.is_connected;
}
function remove_from_pool(socket) {
    var i = conn_pool[socket.idx].indexOf(socket);
    if (i >= 0) {
        conn_pool[socket.idx].splice(i, 1);
    }
}

function process_own_request(socket,request) {
    //TODO 如果是不用转发给memcache的命令，在此处理，并返回true，否则返回false;
    return false;
}

function choose_memcache(request) {
    //根据cmd的内容，选择要转发的memcache连接，如果连接池里没有连接了，就新建一个连接
    if (['set', 'add', 'replace', 'get', 'delete', 'incr', 'decr'].indexOf(request.type) < 0) {
        return false;
    }
    var hash=hashCode(request.key);
    var idx=hash % servers.length;
    var pool=conn_pool[idx];
    if(pool.length>0){
        var mc=pool.pop();
        log.info("get memcache connection:"+idx+" - "+pool.length);
        mc.removeAllListeners("data");
        return mc;
    }else{
        //创建一个新连接，但不加到连接池，用完之后调用release_memcache_conn会归还给连接池的
        log.info("ceate new memcache connection:"+idx);
        return create_memcache_connecton(idx,false);
    }
}


function release_memcache_conn(mc){
    mc.removeAllListeners("data");
    conn_pool[mc.idx].push(mc);
}


servers.forEach(function(val, idx) {
    var ip, port, tmp = val.split(":"),
    i;
    ip = tmp[0];
    port = tmp[1];
    for (i = 0; i < CONNECTTION_PER_SERVER; i++) {
        create_memcache_connecton(idx,true);
    }
});


function mk_response(remain_data,buf,type){
    var bm=new BufferManager(remain_data,buf);
    var buf_len=bm.size();
    var response={type:type};
    var NORMAL_EXPS=['ERROR'+CRLF,'CLIENT_ERROR','SERVER_ERROR','STORED'+CRLF,'NOT_STORED'+CRLF,"DELETED"+CRLF,"NOT_FOUND"+CRLF,"END"+CRLF];
    var i,pos;
    for(i=0;i<NORMAL_EXPS.length;i++){
        if(bm.indexOf(NORMAL_EXPS[i])==0){
            response.buffer=bm.slice(0,bm.indexOf(CRLF)+CRLF.length);
            return response;
        }
    }
    //data response
    var DATA_END="\r\nEND\r\n";
    pos=bm.indexOf(DATA_END);
    if(pos!=-1){
        response.buffer=bm.slice(0,pos+DATA_END.length);
        return response;
    }
    return false;
}


function mk_request(remain_data,buf){
    //协议解析参考文档http://www.ccvita.com/306.html
    var bm=new BufferManager(remain_data,buf);
    var buf_len=bm.size();
    var cmd_pos=bm.indexOf(CRLF);
    if(!cmd_pos==-1){
        return false;
    }
    var cmd=bm.slice(0,cmd_pos).toString();
    var tokens=cmd.split(" ");
    var request={};
    request.type=tokens[0].toLowerCase();
    if(["set","add","replace","get","delete","incr","decr"].indexOf(request.type)!=-1){
        request.key=tokens[1];
    }
    if(["set","add","replace"].indexOf(request.type)!=-1){
        //这几条命令有后续的'data',长度是最后一个token;
        var data_len=parseInt(tokens[4],10),data;
        request.flags=tokens[2];
        request.exptime=tokens[3];
        if(buf_len>=data_len+cmd_pos+2*CRLF.length){
            request.value=bm.slice(cmd_pos+2,data_len);
            request.buffer=bm.slice(0,data_len+cmd_pos+2*CRLF.length);
        }else{
            //data还没收完，做不出一个request对象;
            return false;
        }
    }else{
        request.buffer=bm.slice(0,cmd_pos+CRLF.length);
    }
    if('delete'==request.type){
        //在这个指定时间内，不能对这个key做add、replace
        request.time=tokens[2];
    }
    if(['incr','decr'].indexOf(request.type)!=-1){
        request.value=tokens[2];
    }

    return request;

}

function add_remain_data(socket,buf,parsed_request){
    var bm=new BufferManager(socket.remain_data,buf);
    if(parsed_request){
        socket.remain_data=bm.slice(parsed_request.buffer.length);
    }else{
        socket.remain_data=bm.toBuffer();
    }
}

function process_request(source_socket,request){
    if (process_own_request(source_socket,request)) {
        //这是发给proxy自身的命令，不用转发给memcache
        return;
    }
    var mc=choose_memcache(request);
    if (mc.is_connected) {
        mc.write(request.buffer);
    } else {
        log.notice("not writable, wait for connected");
        mc.once("connect", function() {
            mc.write(buf);
        });
    }
    
    mc.on("data", function(res_buf) {
        log.debug("recieved memcache data from: " + this.remoteAddress);
        var response=mk_response(this.remain_data,res_buf);
        add_remain_data(this,res_buf,response);
        if(response){
            log.debug("transfer memcache data to client");
            source_socket.write(response.buffer);
            this.removeListener("data",arguments.callee);
            release_memcache_conn(this);
        }
    });
}

net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        log.debug("recieved data from: " + this.remoteAddress);
        var request=mk_request(this.remain_data,buf);
        add_remain_data(this,buf,request);
        if(request){
            process_request(this,request);
        }
    });
    socket.on("end", function() {
        log.info("client end " + this.remoteAddress);
    });
    socket.on("error", function() {
        log.notice("client error");
    });
}).listen(11111);

