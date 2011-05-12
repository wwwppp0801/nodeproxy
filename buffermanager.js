/*
Buffer.prototype.indexOf=function(str,startIdx){
    var len=str.length,
        buf_len=this.length,
        i,j,ii;
    startIdx=(startIdx>0)?startIdx:0;
    if(len>0){
        for(i=startIdx;i<buf_len;i++){
            ii=i;
            j=0;
            while(ii<buf_len&&j<len){
                if(this[ii++]!=str.charCodeAt(j++)){
                    break;
                }
                if(j==len){
                    return i;
                }
            }
        }
    }
    return -1;
}
*/
exports.BufferManager=BufferManager=function(){
    //加入几个buffer对象，可以做slice
    this._buffers=Array.prototype.slice.apply(arguments).filter(function(a){
        return Buffer.isBuffer(a);
    });
}
BufferManager.prototype.add=function(buf){
    if(Buffer.isBuffer(buf)){
        this._buffers.push(buf);
    }else{
        log.info("not a Buffer instance");
    }
}
BufferManager.prototype.toBuffer=function(){
    return this.slice(0);
}
BufferManager.prototype.size=function(){
    return this._buffers.reduce(function (prev,curr){
        return prev+curr.length;
    },0);
}

BufferManager.prototype.indexOf=function(str){
    //return this.toBuffer().indexOf(str);
    var all_len=this.size(),buf_num=this._buffers.length,str_len=str.length;
    var idx,buf_offset=0,offset=0,buf=this._buffers[buf_offset],str_offset=0;
    for (idx=0;idx<all_len;idx++){
        if(str.charCodeAt(str_offset)==buf[offset]){
            str_offset++;
        }else{
            idx-=str_offset;
            offset-=str_offset;
            str_offset=0;
        }

        if(str_offset==str_len){
            return idx-str_offset+1;
        }
        
        offset++;
        while(buf&&offset>=buf.length){
            offset-=buf.length;
            buf=this._buffers[++buf_offset];
        }
        while(offset<0){
            buf=this._buffers[--buf_offset];
            offset+=buf.length;
        }
    }

    return -1;
}
BufferManager.prototype.slice=function(start,length){
    var all_len=this.size();
    length=(typeof length=="undefined"?all_len-start:length);
    var buf_len=Math.min(all_len,length);
    if(buf_len<=0){
        return false;
    }
    var buf=new Buffer(buf_len),offset=0,i;
    for(i=0;i<this._buffers.length;i++){
        pbuf=this._buffers[i];
        if(pbuf.length>start){
            var copy_len=pbuf.copy(buf,offset,start,Math.min(start+length,pbuf.length));
            offset+=copy_len;
            length-=copy_len;
            start=0;
        }else{
            start-=pbuf.length;
        }
        if(length<=0){
            break;
        }
    }
    return buf;
}

