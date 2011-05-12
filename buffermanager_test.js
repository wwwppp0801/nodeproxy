assert=require('assert');
assert.ok(true,"false!");
BufferManager=require("./buffermanager").BufferManager;

bm=new BufferManager(false,new Buffer('1234'),false,new Buffer('5678'),new Buffer("789"));
assert.equal(bm.slice(1,3).toString(),'234');
assert.equal(bm.toBuffer().toString(),'12345678789');
assert.equal(bm.slice(3,2).toString(),'45');
assert.equal(bm.slice(3,6).toString(),'456787');

//assert.equal(bm.indexOf('56'),4);
//console.log('12345678789');
//console.log('45678');
assert.equal(bm.indexOf('45678'),3);
assert.equal(bm.indexOf('789'),8);
assert.equal(bm.indexOf('7891'),-1);
assert.equal(bm.indexOf('a'),-1);
assert.equal(bm.indexOf('1'),0);
assert.equal(bm.indexOf('12345678789'),0);
assert.equal(bm.indexOf('2345678789'),1);
assert.equal(bm.indexOf('78'),6);
assert.equal(bm.indexOf('7'),6);
assert.equal(bm.indexOf('567'),4);
assert.equal(bm.indexOf('5678'),4);
assert.equal(bm.indexOf('45'),3);
assert.equal(bm.indexOf('67'),5);
