#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <example-name>"
        exit 1
fi

example=$1

echo "Generating asset for example: $example"

rawmov="raw.mov"

# record xvfb output
xvfb-run -s ":99 -ac -screen 0 800x600x24" node ./out/examples/runExample.js $example &
ffmpeg -y -f x11grab -video_size 800x600 -i :99 -c:v libx264 -pix_fmt yuv420p $rawmov

wait

# crop video start until vscode opens
ffmpeg -i $rawmov -vf "select='gt(scene,0.0001)'" $example.gif