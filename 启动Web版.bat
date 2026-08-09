@echo off
chcp 65001 >nul
title 六爻工作台 · Web 版
echo.
echo   六爻工作台 · Web 版启动中...
echo.
cd /d "%~dp0"
node serve-web.mjs
pause
