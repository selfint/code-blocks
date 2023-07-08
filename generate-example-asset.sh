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
croppedmov="cropped.mov"

# run example in xvfb
EXAMPLE=$example xvfb-run -s ":99 -ac -screen 0 800x600x24" node ./out/examples/runExample.js &

# record example into .mov (mov is better than gif for recording)
ffmpeg -y -f x11grab -video_size 800x600 -i :99 -c:v libx264 -pix_fmt yuv420p $rawmov

wait

# find timestamp of when vscode opens
ffmpeg -i raw.mov -vf "select='gt(scene,0.001)',metadata=print:file=log.txt" -an -f null -
start=$(cat log.txt | head -n 1 | awk -F'pts_time:' '{ print $2 + 1 }')

# remove last second from recording
newduration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $rawmov | awk '{print $1 - ' $start ' - 1}')

echo duration $(ffprobe -v error -show_entries format=duration -of csv=p=0 $rawmov)
echo new duration $newduration

# remove time before test starts and before window closes
ffmpeg -y -i $rawmov -ss $start -to $newduration $croppedmov

# speedup x2 and convert to gif
ffmpeg -i $croppedmov -vf "setpts=0.5*PTS" $output

