#!/bin/sh
cd "$(dirname "$0")"
(sleep 2; open http://localhost:8069 2>/dev/null || xdg-open http://localhost:8069) &
exec python3 server.py --demo
