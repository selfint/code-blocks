#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <examples-dir>"
        exit 1
fi

examples="$1/suite"

echo "Generating assets for examples:"
ls $examples | grep ".*\.example\.js$"
echo

for example in $(ls $examples | grep ".*\.example\.js$")
do

    if [ "$example" != "example.example.js" ] ; then
        ./generate-example-asset.sh $example
    fi
done
