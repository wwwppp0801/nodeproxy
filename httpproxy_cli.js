Logger = require("./log");
log = new Logger(Logger.INFO);
optparser = require("./optparser");
net = require("net");
util=require("util");
BufferManager=require('./buffermanager').BufferManager;

SERVER_CMD_START=[0x00,0x01];
SERVER_CMD_END=[0xfe,0xff];

var readline = require('readline'),
    rl = readline.createInterface(process.stdin, process.stdout),
    prefix = 'httpproxy> ';
rl.setPrompt(prefix, prefix.length);

socket=net.createConnection(8080,'127.0.0.1');
socket.on("connect",function(){
    rl.prompt();
});
socket.on("close",function(){
    rl.close();
    process.stdin.destroy();
    console.log("connection closed");
    process.exit(255);
});

COMMAND_TABLE={
    list:function(){
            command_end();
        },
    info:function(){
            command_end();
        },
    loadconf:function(){
            command_end();
        },
    dnsshow:function(tokens){
            socket.on("data",function(buf){
                res=parse_response(buf)
                if(typeof res=='undefined'){
                    return;
                }
                console.log(util.inspect(res));
                command_end();
            });
            tokens.unshift('dnsshow');
            sendRequest(socket,tokens.join(" "));
        },
    dnsclean:function(){         
            command_end();
        },
    help:function(){
            command_end();
        },
    quit:function(){
            rl.close();
            process.stdin.destroy(); 
        }
}
/**
 * windows env don't have this function
process.on('SIGINT', function () {
    command_end();
    console.log('Got SIGINT.  Press Control-D to exit.');
}); 
*/
rl.on('line', function(line) {
    var tokens=line.trim().split(/\s+/);
    var cmd=tokens[0].toLowerCase();
    if(typeof COMMAND_TABLE[cmd]=='function' && COMMAND_TABLE.hasOwnProperty(cmd)){
        COMMAND_TABLE[cmd](tokens.slice(1));
    }else{
        if(cmd.length>0){
            console.log(cmd+': command not found');
        }
        command_end();
    }
})
.on('close', function() {
    console.log();
    console.log('Have a great day!');
    process.exit(0);
});

function load_hosts(){

}
function command_end(){
    rl.prompt();
}

parse_response=(function(){
    var bm=new BufferManager();
    return function(buf){
        bm.add(buf);
        var start=bm.indexOf(SERVER_CMD_START);
        var end=bm.indexOf(SERVER_CMD_END);
        if(start==0 && end>0){
            var result=bm.slice(SERVER_CMD_START.length,end-SERVER_CMD_END.length).toString();
            result=JSON.parse(result);
            var rest=bm.slice(end+SERVER_CMD_END.length);
            bm.clear();
            bm.add(rest);
            return result;
        }else{
            return;
        }
    }
})();

function sendRequest(socket,cmd){
    var bm=new BufferManager();
    bm.add(SERVER_CMD_START);
    bm.add(cmd);
    bm.add(SERVER_CMD_END);
    socket.write(bm.toBuffer());
}
