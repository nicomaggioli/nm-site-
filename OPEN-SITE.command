#!/bin/sh
# Double-click THIS file to view the offline Podium site.
# (Do not double-click index.html — this app can't run from a file:// page.)
cd "$(dirname "$0")"
python3 serve.py
