<?php

$mc=memcache_connect("127.0.0.1",11111);
for($i=0;$i<100;$i++){
    memcache_set($mc,"key$i","value$i");
    $value= memcache_get($mc,"key$i");
    if($value!="value$i"){
        echo "'$value' recieved while 'value$i' expecte\n";
        exit(255);
    }
}
echo "successful\n";
