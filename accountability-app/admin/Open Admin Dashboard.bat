@echo off
title AccountAbility Admin
rem Opens the AccountAbility admin dashboard.
rem Starts the tiny local server first (if it is not already running).

set "ADMIN_DIR=C:\Users\KinGrand\New folder\accountability-app\admin"
set "PY=C:\Users\KinGrand\AppData\Local\Programs\Python\Python312\python.exe"

netstat -ano | findstr ":8124" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  start "AccountAbility Admin server" /min "%PY%" -m http.server 8124 --directory "%ADMIN_DIR%"
  timeout /t 1 /nobreak >nul
)

start "" "http://localhost:8124/index.html"
