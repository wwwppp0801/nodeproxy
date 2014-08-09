
Logger = require("./log");
log = new Logger(Logger.INFO);
assert=require('assert');
assert.ok(true,"false!");
BufferManager=require("./buffermanager").BufferManager;

bm=new BufferManager(false,new Buffer('1234'),false,new Buffer('5678'),new Buffer("789"));
assert.equal(bm.slice(1,3).toString(),'234');
assert.equal(bm.toBuffer().toString(),'12345678789');
assert.equal(bm.slice(3,2).toString(),'45');
assert.equal(bm.slice(3,6).toString(),'456787');
assert.equal(bm.slice(10,20).toString(),'9');
assert.equal(bm.slice(11,20).toString(),'');
//assert.equal(bm.slice(12,20).toString(),'');

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

assert.equal(bm.indexOf('12345'),0);
assert.equal(bm.indexOf('12345',1),-1);


assert.deepEqual(new Buffer('aa'),new Buffer('aa'));


bm=new BufferManager(new Buffer('ab中国123'));
assert.equal(bm.indexOf('国'),5);
assert.equal(bm.indexOf('国',5),5);
assert.equal(bm.indexOf('国',6),-1);
assert.equal(bm.indexOf('中'),2);
assert.equal(bm.indexOf('1'),8);
log.info('all test ok');
