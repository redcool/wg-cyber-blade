@echo off
chcp 65001 >nul
echo ==============================
echo  CSV to Data Pipeline
echo ==============================
echo.

echo [1/2] csv2json.cjs -- CSV to JSON
node "%~dp0csv2json.cjs"
if %errorlevel% neq 0 (
    echo FAILED: csv2json.cjs
    pause
    exit /b 1
)
echo.
echo [2/2] generate-data-bundle.js -- inline bundle
node "%~dp0generate-data-bundle.js"
if %errorlevel% neq 0 (
    echo FAILED: generate-data-bundle.js
    pause
    exit /b 1
)
echo.
echo ===== DONE =====
pause
