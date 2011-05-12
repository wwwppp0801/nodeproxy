
Buffer.prototype.indexOf=function(str){
    var len=str.length,
        buf_len=this.length,
        i,j,ii;
    if(len>0){
        for(i=0;i<buf_len;i++){
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
    var idx=-1,len=0,i,sidx,buf;
    for(i=0;i<this._buffers.length;i++){
        buf=this._buffers[i];
        sidx=buf.indexOf(str);
        if(sidx!=-1){
            idx=len+sidx;
            break;
        }else{
            len+=buf.length;
        }
    }
    return idx;
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

