#!/bin/bash
while true; do
  curl -s -o /dev/null localhost/ &
  curl -s -o /dev/null localhost/api/order &
  curl -s -o /dev/null localhost/api/order &
  wait
  sleep 0.5
done
