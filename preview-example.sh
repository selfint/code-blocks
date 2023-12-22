#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <example>"
        exit 1
fi

examples="./out/examples"
example=$1

rm -rf $examples
# https://github.com/microsoft/vscode-test/issues/232
rm -rf .vscode-test/user-data
yarn run compile
EXAMPLE=$example yarn run example