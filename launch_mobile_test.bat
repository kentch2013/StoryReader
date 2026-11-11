@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title StoryScout Mobile Device Test Environment

echo ===============================================================================
echo   StoryScout: Mobile Device Test Environment (iOS / Android)
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
echo [3/3] Identifying Network Endpoints for Mobile Device Testing...
echo -------------------------------------------------------------------------------
node scripts\detect_lan.js
echo -------------------------------------------------------------------------------
echo.
echo ===============================================================================
echo   MOBILE SAFARI / iOS ZERO-TYPING CONNECTIVITY:
echo   - Cloudflare HTTPS tunnel will launch automatically.
echo   - The generated URL will be copied to your Windows Clipboard.
echo   - A desktop browser tab will open displaying a large QR code.
echo   - Simply aim your iPhone Camera at the screen to open the app in Safari!
echo ===============================================================================
echo.
echo Starting Mobile Tunnel...
echo (Press Ctrl+C inside this window to stop the tunnel and shutdown the server)
echo.

node scripts\mobile_tunnel.js

echo.
echo ===============================================================================
echo Tunnel stopped. Cleaning up and shutting down server on port 3000...
echo ===============================================================================
node -e "const { execSync } = require('child_process'); try { const net = execSync('netstat -ano').toString(); for (const l of net.split('\n')) { if (l.includes(':3000') && l.includes('LISTENING')) { const pid = l.trim().split(/\s+/).pop(); execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' }); } } console.log('[INFO] Server on port 3000 stopped.'); } catch (e) {}"
echo Done. Mobile test environment closed.
pause
