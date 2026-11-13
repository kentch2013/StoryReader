@echo off
cd /d "%~dp0"
title StoryScout Server (:3000)

echo ===============================================================================
echo   StoryScout Server (:3000)
echo   - Webapp:       http://localhost:3000
echo   - Camera Tray:  http://localhost:3000/test_camera.html
echo   - Health Check: http://localhost:3000/api/health
echo ===============================================================================

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
