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

function filter_own_msg(buf, socket) {
    //TODO 如果是不用转发给memcache的命令，在此处理，并返回true，否则返回false;
    return false;
}

function choose_memcache(buf) {
    //根据cmd的内容，选择要转发的memcache连接，如果连接池里没有连接了，就新建一个连接
    var pos, cmd, tokens;
    pos = buf.indexOf(CRLF);
    cmd = buf.toString('utf8',0, pos);
    log.debug(buf.toString());
    log.debug("parseed cmd is :"+cmd);
    tokens = cmd.split(" ");

    if (['set', 'add', 'replace', 'get', 'delete', 'incr', 'decr'].indexOf(tokens[0].toLowerCase()) < 0) {
        return false;
    }
    var hash=hashCode(tokens[1]);
    var idx=hash % servers.length;
    var pool=conn_pool[idx];
    if(pool.length>0){
        var mc=pool.pop();
        log.info("get memcache connection:"+idx+" - "+pool.length);
        mc.removeAllListeners("data");
        return mc;
    }else{
        //创建一个新连接，但不加到连接池，用完之后clean_client_socket会归还给连接池的
        log.info("ceate new memcache connection:"+idx);
        return create_memcache_connecton(idx,false);
    }
}

function clean_client_socket(socket) {
    //清理掉socket.mc，将mc连接退给连接池，去掉上面的"data"事件处理函数
    if (socket.mc) {
        var mc = socket.mc;
        //TODO
        mc.removeAllListeners("data");
        mc.on("data", function(res_buf) {
            log.error("ignore memcache data from: " + this.remoteAddress);
        });
        conn_pool[mc.idx].push(mc);
        delete socket.mc;
    }
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

net.createServer(
function(socket) {
    socket.on("connect", function() {
        log.debug("client in " + this.remoteAddress);
    });
    socket.on("data", function(buf) {
        log.debug("recieved data from: " + this.remoteAddress);
        if (!this.mc) {
            if (filter_own_msg(buf, this)) {
                //这是发给proxy自身的命令，不用转发给memcache
                return;
            }
            this.mc = choose_memcache(buf);
            if (this.mc) {
                this.mc.on("data", function(res_buf) {
                    log.debug("recieved memcache data from: " + this.remoteAddress);
                    socket.write(res_buf);
                });
            } else {
                log.error("error request");
                this.write("ERROR\r\n");
                return;
            }
        }
        if (this.mc.is_connected) {
            this.mc.write(buf);
        } else {
            log.notice("not writable, wait for connected");
            this.mc.once("connect", function() {
                this.write(buf);
            });
        }
    });
    socket.on("end", function() {
        log.info("client end " + this.remoteAddress);
        clean_client_socket(this);
    });
    socket.on("error", function() {
        log.info("client error");
        clean_client_socket(this);
    });
}).listen(11111);

