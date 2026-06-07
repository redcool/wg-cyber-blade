@echo off
chcp 65001 >nul
title PNG Picture Resize Tool
cd /d "%~dp0"

set "DEFAULT_DIR=assets/chars2"
set "INPUT_DIR=%~1"
if "%INPUT_DIR%"=="" set "INPUT_DIR=%DEFAULT_DIR%"

echo ============================================================
echo   PNG Picture Resize Tool
echo   Resize all PNGs with longest side > 128px down to 128px
echo.
echo   Scan directory: %INPUT_DIR%
echo ============================================================
echo.

python -c "from PIL import Image" 2>nul
if %errorlevel% neq 0 (
    pip install Pillow >nul 2^>^&1
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Pillow. Run manually: pip install Pillow
        pause
        exit /b 1
    )
)

echo.
echo Press any key to start resizing...
pause >nul
echo.

python resize_assets.py "%INPUT_DIR%" --max-size 128

echo.
echo Done.
pause
