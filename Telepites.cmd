@echo off
rem Parancsikon letrehozasa az Asztalon es a Start menuben (sajat ablakos alkalmazas, internet nelkul is).
title Hitelkockazat-elemzo - telepites
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" 
echo.
pause
