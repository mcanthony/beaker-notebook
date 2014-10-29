#!/bin/bash -e

beaker_url="/beaker"

for i in "$@"
do
case $i in
  -w|--watch) watch=1 ;;
  -t|--test) test=1 ;;
  --beaker_url=*) beaker_url="${i#--beaker_url=}" ;;
  -h|--help)
    cat <<EOF

  Usage: web [options]
  Options:
          -h  --help          Display this message
          -w  --watch         Restart server if files change
          -t  --test          Run test server
          --beaker_url=(url)  Set beaker URL

EOF
    exit
    ;;
esac
done

if [[ $watch -eq 1 ]]; then
  PORT=8080 exec roots watch
elif [[ $test -eq 1 ]]; then
  PORT=8080 NODE_ENV=test exec roots watch
else
  exec /usr/sbin/nginx
fi