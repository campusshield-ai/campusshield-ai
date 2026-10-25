# CampusShield AI — staging-only Edge Function secret setup
# Run from the repository root in PowerShell after installing the Supabase CLI and running "supabase login".
# Secret values are generated locally, written only to a temporary env file, uploaded to staging, then deleted.
$ErrorActionPreference = "Stop"
$projectRef = "hywcpnoqqhxvujnimhxl"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI not found. Install it first, then run supabase login."
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm is required to generate the VAPID keys."
}

$originInput = (Read-Host "Exact staging preview origin (for example https://your-preview.example)").Trim().TrimEnd("/")
$originUri = $null
if (-not [Uri]::TryCreate($originInput, [UriKind]::Absolute, [ref]$originUri)) {
  throw "Enter a valid absolute preview origin."
}
$isLocal = $originUri.Scheme -eq "http" -and @("localhost", "127.0.0.1") -contains $originUri.Host
if ($originUri.Host -ieq "campusshield-ai.github.io") {
  throw "This hostname selects production in supabase-config.js. Use the actual staging preview origin or localhost instead."
}
if (($originUri.Scheme -ne "https" -and -not $isLocal) -or $originUri.AbsolutePath -ne "/" -or $originUri.Query -or $originUri.Fragment) {
  throw "Use the HTTPS origin only (or localhost for local testing), without a path, query, or fragment."
}
$origin = $originUri.GetLeftPart([UriPartial]::Authority)

$appPath = (Read-Host "App path (press Enter for /; use /campusshield-ai/ for GitHub Pages path hosting)").Trim()
if (-not $appPath) { $appPath = "/" }
if ($appPath -notmatch '^/[A-Za-z0-9/_-]*/?$' -or $appPath.Contains("//") -or $appPath.Contains("..")) {
  throw "App path must be a simple local path beginning with / and must not contain query strings or traversal segments."
}

$subject = (Read-Host "VAPID subject (mailto: contact address or an HTTPS contact URL)").Trim()
$subjectUri = $null
if (-not ([Uri]::TryCreate($subject, [UriKind]::Absolute, [ref]$subjectUri)) -or
    -not ($subject.StartsWith("mailto:", [StringComparison]::OrdinalIgnoreCase) -or $subjectUri.Scheme -eq "https")) {
  throw "VAPID subject must be a mailto: address or an HTTPS contact URL."
}

$tempEnv = Join-Path ([IO.Path]::GetTempPath()) ("campusshield-staging-push-" + [Guid]::NewGuid().ToString("N") + ".env")
$randomBytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  Write-Host "Generating a fresh staging VAPID key pair..."
  $vapidOutput = & npx --yes web-push generate-vapid-keys --json
  if ($LASTEXITCODE -ne 0) { throw "VAPID key generation failed." }
  $vapid = ($vapidOutput -join "`n") | ConvertFrom-Json
  if (-not $vapid.publicKey -or -not $vapid.privateKey) { throw "VAPID generator did not return the expected key fields." }

  $rng.GetBytes($randomBytes)
  $dispatchSecret = [Convert]::ToBase64String($randomBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  $lines = @(
    "VAPID_PUBLIC_KEY=$($vapid.publicKey)",
    "VAPID_PRIVATE_KEY=$($vapid.privateKey)",
    "VAPID_SUBJECT=$subject",
    "PUSH_DISPATCH_SECRET=$dispatchSecret",
    "CAMPUSSHIELD_APP_ORIGIN=$origin",
    "CAMPUSSHIELD_APP_PATH=$appPath"
  )
  Set-Content -LiteralPath $tempEnv -Value $lines -Encoding ascii
  Write-Host "Uploading the push and preview-origin settings to staging only..."
  & supabase secrets set --project-ref $projectRef --env-file $tempEnv
  if ($LASTEXITCODE -ne 0) { throw "Supabase secret upload failed. The temporary file will be removed." }
  Write-Host "Staging secrets uploaded. Values were not printed."
  Write-Host "Next: add the same preview URL (including the app path) under staging Auth > URL Configuration > Redirect URLs."
  Write-Host "Then load that exact preview, sign in, enable background alerts, and use the Push notifications test button."
}
finally {
  if (Test-Path -LiteralPath $tempEnv) { Remove-Item -LiteralPath $tempEnv -Force }
  [Array]::Clear($randomBytes, 0, $randomBytes.Length)
  $dispatchSecret = $null
  $vapid = $null
  $rng.Dispose()
}
