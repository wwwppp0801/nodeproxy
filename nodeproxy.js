net = require("net");
util=require("util");
Logger = require("./log");
BufferManager=require('./buffermanager').BufferManager;
log = new Logger(Logger.INFO);
//log = new Logger(Logger.DEBUG);
//log = new Logger(Logger.ERROR);
//CONNECTTION_PER_SERVER = 5;
CONNECTTION_PER_SERVER = 1;
CRLF = "\r\n";

//servers = ["10.1.146.144:11220", "10.1.146.144:11221", "10.1.146.144:11222", "10.1.146.144:11223", "10.1.146.144:11224"];
//servers = ["10.1.146.144:11220"];
servers = ["127.0.0.1:11220", "127.0.0.1:11221", "127.0.0.1:11222", "127.0.0.1:11223", "127.0.0.1:11224"];
conn_pool = [];
conn_num=0;
servers.forEach(function(val, idx) {
    var ip, port, tmp = val.split(":"),
    i;
    ip = tmp[0];
    port = tmp[1];
    for (i = 0; i < CONNECTTION_PER_SERVER; i++) {
        create_memcache_connecton(idx,true);
    }
});


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
            conn_num++;
        }
    });

    socket.on("error", function(e) {
        log.error("memcache connection error: " + ip + ":" + port);
        log.error(e);
    });
    socket.on("close", function(had_error) {
        log.info("memcache conn has been closed");
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
}
function remove_from_pool(socket) {
    var i = conn_pool[socket.idx].indexOf(socket);
    if (i >= 0) {
        conn_pool[socket.idx].splice(i, 1);
        conn_num--;
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
    idx=idx<0?idx+servers.length:idx;
    var pool=conn_pool[idx];
    if(pool.length>0){
        var mc=pool.pop();
        conn_num--;
        mc.removeAllListeners("data");
        return mc;
    }else{
        //创建一个新连接，但不加到连接池，用完之后调用release_memcache_conn会归还给连接池的
        //log.info("ceate new memcache connection:"+idx);
        //return create_memcache_connecton(idx,false);
        return false;
    }
}


function release_memcache_conn(mc){
    log.debug("release memcache connection"+mc.idx);
    mc.removeAllListeners("data");
    conn_pool[mc.idx].push(mc);
    conn_num++;
    delay_process();
}




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
    
    if(cmd_pos==-1){
        return false;
    }
    var cmd=bm.slice(0,cmd_pos).toString();
    var tokens=cmd.split(" ");
    var request={};
    request.type=tokens[0].toLowerCase();
    if(["set","add","replace","get","delete","incr","decr"].indexOf(request.type)!=-1){
        request.key=tokens[1];
    }else{
        if(remain_data){
//            console.log(remain_data.toString());
        }else{
//            console.log(buf.toString());
        }
        //console.log(bm._buffers[0].toString());
        console.log(bm.toBuffer().toString());
        console.log("cmd:"+cmd);
        log.error("request parse error!");
        process.exit(255);
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
            //log.error("freedata parse error!");
            //process.exit(255);

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
    if(!buf&&!parsed_request){
        return false;
    }
    var bm=new BufferManager(socket.remain_data,buf);
    if(parsed_request){
        socket.remain_data=bm.slice(parsed_request.buffer.length);
    }else{
        socket.remain_data=bm.toBuffer();
    }
    if(typeof socket.remain_data!='undefined'){
        //console.log(socket.remain_data.toString('utf8',0,20));
    }
}

function clean_client_socket(source_socket){
    delete source_socket.queue;
}

//连接池里空了之后，请求会先加入到这个队列里
un_processed_queue=[];
function delay_process(){
    if(un_processed_queue.length==0||conn_num==0){
        return false;
    }
    var i,queue_item,process_ret;
    for(i=0;i<un_processed_queue.length;i++){
        queue_item=un_processed_queue[i];
        process_ret=process_request(queue_item.source_socket,queue_item.request,true);
        if(process_ret===false){
            //返回false表示仍然连接池仍然没有连接
            continue;
        }else{
            un_processed_queue.splice(i,1);
            //去掉队列其中一项之后，后面的下标也变化了，为了不跳过下一项，所以要i--；
            i--;
        }
        if(conn_num==0){
            return false;
        }
    }
}

function process_request(source_socket,request,is_delay){
    if (process_own_request(source_socket,request)) {
        //这是发给proxy自身的命令，不用转发给memcache
        return;
    }
    var mc=choose_memcache(request);
    if(!mc){
//        log.debug("memcache connections runs out");
        if(!is_delay){
            un_processed_queue.push({source_socket:source_socket,request:request});
            log.debug("un_processed_queuei length:"+un_processed_queue.length);
        }
        //log.error("error choose memcache connection:"+request.buffer.toString());
        return false;
    }
    if (mc.is_connected) {
        mc.write(request.buffer);
    } else {
        log.notice("not writable, wait for connected");
        mc.once("connect", function() {
            mc.write(request.buffer);
        });
    }
    mc.on("data", function(res_buf) {
//        log.debug("recieved memcache data from: " + servers[this.idx]+":"+res_buf.toString());
        log.debug("recieved memcache data from: " + servers[this.idx]);
        var response=mk_response(this.remain_data,res_buf,request.type);
        add_remain_data(this,res_buf,response);
        if(response){
//            log.debug("transfer memcache data to client:"+response.buffer.toString());
            log.debug("transfer memcache data to client:"+source_socket.remoteAddress);
            for(var i=0;i<source_socket.queue.length;i++){
                if(source_socket.queue[i].req===request){
                   source_socket.queue[i].res=response;
                   break;
                }
            }
            while(source_socket.queue.length>0){
                if(source_socket.queue[0].res){
                    try{
                        source_socket.write(source_socket.queue.shift().res.buffer);
                    }catch(e){
                        log.error("source_socket write error");
                        clean_client_socket(source_socket);
                        source_socket.destroy();
                        break;
                    }
                }else{
                    break;
                }
            }
            if(source_socket.queue&&source_socket.queue[0]){
                if(typeof source_socket.queue[0].req.key=='undefined'){
                    log.error("request has no key");
                    process.exit(255);
                }else{
                    //log.info(source_socket.queue[0].req.key);
                }
            } 
            this.removeListener("data",arguments.callee);
            release_memcache_conn(this);
        }
    });
}
function push_request_to_return_queue(source_socket,request){
    if(typeof source_socket.queue=='undefined'){
        source_socket.queue=[{req:request}];
    }else{
        source_socket.queue.push({req:request});
    }
}
server=net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
//        log.debug("recieved data from: " + this.remoteAddress+":"+buf.toString());
        log.debug("recieved data from: " + this.remoteAddress);
        do{
            var request=mk_request(this.remain_data,buf);
            add_remain_data(this,buf,request);
            buf=false;
            if(request){
                //memcache连接的数量有限时， 优先处理之前积压的请求
                delay_process();
                //把请求加到来源端口的队列，保证返回时的顺序
                push_request_to_return_queue(this,request);
                //如果还有memcache连接，则处理此请求，否则发到延迟队列
                process_request(this,request);
            }
        }while(request);
    });
    socket.on("end", function() {
        log.info("client end " + this.remoteAddress);
    });
    socket.on("error", function() {
        log.notice("client error");
    });
});
server.maxConnections=2000;
server.listen(11111);
