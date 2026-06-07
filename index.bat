@echo off
chcp 65001 >nul
title CyberBlade - Local HTTP Server
cd /d "%~dp0"

:: ============================================================
:: CyberBlade 本地 HTTP 服务器
:: 解决 file:// 协议下 fetch() 被 CORS 阻止的问题
:: 双击本文件即可启动服务器并自动打开浏览器
:: ============================================================

set "PORT=8000"
set "URL=http://localhost:%PORT%/"

echo ============================================================
echo   CyberBlade Local HTTP Server
echo   Port: %PORT%
echo   URL:  %URL%
echo ============================================================
echo.

:: 检查 Python
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PY=python"
    goto :start_server
)

:: 回退到 Windows 启动器 py
where py >nul 2>&1
if %errorlevel% equ 0 (
    set "PY=py -3"
    goto :start_server
)

echo [ERROR] Python not found.
echo Please install Python 3 from https://www.python.org/downloads/
echo Make sure to check "Add Python to PATH" during installation.
pause
exit /b 1

:start_server
echo [INFO] Starting HTTP server on port %PORT%...
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
echo [INFO] Opening browser in 2 seconds...
echo.

:: 延迟 2 秒后打开浏览器（给服务器启动留出时间）
start /min "" cmd /c "timeout /t 2 /nobreak >nul && start "" "%URL%""

:: 启动 HTTP 服务器（前台运行，Ctrl+C 停止）
%PY% -m http.server %PORT%

echo.
echo [INFO] Server stopped.
pause
