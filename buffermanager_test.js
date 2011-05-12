assert=require('assert');
assert.ok(true,"false!");
BufferManager=require("./buffermanager").BufferManager;

bm=new BufferManager(new Buffer('1234'),new Buffer('5678'));
assert.equal(bm.slice(1,3).toString(),'234');
assert.equal(bm.toBuffer().toString(),'12345678');
assert.equal(bm.slice(3,2).toString(),'45');


