#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <examples-dir>"
        exit 1
fi

examples=$1

echo "Generating assets for examples:"
ls $examples
echo

for example in $(ls $examples)
do

    if [ "$example" != "template" ]; then
        echo "Generating asset for example: $example"
        ./generate-example-asset.sh $example
    fi
done
