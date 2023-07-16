#!/bin/sh

if [ "$#" -ne 3 ]; then
        echo "Usage: $0 <example-name> <assets-dir> <screen>"
        exit 1
fi

example=$1
assets=$2
screen=$3

# replace .example.js suffix with .gif
output="${example%.*}"
output="$assets/${output%.*}".gif

echo "Generating asset for example '$example' into '$output' using screen $screen"

mov="$example.mov"
rm -f "$mov"

# create test start signal file
signal="$example.signal"
rm -f "$signal"
touch "$signal"

# run example in xvfb in the background
EXAMPLE="$example" DISPLAY=":$screen" xvfb-run -n $screen -s ":$screen -ac -screen 0 800x600x24" node ./out/examples/runExample.js > "$signal" &

# wait for example to start
while ! grep -q "@" "$signal"; do sleep 0.1; done

# record example into .mov (mov is better than gif for recording)
ffmpeg -y -f x11grab -video_size 800x600 -i :$screen -c:v libx264 -pix_fmt yuv420p "$mov"

# wait for example to finish, recording will automatically finish (by crashing)
wait

# speedup and convert to gif
ffmpeg -i "$mov" -vf "setpts=0.5*PTS" "$output"

# cleanup
cat "$signal"
rm "$signal" "$mov"

