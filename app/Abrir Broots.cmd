@echo off
rem Abre Broots. La primera vez prepara la interfaz (tarda unos segundos).
cd /d "%~dp0"
if not exist "dist\index.html" call npm run build
start "" "%~dp0node_modules\electron\dist\electron.exe" .
