#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <examples-dir>"
        exit 1
fi

examples="$1/suite"

echo "Generating assets for examples:"
ls $examples
echo

for example in $(ls $examples | grep -v .*.map)
do

    if [ "$example" != "index.js" ] ; then
        ./generate-example-asset.sh $example
    fi
done
