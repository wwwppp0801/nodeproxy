
exports.local_request=local_request=function (bm){
    var headers;
    var CRLF_index=bm.indexOf(CRLF);
    var http_header_length=bm.indexOf(CRLF+CRLF);
    if(CRLF_index==-1||http_header_length==-1){
        log.debug("not enough request content");
        return null;
    }
    http_header_length+=CRLF.length*2;
    var raw_header=bm.slice(0,http_header_length).toString();
    var content_length=parseInt(getHeader("Content-Length"));

    log.debug("content_length:"+content_length);
    log.debug("http_header_length:"+http_header_length);
    log.debug("bm size:"+bm.size());
    var body="";
    if(typeof(getHeader("Content-Length"))!="undefined"){
        if(content_length+http_header_length<=bm.size()){
            var body=bm.slice(http_header_length,content_length);
            bm.delete(http_header_length+content_length);
        }else{
            return null;
        }
    }else{
        bm.delete(http_header_length);
    }
    
    
    function getHeader(name){
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
    }
    return {
        getBody:function(){
            return body;
        },
        getQueryString:(function(){
            var queryStr;
            return function(){
                var tmp;
                if(!queryStr){
                    queryStr=raw_header.substr(0,CRLF_index).split(/\s+/)[1];
                }
                if(tmp=queryStr.match(/^https?:\/\/[^/]*(.*)/)){
                    queryStr=tmp[1];
                }
                if(!queryStr){
                    queryStr="/";
                }
                return queryStr;
            }
        })(),
        getHttpVersion:(function(){
            var version;
            return function(){
                if(!version){
                    version=raw_header.substr(0,CRLF_index).split(/\s+/)[2]=='HTTP/1.0'?"1.0":"1.1";
                }
                return version;
            };
        })(),
        getMethod:(function(){
            var method;
            return function(){
                if(!method){
                    method=raw_header.substr(0,CRLF_index).split(/\s+/)[0];
                }
                return method;
            };
        })(),
        getHeader:getHeader,
        getSendHeader:function(){
            var tmp=[];
            var headers=this.getHeader();
            for(h in headers){
                tmp.push(h+":"+headers[h]);
            }
            return this.getMethod()+" "+this.getQueryString()+" HTTP/"+this.getHttpVersion()+CRLF+
                tmp.join(CRLF)+CRLF+CRLF;
        },
        getUrl:function(){
            var queryStr=this.getQueryString();
            if(queryStr[0]=='/' && this.getHeader("Host")){
                queryStr="http://"+this.getHeader("Host")+queryStr;
            }
            log.debug(queryStr);
            if(!queryStr){
                log.error(raw_header);
            }
            return URL.parse(queryStr);       
        }
    };
}
