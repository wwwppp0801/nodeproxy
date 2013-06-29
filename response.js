Logger = require("./log");
log = new Logger(Logger.INFO);

exports.remote_response=remote_response=function (raw_header){
    var CRLF_index=raw_header.indexOf(CRLF);
    var http_header_length=raw_header.indexOf(CRLF+CRLF);
//HTTP/1.1 200 OK
    
    var tmp=raw_header.substr(0,CRLF_index).split(/\s+/);
    var code=tmp[1];
    var version=tmp[0]=='HTTP/1.0'?"1.0":"1.1";
    return {
        getResponseCode:function(){
            return code;
        },
        getHttpVersion:function(){
            return version;
        },
        getHeader:(function(){
            var headers;
            return function (name){
                if(!headers){
                    var header_rest=raw_header.substr(raw_header.indexOf(CRLF)+CRLF.length,http_header_length);
                    headers={};
                    header_rest.split(CRLF).forEach(function(line){
                        if(line){
                            var tmp=line.match(/([^:]*):(.*)/);
                        }
                        if(tmp){
                            headers[tmp[1].trim()]=tmp[2].trim();
                        }
                    });
                }
                if(name){
                    return headers[name];
                }else{
                    return headers;
                }
            };
        })(),
        isKeepAlive:function(){
            var Connection=this.getHeader("Connection");
            if(Connection=="keep-alive"){
                return true;
            }
            if(Connection=='close'){
                return false;
            }
            return this.getHttpVersion()=='1.1';
        },
        responseIsEnd:function(bm){
            if(this.getHeader("Transfer-Encoding")=='chunked'){
                //TODO
                return false;
            }
            log.info("content length:"+ this.getHeader("Content-Length")+"\t"+bm.size());
            var content_length=this.getHeader("Content-Length");
            if(typeof(content_length)!='undefined' && content_length<=bm.size()){
                return true;
            }
            return false;
        }
    };
}

