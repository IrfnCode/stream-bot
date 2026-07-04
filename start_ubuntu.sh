#!/bin/bash

# Memastikan environment variables dibaca dengan benar jika ada
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

echo "========================================================="
echo "   Menjalankan Stream Worker di Ubuntu (XVFB Mode)       "
echo "========================================================="

# xvfb-run menciptakan layar virtual (screen 0, ukuran 1920x1080) agar Puppeteer bisa jalan tanpa error
xvfb-run -a -s "-screen 0 1920x1080x24" node server.js
