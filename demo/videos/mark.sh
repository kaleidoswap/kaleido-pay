#!/bin/bash
# mark.sh start <name> | mark.sh <label>  — logs seconds since the recording started
D=$(dirname "$0")
if [ "$1" = start ]; then python3 -c "import time;print(time.time())" > "$D/$2.t0"; : > "$D/$2.marks"; echo "$2" > "$D/current"; exit; fi
N=$(cat "$D/current"); python3 -c "import time,sys;print(f'{time.time()-float(open(sys.argv[1]).read()):.2f} '+sys.argv[2])" "$D/$N.t0" "$*" >> "$D/$N.marks"; tail -1 "$D/$N.marks"
