
MemcacheClient=require("./memcache").Client;
mc=new MemcacheClient(11111);
//mc=new MemcacheClient(11220);
var num=10000,j=0;

mc.on("connect",function(){
    for(var i=0;i<num;i++){
        (function(i){ 
            mc.set("key"+i,"value"+i,function(){
                mc.get("key"+i,function(data){
                    if(data!="value"+i){
                        console.log('"'+data+'" recieved while "'+"value"+i+'" is expected');
                    }else{
                        j++;
                    }
                    if(j==num){
                        mc.close();
                        console.log("successful!!");
                    }
                });
            });
        })(i);
    }
});
mc.connect();

