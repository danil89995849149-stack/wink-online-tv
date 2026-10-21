@echo off
chcp 65001 >nul
title Wink TV Replay Server
echo ========================================================
echo    Wink TV Replay — Сервер онлайн-телевидения
echo ========================================================
echo Запуск сервера на порту 8900...
echo Сайт откроется в браузере автоматически: http://localhost:8900
echo Для остановки нажмите Ctrl+C
echo ========================================================
start "" "http://localhost:8900"
node server/server.js
pause
