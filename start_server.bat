@echo off
cd /d "%~dp0"
title StoryReader Server

node scripts\prelaunch.js
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prelaunch check failed.
    pause
    exit /b %ERRORLEVEL%
)

node server.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Server exited with error code %ERRORLEVEL%.
    pause
)
