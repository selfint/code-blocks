#!/bin/sh

if [ "$#" -ne 2 ]; then
        echo "Usage: $0 <examples-dir> <assets-dir>"
        exit 1
fi

examples="$1/suite"
assets="$2"

echo "Building docker image"
docker build -t base .

echo "Generating assets for examples:"
ls $examples | grep ".*\.example\.js$" | grep -v "^example.example.js$"
echo

screen=1000

for example in $(ls $examples | sort | grep ".*\.example\.js$" | grep -v "^example.example.js$")
do
    echo "Generating asset for example: '$example' using screen: '$screen'"
    docker run --rm -v $(pwd):/code-blocks -w /code-blocks base /bin/bash -c "./generate-example-asset.sh \"$example\" \"$assets\" $screen 2>&1 > \"$example.log\" " &
    screen=$((screen+1))
done

wait
