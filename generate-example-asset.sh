#!/bin/sh

if [ "$#" -ne 1 ]; then
        echo "Usage: $0 <example-name>"
        exit 1
fi

example=$1

# replace .example.js suffix with .gif
output="${example%.*}"
output="${output%.*}".gif

echo "Generating asset for example '$example' into '$output'"

rawmov="raw.mov"

# create test start signal file
rm -f signal
touch signal

# run example in xvfb in the background
EXAMPLE=$example xvfb-run -s ":99 -ac -screen 0 800x600x24" node ./out/examples/runExample.js > signal &

# wait for example to start
while ! grep -q "@" signal; do sleep 0.1; done

# record example into .mov (mov is better than gif for recording)
ffmpeg -y -f x11grab -video_size 800x600 -i :99 -c:v libx264 -pix_fmt yuv420p "$rawmov"

wait

# speedup x2 and convert to gif
ffmpeg -i "$rawmov" -vf "setpts=0.5*PTS" "$output"

