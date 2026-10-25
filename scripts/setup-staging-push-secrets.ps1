[CmdletBinding()]
param(
  [switch]$RotateVapidKeys
)

$ErrorActionPreference = "Stop"
$StagingProjectRef = "hywcpnoqqhxvujnimhxl"
$tempPath = $null
$vapidPublicKey = $null
$vapidPrivateKey = $null
$dispatchSecret = $null
$secretLines = @()

function Test-SecretName {
  param([string]$Text, [string]$Name)
  return [regex]::IsMatch($Text, "(?im)\b" + [regex]::Escape($Name) + "\b")
}

function New-DispatchSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

try {
  if (-not (Test-Path -LiteralPath ".\supabase-config.js") -or -not (Test-Path -LiteralPath ".\campusshield-backend.js")) {
    throw "Run this script from the CampusShield AI repository root."
  }
  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    throw "Supabase CLI was not found. Install it and run 'supabase login' first."
  }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx was not found. Install Node.js with npm, then rerun this script."
  }

  $originInput = (Read-Host "Staging preview origin only (scheme + host + optional port; do not include a path)").Trim().TrimEnd("/")
  $originUri = $null
  if (-not [Uri]::TryCreate($originInput, [UriKind]::Absolute, [ref]$originUri)) {
    throw "The staging preview origin is not a valid absolute URL."
  }
  if ($originUri.Scheme -ne "https" -and -not ($originUri.Scheme -eq "http" -and $originUri.Host -in @("localhost", "127.0.0.1"))) {
    throw "Use HTTPS for a remote staging preview. HTTP is allowed only for localhost testing."
  }
  if ($originUri.AbsolutePath -notin @("", "/") -or $originUri.Query -or $originUri.Fragment -or $originUri.UserInfo) {
    throw "Enter the origin only, without a path, query, fragment, or embedded credentials. Enter the app path separately."
  }
  if ($originUri.Host -ieq "campusshield-ai.github.io") {
    throw "The canonical GitHub Pages host is production. Use the real staging preview host instead."
  }
  $origin = $originUri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")

  $appPath = (Read-Host "App path on that origin (use / for the root, or e.g. /campusshield-ai/)").Trim()
  if ([string]::IsNullOrWhiteSpace($appPath)) { $appPath = "/" }
  if (-not $appPath.StartsWith("/") -or $appPath.Contains("?") -or $appPath.Contains("#") -or $appPath.Contains("\") -or $appPath.Contains("..") -or $appPath -notmatch "^/[A-Za-z0-9._~/-]*$") {
    throw "The app path must be a safe path beginning with / and cannot contain query strings, fragments, backslashes or '..'."
  }
  if (-not $appPath.EndsWith("/")) { $appPath += "/" }

  $subject = (Read-Host "VAPID subject, e.g. mailto:security@your-domain.example or https://your-domain.example/contact").Trim()
  $isMailSubject = $subject -match "^mailto:[^\s@]+@[^\s@]+$"
  $subjectUri = $null
  $isHttpsSubject = [Uri]::TryCreate($subject, [UriKind]::Absolute, [ref]$subjectUri) -and $subjectUri.Scheme -eq "https"
  if (-not ($isMailSubject -or $isHttpsSubject)) {
    throw "VAPID subject must be a mailto: email address or an HTTPS contact URL."
  }

  # Verify CLI login and read secret names only; Supabase never returns secret values here.
  $secretListOutput = @(& supabase secrets list --project-ref $StagingProjectRef 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Could not read the staging secret inventory. Confirm 'supabase login' and project access."
  }
  $secretListText = $secretListOutput -join [Environment]::NewLine
  $hasPublic = Test-SecretName -Text $secretListText -Name "VAPID_PUBLIC_KEY"
  $hasPrivate = Test-SecretName -Text $secretListText -Name "VAPID_PRIVATE_KEY"
  $hasDispatch = Test-SecretName -Text $secretListText -Name "PUSH_DISPATCH_SECRET"

  if ($hasPublic -ne $hasPrivate -and -not $RotateVapidKeys) {
    throw "Only one VAPID key appears to exist. Refusing to guess or overwrite a partial keypair. Inspect staging secrets, then rerun with -RotateVapidKeys if a deliberate rotation is required."
  }
  $generateVapid = $RotateVapidKeys -or (-not $hasPublic -and -not $hasPrivate)
  if ($generateVapid) {
    # Capture generator output in memory. Never write it to the console, disk or repository.
    $vapidOutput = @(& npx --yes web-push generate-vapid-keys --json 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "VAPID generation failed. Check npm access and rerun; no generated key values were displayed."
    }
    try {
      $vapidKeys = ($vapidOutput -join [Environment]::NewLine) | ConvertFrom-Json
      $vapidPublicKey = [string]$vapidKeys.publicKey
      $vapidPrivateKey = [string]$vapidKeys.privateKey
    } catch {
      throw "The VAPID generator returned an unexpected result. No generated key values were displayed."
    }
    if ([string]::IsNullOrWhiteSpace($vapidPublicKey) -or [string]::IsNullOrWhiteSpace($vapidPrivateKey)) {
      throw "VAPID generation returned an incomplete keypair. No generated key values were displayed."
    }
  }
  if (-not $hasDispatch) {
    $dispatchSecret = New-DispatchSecret
  }

  # A protected temporary dotenv file is used so secret values are not passed as command-line arguments.
  $tempPath = Join-Path ([IO.Path]::GetTempPath()) ("campusshield-staging-push-" + [Guid]::NewGuid().ToString("N") + ".env")
  [IO.File]::WriteAllText($tempPath, "", [Text.UTF8Encoding]::new($false))
  $acl = Get-Acl -LiteralPath $tempPath
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $rule = New-Object -TypeName System.Security.AccessControl.FileSystemAccessRule -ArgumentList $identity, "FullControl", "Allow"
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $tempPath -AclObject $acl

  $secretLines = @(
    "CAMPUSSHIELD_APP_ORIGIN=$origin"
    "CAMPUSSHIELD_APP_PATH=$appPath"
    "VAPID_SUBJECT=$subject"
  )
  if ($generateVapid) {
    $secretLines += "VAPID_PUBLIC_KEY=$vapidPublicKey"
    $secretLines += "VAPID_PRIVATE_KEY=$vapidPrivateKey"
  }
  if (-not $hasDispatch) {
    $secretLines += "PUSH_DISPATCH_SECRET=$dispatchSecret"
  }
  [IO.File]::WriteAllText($tempPath, ($secretLines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

  $null = & supabase secrets set --project-ref $StagingProjectRef --env-file $tempPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase rejected the staging secret update. Secret values were not printed. Check project permissions and retry."
  }

  $verifyOutput = @(& supabase secrets list --project-ref $StagingProjectRef 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Secrets were submitted, but the staging inventory could not be verified. Check Supabase Dashboard → Edge Function Secrets."
  }
  $verifyText = $verifyOutput -join [Environment]::NewLine
  foreach ($name in @("CAMPUSSHIELD_APP_ORIGIN", "CAMPUSSHIELD_APP_PATH", "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "PUSH_DISPATCH_SECRET")) {
    if (-not (Test-SecretName -Text $verifyText -Name $name)) {
      throw "Staging secret verification did not find every required secret. Check the staging Edge Function Secrets page."
    }
  }

  Write-Host "Staging push configuration was submitted and the required secret names were verified."
  Write-Host "Target project: $StagingProjectRef (staging only). Secret values were not printed."
  Write-Host "Add this entry under staging Authentication → URL Configuration → Redirect URLs:"
  Write-Host ("  " + $origin + $appPath + "**")
  Write-Host "Keep the staging Site URL and all production settings unchanged."
  if ($RotateVapidKeys) {
    Write-Warning "VAPID keys were rotated. Existing device subscriptions may need users to disable and re-enable notifications."
  } elseif ($generateVapid) {
    Write-Host "A new VAPID keypair was created."
  } else {
    Write-Host "Existing VAPID keys were preserved."
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if ($tempPath -and (Test-Path -LiteralPath $tempPath)) {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  }
  $secretLines = @()
  $vapidOutput = $null
  $vapidKeys = $null
  $vapidPublicKey = $null
  $vapidPrivateKey = $null
  $dispatchSecret = $null
}