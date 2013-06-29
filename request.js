
exports.local_request=local_request=function (raw_header){
    var CRLF_index=raw_header.indexOf(CRLF);
    var http_header_length=raw_header.indexOf(CRLF+CRLF);

    return {
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
