# node-fiddler

- 这是node写的http代理
- 基于socket，纯手工编写，支持keep-alive, chunked等功能
- 可以实现fiddler的auto\_responder功能(就是将某个请求用本地文件返回)
- 可以实现类似改hosts文件的功能

# config.js介绍

```javascript
var config={
    //监听的host和端口
    'listen_host':'127.0.0.1',
    'listen_port':'8083',
    'max_connections':1000,
    //相当于配置/etc/hosts
    'hosts':[
        ['www.baidu.com','127.0.0.1'],
    ],
    //使用本地文件替换线上文件，扩展名必须正确，content-type是用扩展名算出来的
    'auto_responder':[
        ['http://www.baidu.com/','test.html'],
        [/^http:\/\/www\.baidu\.com\/s/,'testresult.html'],
    ],
};
for(var c in config){
    exports[c]=config[c];
}
```


# 尚未解决的已知问题

- 没有实现multipart/form-data，上传文件可能会有问题
- 没有实现https协议的代理
