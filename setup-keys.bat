@echo off
setlocal EnableDelayedExpansion
title Doodlebug Secure Keys & Configuration Setup

echo =====================================================================
echo           DOODLEBUG SECURE LOCAL CONFIGURATION SETUP
echo =====================================================================
echo Wrangler is now logged in!
echo This setup script runs 100%% locally on your PC.
echo =====================================================================
echo.

:: 1. GEMINI API KEY
echo [1/8] Dedicated Gemini Flash API Key (from Google AI Studio):
set /p GEMINI_API_KEY="Paste Gemini Key: "
if "%GEMINI_API_KEY%"=="" (
    echo Error: Gemini API Key cannot be empty.
    pause
    exit /b 1
)
echo.

:: 2. GITHUB PAT
echo [2/8] GitHub Fine-Grained Personal Access Token (Contents: Read/Write):
set /p GITHUB_PAT="Paste GitHub PAT: "
if "%GITHUB_PAT%"=="" (
    echo Error: GitHub PAT cannot be empty.
    pause
    exit /b 1
)
echo.

:: 3. GIRLFRIEND'S FIREBASE UID
echo [3/8] Paste Girlfriend's Firebase User UID:
set /p ALLOWED_FIREBASE_UID="User UID: "
if "%ALLOWED_FIREBASE_UID%"=="" (
    echo Error: User UID cannot be empty.
    pause
    exit /b 1
)
echo.

:: 4. FIREBASE PROJECT ID
set DEFAULT_PROJ=doodlebug-ddc9c
echo [4/8] Firebase Project ID [Press Enter for '%DEFAULT_PROJ%']:
set /p FIREBASE_PROJECT_ID="Project ID (default %DEFAULT_PROJ%): "
if "%FIREBASE_PROJECT_ID%"=="" set FIREBASE_PROJECT_ID=%DEFAULT_PROJ%
echo.

:: 5. FIREBASE WEB API KEY
echo [5/8] Paste Firebase Web API Key:
set /p FIREBASE_API_KEY="Firebase API Key: "
if "%FIREBASE_API_KEY%"=="" (
    echo Error: Firebase Web API Key cannot be empty.
    pause
    exit /b 1
)
echo.

:: 6. GITHUB OWNER & REPO
set DEFAULT_OWNER=your-github-username
echo [6/8] Your GitHub Username [Press Enter for '%DEFAULT_OWNER%']:
set /p GITHUB_OWNER="GitHub Username: "
if "%GITHUB_OWNER%"=="" set GITHUB_OWNER=%DEFAULT_OWNER%

set DEFAULT_REPO=doodlebug
echo [7/8] GitHub Repository Name [Press Enter for '%DEFAULT_REPO%']:
set /p GITHUB_REPO="Repo Name: "
if "%GITHUB_REPO%"=="" set GITHUB_REPO=%DEFAULT_REPO%
echo.

:: 7. WORKER URL (OPTIONAL)
echo [8/8] Cloudflare Worker URL (leave blank if not deployed yet):
set /p WORKER_URL="Worker URL (e.g. https://doodlebug-gateway.xxx.workers.dev): "
if "%WORKER_URL%"=="" set WORKER_URL=https://doodlebug-gateway.workers.dev
echo.

echo =====================================================================
echo Saving configurations locally...
echo =====================================================================

:: STEP 1: Write pwa/.env
echo Writing pwa\.env ...
(
echo # Doodlebug PWA Client Environment Configuration
echo # All values here are public client identifiers scoped strictly to Firebase Auth.
echo # ZERO CLIENT SECRETS RULE: No GitHub PAT or Gemini Keys are stored here.
echo.
echo VITE_FIREBASE_API_KEY=%FIREBASE_API_KEY%
echo VITE_FIREBASE_AUTH_DOMAIN=%FIREBASE_PROJECT_ID%.firebaseapp.com
echo VITE_FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID%
echo VITE_WORKER_URL=%WORKER_URL%
) > "%~dp0pwa\.env"
echo   [OK] pwa\.env generated successfully.

:: STEP 2: Update worker/wrangler.toml with owner and repo
echo Updating worker\wrangler.toml with GitHub owner and repo...
powershell -NoProfile -Command "$c = Get-Content '%~dp0worker\wrangler.toml' -Raw; $c = $c -replace 'GITHUB_OWNER\s*=\s*\".*?\"', 'GITHUB_OWNER = \"%GITHUB_OWNER%\"'; $c = $c -replace 'GITHUB_REPO\s*=\s*\".*?\"', 'GITHUB_REPO = \"%GITHUB_REPO%\"'; Set-Content '%~dp0worker\wrangler.toml' -Value $c -Encoding UTF8"
echo   [OK] worker\wrangler.toml updated.

:: STEP 3: Write worker\.dev.vars
echo Writing worker\.dev.vars ...
(
echo # Doodlebug Cloudflare Worker Local Development Variables
echo GEMINI_API_KEY=%GEMINI_API_KEY%
echo GITHUB_PAT=%GITHUB_PAT%
echo ALLOWED_FIREBASE_UID=%ALLOWED_FIREBASE_UID%
echo FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID%
) > "%~dp0worker\.dev.vars"
echo   [OK] worker\.dev.vars generated successfully.

echo.
echo =====================================================================
echo            CLOUDFLARE WORKER SECRET UPLOAD
echo =====================================================================
echo Uploading secrets to Cloudflare Worker via Wrangler...
cd "%~dp0worker"

echo %GEMINI_API_KEY%| npx wrangler secret put GEMINI_API_KEY
echo %GITHUB_PAT%| npx wrangler secret put GITHUB_PAT
echo %ALLOWED_FIREBASE_UID%| npx wrangler secret put ALLOWED_FIREBASE_UID
echo %FIREBASE_PROJECT_ID%| npx wrangler secret put FIREBASE_PROJECT_ID

echo.
echo [OK] All 4 Cloudflare secrets uploaded successfully!
echo.
set /p DEPLOY_NOW="Do you want to deploy the Worker right now? (Y/N): "
if /i "!DEPLOY_NOW!"=="Y" (
    npx wrangler deploy
)
cd "%~dp0"

echo.
echo =====================================================================
echo                      SETUP COMPLETE!
echo =====================================================================
echo.
echo Summary of next steps:
echo Start the local PWA editor to test:
echo      cd pwa
echo      npm run dev
echo =====================================================================
echo.
pause
