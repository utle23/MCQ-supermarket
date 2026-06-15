#!/bin/bash
cd "$(dirname "$0")"
PORT=8765
echo "Starting MCQ Ops Hub on http://localhost:$PORT ..."
python3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
sleep 1
open "http://localhost:$PORT/index.html"
echo "MCQ Ops Hub is running. Close this window (or press Ctrl+C) to stop."
trap "kill $SRV 2>/dev/null" EXIT
wait $SRV
