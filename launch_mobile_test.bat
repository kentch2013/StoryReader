@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title StoryScout Mobile Device Test Environment (iPhone 14 Plus Safari)

echo ===============================================================================
echo   STORYSCOUT: MOBILE TESTING ENVIRONMENT (iPhone 14 Plus / Safari)
echo ===============================================================================
echo   This launcher boots the local Express server, discovers your network
echo   endpoints, and launches an encrypted Cloudflare HTTPS tunnel with a
echo   high-resolution desktop QR code for zero-typing iPhone Safari testing.
echo ===============================================================================
echo.

echo [1/3] Clearing port 3000 and verifying environment...
node scripts\prelaunch.js
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prelaunch clearance failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Starting StoryScout Server (port 3000) in dedicated window...
start "StoryScout Server (:3000)" cmd /k "title StoryScout Server (:3000) && node server.js"

echo Waiting for server to initialize and pre-warm AI models in RAM...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Identifying Local Network Endpoints...
echo -------------------------------------------------------------------------------
node scripts\detect_lan.js
echo -------------------------------------------------------------------------------
echo.
echo ===============================================================================
echo   ZERO-TYPING MOBILE SETUP INSTRUCTIONS:
echo   1. Cloudflare HTTPS tunnel will initialize below.
echo   2. A browser tab will open automatically showing a high-res QR Code.
echo   3. Point your iPhone 14 Plus Camera at the monitor.
echo   4. Tap the yellow "trycloudflare.com" banner to open in Safari.
echo   5. The QR Portal lets you test:
echo      [Tab 1] Module 4: Mobile Camera Tray & Canvas Compression (/test_camera.html)
echo      [Tab 2] Main StoryScout App (/)
echo      [Tab 3] Server Health Gateway (/api/health)
echo ===============================================================================
echo.
echo Starting Mobile Tunnel...
echo (Press Ctrl+C in this window when finished to stop the tunnel and server)
echo.

node scripts\mobile_tunnel.js

echo.
echo ===============================================================================
echo Cleaning up and stopping server on port 3000...
echo ===============================================================================
node -e "const { execSync } = require('child_process'); try { const net = execSync('netstat -ano').toString(); for (const l of net.split('\n')) { if (l.includes(':3000') && l.includes('LISTENING')) { const pid = l.trim().split(/\s+/).pop(); execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' }); } } console.log('[INFO] Server on port 3000 stopped.'); } catch (e) {}"
echo Done. Mobile test session ended.
pause
