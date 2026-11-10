@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title StoryScout Master Test Environment

echo ===============================================================================
echo   StoryScout: Automated Test Environment Launcher
echo ===============================================================================
echo [1/4] Running prelaunch checks and clearing port 3000...
node scripts\prelaunch.js
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Prelaunch port clearance failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/4] Starting StoryScout Express Server (:3000) in dedicated window...
start "StoryScout Express Server (:3000)" cmd /k "title Express Server (:3000) && node server.js"

echo [3/4] Launching Interactive Zero-Lag Evaluator REPL in dedicated window...
start "StoryScout Zero-Lag Evaluator REPL" cmd /k "title Zero-Lag Evaluator REPL && node scripts\interactive_eval_test.js"

echo [4/4] Opening browser to health check...
timeout /t 2 /nobreak >nul
start http://localhost:3000/api/health

echo.
echo ===============================================================================
echo   All servers and testing windows launched!
echo ===============================================================================
echo   - Window 1: Express Server (http://localhost:3000)
echo   - Window 2: Zero-Lag Evaluator REPL (Type answers and test 0ms latency)
echo   - Browser:  Health Check (http://localhost:3000/api/health)
echo.

:MENU
echo -------------------------------------------------------------------------------
echo Select a test action to run in this window:
echo   [1] Run Tier 1 Zero-Lag Benchmark (scripts\test_evaluate_sample.js)
echo   [2] Run Multimodal Book Analysis Sample (scripts\test_analyze_sample.js)
echo   [3] Run Full Verification Suite & Immutability Audit (npm run verify)
echo   [4] Open Documentation & Living Handoff Log (SESSION_LOG.md, architecture.md)
echo   [5] Launch Cloudflare Quick Tunnel (Mobile Safari testing)
echo   [6] Shutdown Server (:3000) and Exit
echo -------------------------------------------------------------------------------
set /p CHOICE="Enter choice (1-6): "

if "%CHOICE%"=="1" (
    echo.
    echo Running Tier 1 Zero-Lag Benchmark...
    node scripts\test_evaluate_sample.js
    echo.
    goto MENU
)
if "%CHOICE%"=="2" (
    echo.
    echo Running Multimodal Book Analysis Sample...
    node scripts\test_analyze_sample.js
    echo.
    goto MENU
)
if "%CHOICE%"=="3" (
    echo.
    echo Running npm run verify...
    npm run verify
    echo.
    goto MENU
)
if "%CHOICE%"=="4" (
    echo.
    echo Opening SESSION_LOG.md, architecture.md, and SPEC.md...
    start "" SESSION_LOG.md
    start "" architecture.md
    start "" SPEC.md
    goto MENU
)
if "%CHOICE%"=="5" (
    echo.
    echo Launching Cloudflare Tunnel for http://localhost:3000...
    echo (Copy the generated https://*.trycloudflare.com URL into iPhone 14 Plus Safari)
    npx cloudflared tunnel --url http://localhost:3000
    goto MENU
)
if "%CHOICE%"=="6" (
    echo.
    echo Terminating server on port 3000...
    node -e "const { execSync } = require('child_process'); try { const net = execSync('netstat -ano').toString(); for (const l of net.split('\n')) { if (l.includes(':3000') && l.includes('LISTENING')) { const pid = l.trim().split(/\s+/).pop(); execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' }); } } } catch (e) {}"
    echo Done. Goodbye!
    exit /b 0
)

echo Invalid choice. Please enter 1-6.
goto MENU
