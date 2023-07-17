#!/bin/sh

if [ "$#" -ne 2 ]; then
        echo "Usage: $0 <examples-dir> <assets-dir>"
        exit 1
fi

examples="$1/suite"
assets="$2"

echo "Generating assets for examples:"
ls $examples | grep ".*\.example\.js$"
echo

for example in $(ls $examples | sort | grep ".*\.example\.js$")
do

    if [ "$example" != "example.example.js" ] ; then
        ./generate-example-asset.sh "$example" "$assets"
    fi
done
