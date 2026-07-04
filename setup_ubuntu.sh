#!/bin/bash

echo "========================================================="
echo "   Auto-Installer: IrfnCode Streaming Worker (Ubuntu)    "
echo "========================================================="

echo "[1/3] Mengupdate system dan menginstal XVFB (Virtual Monitor)..."
sudo apt-get update
sudo apt-get install -y xvfb

echo "[2/3] Menginstal dependencies khusus Chrome/Puppeteer..."
sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils

echo "[3/3] Menginstal dependencies NPM..."
npm install

echo "========================================================="
echo " ✅ Instalasi Selesai!                                     "
echo " Silakan jalankan: bash start_ubuntu.sh                  "
echo "========================================================="
