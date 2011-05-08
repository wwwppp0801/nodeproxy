
MemcacheClient=require("./memcache").Client;
for(j=0;j<10;j++){
    mc=new MemcacheClient(11111);
    //mc=new MemcacheClient(11220);

    mc.on("connect",function(){
        for(var i=0;i<100;i++){
            (function(i){ 
                mc.set("key"+i,"value"+i,function(){
                    mc.get("key"+i,function(data){
                        console.log(data);
                    });
                });
            })(i);
        }
    });
    mc.connect();
}

