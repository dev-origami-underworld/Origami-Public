#!/bin/bash
# Local Server Bootstrapper for Origami Engine

echo "=================================================="
echo "    BOOTING ORIGAMI ENGINE (LOCAL WEBSERVER)      "
echo "=================================================="
echo "Starting Origami dev server (CORS + COOP/COEP headers)..."

# server.py sends the headers required for SharedArrayBuffer (meshopt GLB),
# CORS, and correct MIME types. The stock python3 -m http.server does not.
python3 server.py 8000 &
SERVER_PID=$!

sleep 1

echo "Webserver is running! Opening Chrome..."
# Open the master launcher using http:// (not file:///)
open "http://localhost:8000/NewOrigami.9.html"

echo "Engine running on PID: $SERVER_PID"
echo "Close this terminal or press CTRL+C to terminate the server."
wait $SERVER_PID
