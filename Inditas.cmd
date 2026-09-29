@echo off
rem Dupla kattintassal inditja a helyi szervert es megnyitja a bongeszoben.
rem Leallitas: zard be ezt az ablakot.
title Hitelkockazat-elemzo
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Open 
if errorlevel 1 pause
