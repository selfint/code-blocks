#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <example>"
        exit 1
fi

examples="./out/examples"
example=$1

rm -rf $examples
yarn run compile
EXAMPLE_TIMEOUT=5m node $examples/runExample.js $example