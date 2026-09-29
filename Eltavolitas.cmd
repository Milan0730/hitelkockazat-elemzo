@echo off
rem A parancsikonok torlese. A mappa es az adatok megmaradnak.
title Hitelkockazat-elemzo - eltavolitas
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall
echo.
pause
