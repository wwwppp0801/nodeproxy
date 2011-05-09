
MemcacheClient=require("./memcache").Client;
mc=new MemcacheClient(11111);
//mc=new MemcacheClient(11220);

mc.on("connect",function(){
    for(var i=0;i<10;i++){
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

