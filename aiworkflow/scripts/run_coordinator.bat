@echo off
chcp 936 >nul
cd /d "%~dp0"
python coordinator.py
pause
