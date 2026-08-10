@echo off
chcp 65001 >nul
title 六爻工作台 Web版
echo.
echo   六爻工作台 Web 版启动中...
echo.
cd /d "%~dp0"
netstat -ano | findstr ":8742" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo   [提示] Web 服务已在运行，直接打开页面...
  start "" "http://localhost:8742/"
  goto :end
)
node serve-web.mjs
:end
pause
