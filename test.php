<?php

$mc=memcache_connect("127.0.0.1",11111);
for($i=0;$i<100;$i++){
    memcache_set($mc,"key$i","value$i");
    echo memcache_get($mc,"key$i")."\n";
}
