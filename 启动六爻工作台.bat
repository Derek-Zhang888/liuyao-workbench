@echo off
title 六爻工作台 - 启动器
cd /d D:\liuyao-workbench

if not exist node_modules (
  echo [首次运行] 正在安装依赖，请耐心等待...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo 正在启动六爻工作台，浏览器将自动打开...
echo 提示：关闭本窗口即停止服务。
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
