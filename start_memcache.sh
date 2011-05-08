#!/bin/sh
for i in $(seq 0 4);do
    memcached -d -p 1122$i -m 10
done
