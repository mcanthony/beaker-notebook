#!/bin/bash -e

for i in "$@"
do
case $i in
  -w|--watch) watch=1 ;;
  -t|--test) test=1 ;;
  -c|--coverage) coverage=1 ;;
  -h|--help)
    cat <<EOF

  Usage: web [options]
  Options:
          -h  --help          Display this message
          -w  --watch         Restart server if files change
          -t  --test          Run test server

EOF
    exit
    ;;
esac
done

if [[ $watch -eq 1 ]]; then
  PORT=7777 exec roots watch
elif [[ $test -eq 1 ]]; then
  PORT=7777 NODE_ENV=test exec roots watch
elif [[ $coverage -eq 1 ]]; then
  roots compile --no-compress
  echo "Running server in coverage mode..."
  PORT=7777 NODE_ENV=test exec node coverage-server
else
  exec /usr/sbin/nginx
fi