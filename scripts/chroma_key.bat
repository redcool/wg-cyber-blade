@echo off
chcp 65001 >nul
title PNG Chroma Key Tool

cd /d "%~dp0"

:: =======================================
:: Config (edit below)
:: =======================================
set "DEFAULT_DIR=assets/chars2"
set "KEY_COLOR=0,0,0"
set "TOLERANCE=80"
set "INVERT=0"
set "DRY_RUN=0"
:: =======================================

set "INPUT_DIR=%~1"
if "%INPUT_DIR%"=="" set "INPUT_DIR=%DEFAULT_DIR%"

set "EXTRA_ARGS="
if "%INVERT%"=="1" set "EXTRA_ARGS=%EXTRA_ARGS% --invert"
if "%DRY_RUN%"=="1" set "EXTRA_ARGS=%EXTRA_ARGS% --dry-run"

echo ============================================================
echo   PNG Chroma Key Tool
echo   Remove near-key-color pixels by setting alpha to 0
echo.
echo   Scan dir: %INPUT_DIR%
echo   Key color: %KEY_COLOR%
echo   Tolerance: %TOLERANCE%
if "%INVERT%"=="1" echo   Mode: INVERT
if "%DRY_RUN%"=="1" echo   Mode: DRY-RUN (preview)
echo ============================================================
echo.

:: Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found, please install Python 3
    pause
    exit /b 1
)

:: Check Pillow
pip show Pillow >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing Pillow...
    pip install Pillow
    if errorlevel 1 (
        echo [ERROR] Pillow install failed, run: pip install Pillow
        pause
        exit /b 1
    )
)

echo.
echo Press any key to start...
pause >nul
echo.

python chroma_key.py "%INPUT_DIR%" --key-color %KEY_COLOR% --tolerance %TOLERANCE%%EXTRA_ARGS%

echo.
echo Done!
pause
