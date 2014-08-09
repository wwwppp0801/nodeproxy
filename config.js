var config={
    'hosts':[
        ['aimei1.wangp.org','127.0.0.1'],
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
