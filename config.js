var config={
    'hosts':[
//        ['www.baidu.com','127.0.0.1'],
    ],
    'auto_responder':[
        ['http://www.baidu.com/','test.html'],
        [/^http:\/\/www\.baidu\.com\/s/,'testresult.html'],
    ],
};
for(var c in config){
    exports[c]=config[c];
}
