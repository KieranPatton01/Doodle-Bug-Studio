# Doodlebug Secure Local Configuration Setup (PowerShell)
# Runs 100% locally on your PC. No keys leave your computer.

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "          DOODLEBUG SECURE LOCAL CONFIGURATION SETUP" -ForegroundColor Yellow
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "This script runs 100% locally on your computer."
Write-Host "None of your keys will leave your PC or appear in chat." -ForegroundColor Green
Write-Host ""
Write-Host "Presets detected from your Firebase setup:"
Write-Host "  Project ID:     doodlebug-ddc9c (Free Spark Plan - Auth Only)"
Write-Host "  Photo Storage:  GitHub img/ folder"
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Gemini Key
$geminiKey = Read-Host "[1/8] Paste Dedicated Gemini Flash API Key"
while ([string]::IsNullOrWhiteSpace($geminiKey)) {
    $geminiKey = Read-Host "Error: Cannot be empty. Paste Gemini Key"
}

# 2. GitHub PAT
$githubPat = Read-Host "[2/8] Paste GitHub Fine-Grained PAT (Contents: Read/Write)"
while ([string]::IsNullOrWhiteSpace($githubPat)) {
    $githubPat = Read-Host "Error: Cannot be empty. Paste GitHub PAT"
}

# 3. Girlfriend's UID
$allowedUid = Read-Host "[3/8] Paste Girlfriend's Firebase User UID"
while ([string]::IsNullOrWhiteSpace($allowedUid)) {
    $allowedUid = Read-Host "Error: Cannot be empty. Paste User UID"
}

# 4. Project ID
$projIdInput = Read-Host "[4/8] Firebase Project ID [Press Enter for 'doodlebug-ddc9c']"
$projectId = if ([string]::IsNullOrWhiteSpace($projIdInput)) { "doodlebug-ddc9c" } else { $projIdInput.Trim() }

# 5. Firebase Web API Key
$firebaseApiKey = Read-Host "[5/8] Paste Firebase Web API Key (AIzaSy...)"
while ([string]::IsNullOrWhiteSpace($firebaseApiKey)) {
    $firebaseApiKey = Read-Host "Error: Cannot be empty. Paste Firebase Web API Key"
}

# 6. GitHub Owner & Repo
$ownerInput = Read-Host "[6/8] Your GitHub Username (for live repo)"
$githubOwner = if ([string]::IsNullOrWhiteSpace($ownerInput)) { "your-username" } else { $ownerInput.Trim() }

$repoInput = Read-Host "[7/8] GitHub Repository Name [Press Enter for 'doodlebug']"
$githubRepo = if ([string]::IsNullOrWhiteSpace($repoInput)) { "doodlebug" } else { $repoInput.Trim() }

# 7. Worker URL
$workerInput = Read-Host "[8/8] Cloudflare Worker URL [Press Enter if not deployed yet]"
$workerUrl = if ([string]::IsNullOrWhiteSpace($workerInput)) { "https://doodlebug-gateway.workers.dev" } else { $workerInput.Trim() }

Write-Host ""
Write-Host "Saving configurations locally..." -ForegroundColor Cyan

# 1. Write pwa/.env
$envPath = Join-Path $baseDir "pwa\.env"
$envContent = @"
# Doodlebug PWA Client Environment Configuration
# ZERO CLIENT SECRETS RULE: Only public client identifiers are stored here.
VITE_FIREBASE_API_KEY=$firebaseApiKey
VITE_FIREBASE_AUTH_DOMAIN=$projectId.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=$projectId
VITE_WORKER_URL=$workerUrl
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "  [OK] pwa/.env written." -ForegroundColor Green

# 2. Update worker/wrangler.toml
$wranglerPath = Join-Path $baseDir "worker\wrangler.toml"
if (Test-Path $wranglerPath) {
    $wranglerContent = Get-Content $wranglerPath -Raw
    $wranglerContent = $wranglerContent -replace 'GITHUB_OWNER\s*=\s*".*?"', "GITHUB_OWNER = `"$githubOwner`""
    $wranglerContent = $wranglerContent -replace 'GITHUB_REPO\s*=\s*".*?"', "GITHUB_REPO = `"$githubRepo`""
    Set-Content -Path $wranglerPath -Value $wranglerContent -Encoding UTF8
    Write-Host "  [OK] worker/wrangler.toml updated." -ForegroundColor Green
}

# 3. Write worker/.dev.vars for local development
$devVarsPath = Join-Path $baseDir "worker\.dev.vars"
$devVarsContent = @"
# Doodlebug Cloudflare Worker Local Development Variables
GEMINI_API_KEY=$geminiKey
GITHUB_PAT=$githubPat
ALLOWED_FIREBASE_UID=$allowedUid
FIREBASE_PROJECT_ID=$projectId
"@
Set-Content -Path $devVarsPath -Value $devVarsContent -Encoding UTF8
Write-Host "  [OK] worker/.dev.vars written." -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
$pushSecrets = Read-Host "Do you want to upload the 4 secrets directly to Cloudflare now via Wrangler? (Y/N)"
if ($pushSecrets -match "^[Yy]") {
    Push-Location (Join-Path $baseDir "worker")
    try {
        $geminiKey | npx wrangler secret put GEMINI_API_KEY
        $githubPat | npx wrangler secret put GITHUB_PAT
        $allowedUid | npx wrangler secret put ALLOWED_FIREBASE_UID
        $projectId | npx wrangler secret put FIREBASE_PROJECT_ID
        Write-Host "  [OK] Cloudflare secrets uploaded successfully!" -ForegroundColor Green

        $deployNow = Read-Host "Do you want to run 'npx wrangler deploy' now? (Y/N)"
        if ($deployNow -match "^[Yy]") {
            npx wrangler deploy
        }
    } finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "SETUP COMPLETE!" -ForegroundColor Yellow
Write-Host "Start your local PWA to test:"
Write-Host "   cd pwa; npm run dev" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan
