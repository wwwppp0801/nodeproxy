#用node.js开发memcache协议的反向代理服务器

memcache是常用的key-value缓存解决方案，它的协议也被用于nosql数据库tokyo tyrant。

在实际项目中，出于负载均衡等考虑，php、java等客户端需要访问多个memcache，将一个对特定key的请求map到特定的memcache上。但这样就需要在每个客户端配置多个ip地址并实现map的算法，不便于管理和维护。最近正好在学习node.js，于是决定用node.js搭一个node.js的反向代理。对php、java等客户端，实现与memcache相同的协议。将客户端的请求，根据请求的key值分别转发到后端的数个memcache上。

node基于v8和libevent开发，主要思想是用单线程+事件循环(event loop)，来实现异步io服务器。这种模式类似于nginx，比起传统的多进程（例如apache的prefork模式）或者线程（例如tomcat等app server），速度更快。

纯异步io的服务器实现有很多复杂的因素要考虑，有了错误也难以调试。使用node可以让你从繁琐的内存处理等底层工作中解放出来，把精力都花在关注你的核心的模型和应用逻辑。

用node实现一个socket server是非常容易的，如下代码即可实现简单的echo server：

```javascript
server=net.createServer(
    function(socket) {
        socket.on('data',function(data){
            //这个this就是socket
            this.write(data);
        });
    }
).listen(port_number);
```

由于我要根据请求的key值接收和分发memcache请求，需要对收到的data做解析请求的操作。接着根据请求的key决定采用哪一个memcache，然后将请求写入memcache连接。当memcache连接收到数据时，将数据写回客户端socket，代理的基本流程就结束了。
```javascript
socket.on('data',function(data){
            var request=mk_request(data);
            var mc=create_memcache_conn(request.key);
            mc.write(request);
            mc.on('data',function(data){
                    socket.write(data);
                });
        });
```


值得注意的是，由于node异步的特性，收到的data可能比一个请求数据少，或者比一个请求数据多，或者包含好几个请求，都是有可能的，剩下的数据需要加入到下次收到的data之前，才能保证接收请求没有问题。于是程序修改为如下结构：

```javascript
function process_request(socket,request){
    var mc=create_memcache_conn(request.key);
    mc.write(request);
    mc.on('data',function(data){
            socket.write(data);
        });

}

socket.on('data',function(data){
        do{
            //将之前剩下的数据与新收到的数据合并
            data=new Buffer(this.remain_data,data);
            //如果mk_request没解析出一个完整的请求，就返回false
            var request=mk_request(data);
            this.remain_data=data.slice(request===false?0:request.length);
            process_request(this,request);
        }while(request);

        });
```


但改成这样之后，测试结果还是有问题。这是因为客户端有可能一次发多个请求到服务器端，服务器端使用多个memcache连接处理这些请求，在memcache连接的ondata中写回客户端的时候，无法保证写回的顺序与请求的顺序一致，导致出错。所以需要有一个队列来保证写回数据的顺序。

```javascript
function process_request(socket,request){
    var mc=create_memcache_conn(request.key);
    mc.write(request);
    mc.queue.push({req:request,res:false});
    mc.on('data',function(data){
            //收memcache响应也有和收客户端请求一样的问题，可能一次收到一半的请求
            data=new Buffer(this.remain_data,data);
            //如果mk_response没解析出一个完整的响应，就返回false
            var response=mk_response(data);
            if(response){
                //接收完一个响应，先将响应加入队列
                for(var i=0;i<socket.queue.length;i++){
                    if(socket.queue[i].req===request){
                       socket.queue[i].res=response;
                       break;
                    }
                }
                //查看响应队列，将队列之前已经收到的响应都写回去。
                while(socket.queue.length>0){
                    if(socket.queue[0].res){
                        socket.write(socket.queue.shift().res.buffer);
                    }else{
                        break;
                    }
                }
                this.removeListener('data',arguments.callee);
            }
        });
}
```

另外需要实现mk_request和mk_response这两个函数，实现是基于memcache的协议，我的实现参考了文章：http://www.ccvita.com/306.html，memcache的协议还是比较简单的。


在最终实现中，我还加入了memcache连接池的功能，因为建立memcache连接需要花费的时间是很长的，memcache的文档中也建议与服务器保持长连接，以加快效率。

加入连接池后做了简单的压力测试，在普通笔记本机上，几十个进程并发，每秒几千次没问题的，调整一下应该能上w

完整的代码请看我的github源：https://github.com/wwwppp0801/nodeproxy，欢迎各种fork，各种讨论。

参考文档：
memcache协议中文版：http://www.ccvita.com/306
node.js文档：http://nodejs.org/docs/v0.4.7/api

