#!/bin/sh -xv

PS4='${LINENO}: '

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <examples-dir>"
    exit 1
fi

examples=$1

echo "## Gallery"
echo

for example in $(ls $examples)
do
    # remove suffix
    name="${example%.*}"

    # replace _ with space
    name="${name//_/ }"

    echo "### $name"
    echo
    echo "![$name]($examples/$example)"
    echo

done
