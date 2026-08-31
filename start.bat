@echo off
title ShonenSweat Server
echo.
echo  ⚡ Starting ShonenSweat Workout System...
echo  ----------------------------------------
echo  Open your browser at: http://localhost:3000
echo  Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0"
node --env-file=.env server.js

pause
