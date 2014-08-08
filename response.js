exports.remote_response=remote_response=function (bm){

    var CRLF_index=bm.indexOf(CRLF);
    var http_header_length=bm.indexOf(CRLF+CRLF);
    if(CRLF_index==-1||http_header_length==-1){
        log.debug("not enough response content");
        return null;
    }
    http_header_length+=CRLF.length*2;
    var raw_header=bm.slice(0,http_header_length).toString();
    bm.delete(http_header_length);


//HTTP/1.1 200 OK
    
    var tmp=raw_header.substr(0,CRLF_index).split(/\s+/);
    var code=parseInt(tmp[1],10);
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
            return false;
            if(Connection=='close'){
                return false;
            }
            return this.getHttpVersion()=='1.1';
        },
        responseIsEnd:function(bm){
            ///chunked
            var end,start=0,hexLen,len;
            if(this.getHeader("Transfer-Encoding")=='chunked'){
                while(true){
                    end=bm.indexOf(CRLF,start);
                    hexLen=bm.slice(start,end-start);
                    len=parseInt(hexLen,"16");
                    log.debug("chunk len "+hexLen+" : "+len);
                    start+=hexLen.length+len+CRLF.length*2;
                    if(!len){
                        break;
                    }
                    if(bm.size()<start){
                        return false;
                    }
                    log.debug("chunk recieved "+start+" : "+len+" : "+bm.size());
                }
                if(len==0&&bm.indexOf(CRLF,start)){
                    log.debug("chunk over");
                    bm.clear();
                    return true;
                }
                return false;
            }
            ///content length
            var content_length=this.getHeader("Content-Length");
            if(typeof(content_length)!='undefined'){
                log.debug("content length:"+ content_length+"\t"+bm.size());
                if(content_length<=bm.size()){
                    bm.clear();
                    return true;
                }
            }
            return false;
        }
    };
}

