<# ======================================================================
  deploy-all.ps1  —  Ein-Skript-Workflow für test / beta / main (+Backups)

  Features
  - Backup des lokalen Projektordners (ZIP mit Zeitstempel)
  - Push des lokalen Inhalts nach test / beta / main (je Remote-Repo)
  - Promotion test → beta und beta → main (ohne lokale Files zu verändern)
  - Sicherheitsabfrage vor main-Deployment
  - Optionaler Build-Schritt (kann deaktiviert werden)

  Voraussetzung
  - PowerShell, Git, und optional Node (falls Build aktiviert)
  - Repos existieren:
      test : https://github.com/SFDataHub/test.git
      beta : https://github.com/SFDataHub/beta.git
      main : https://github.com/SFDataHub/sfdatahub.github.io.git

  Aufrufbeispiele (aus dem Projektordner):
    PS> .\deploy-all.ps1 push test
    PS> .\deploy-all.ps1 push beta
    PS> .\deploy-all.ps1 promote test beta
    PS> .\deploy-all.ps1 promote beta main
    PS> .\deploy-all.ps1 push main        (fragt vorher J/N)
====================================================================== #>

# -------------------- KONFIGURATION --------------------
# Lokaler Projektordner (bitte prüfen!)
$ProjectPath = "D:\SFDataHub\sfdatahub.github.io"

# Backup-Ziel
$BackupRoot  = "D:\SFDataHub\_backups"

# Remotes (= Ziel-Repos)
$Repos = @{
  test = "https://github.com/SFDataHub/test.git"
  beta = "https://github.com/SFDataHub/beta.git"
  main = "https://github.com/SFDataHub/sfdatahub.github.io.git"
}

# Branch-Namen in den Ziel-Repos
$BranchFor = @{
  test = "main"
  beta = "main"
  main = "main"
}

# Optionaler Build vor "push" (true/false) und Befehl:
$EnableBuild = $false
$BuildCmd    = "npm ci && npm run build"
# ------------------------------------------------------

# ---------- Hilfsfunktionen ----------
function TS { Get-Date -Format "yyyyMMdd_HHmmss" }

function Ensure-Dir([string]$p) {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Backup-Project {
  param([string]$src,[string]$destRoot)
  Ensure-Dir $destRoot
  $zip = Join-Path $destRoot ("backup_" + (Split-Path $src -Leaf) + "_" + (TS) + ".zip")
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $src "*") -DestinationPath $zip -Force
  Write-Host "✅ Backup erstellt: $zip"
}

function Ensure-GitRepo {
  param([string]$workDir)
  Set-Location $workDir
  if (-not (Test-Path (Join-Path $workDir ".git"))) {
    git init | Out-Null
  }
}

function Set-Remote {
  param([string]$name,[string]$url)
  $existing = (git remote) -split "`n" | ForEach-Object { $_.Trim() }
  if ($existing -contains $name) { git remote remove $name | Out-Null }
  git remote add $name $url | Out-Null
}

function Commit-And-Push {
  param([string]$remote,[string]$branch,[string]$msg)

  git checkout -B $branch | Out-Null
  git add -A
  git commit -m $msg 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    # Nichts zu committen? Erzwinge einen "leeren" Commit, damit Push klappt.
    git commit --allow-empty -m $msg | Out-Null
  }
  git push -u $remote $branch
  if ($LASTEXITCODE -ne 0) { throw "❌ Push fehlgeschlagen." }
  Write-Host "🚀 Gepusht nach '$remote' ($branch)."
}

function Maybe-Build {
  param([string]$cmd)
  if (-not $cmd) { return }
  Write-Host "🛠  Build läuft: $cmd"
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { throw "❌ Build fehlgeschlagen." }
  Write-Host "✅ Build OK."
}

function Promote-Repo {
  param(
    [string]$fromUrl,[string]$fromBranch,
    [string]$toUrl,[string]$toBranch
  )
  $tmp = Join-Path $env:TEMP ("promote_" + (TS))
  Ensure-Dir $tmp
  Write-Host "⬇️  Klone Quelle: $fromUrl ($fromBranch)"
  git clone --depth 1 --branch $fromBranch $fromUrl $tmp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "❌ Clone der Quelle fehlgeschlagen." }

  Push-Location $tmp
  try {
    # Zielremote setzen und pushen (überschreibt Ziel-Branchinhalt)
    if ((git remote) -match "^dest$") { git remote remove dest | Out-Null }
    git remote add dest $toUrl | Out-Null
    git checkout -B $toBranch | Out-Null
    git push -u dest $toBranch --force
    if ($LASTEXITCODE -ne 0) { throw "❌ Promotion-Push fehlgeschlagen." }
  }
  finally {
    Pop-Location
    Remove-Item $tmp -Recurse -Force | Out-Null
  }
  Write-Host "🔁 Promotion abgeschlossen: $fromUrl ($fromBranch) → $toUrl ($toBranch)"
}
# ------------------------------------

# ---------- Befehls-Parser ----------
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("push","promote")]
  [string]$command,

  # bei push:  env=test|beta|main
  # bei promote: fromEnv toEnv
  [string]$env,
  [string]$toEnv
)

# Validierung der Envs
$validEnvs = @("test","beta","main")
function Must-BeValidEnv([string]$e) {
  if (-not ($validEnvs -contains $e)) {
    throw "Ungültige Umgebung '$e'. Erlaubt: test | beta | main"
  }
}

# ---------- Ausführung ----------
try {
  if ($command -eq "push") {
    Must-BeValidEnv $env

    if ($env -eq "main") {
      $answer = Read-Host "⚠️  Wirklich nach MAIN deployen? (J/N)"
      if ($answer -notin @("J","j","Y","y")) {
        throw "Abgebrochen."
      }
    }

    # 1) Backup
    Backup-Project -src $ProjectPath -destRoot $BackupRoot

    # 2) Optionaler Build
    if ($EnableBuild) { Maybe-Build -cmd $BuildCmd }

    # 3) Git vorbereiten + push
    Ensure-GitRepo -workDir $ProjectPath
    $remoteUrl = $Repos[$env]
    $branch    = $BranchFor[$env]
    $remote    = $env  # remote heißt wie die Umgebung
    Set-Remote -name $remote -url $remoteUrl
    $msg = "deploy: $env | " + (TS)
    Commit-And-Push -remote $remote -branch $branch -msg $msg

    Write-Host "✅ Fertig: PUSH → $env"
  }
  elseif ($command -eq "promote") {
    Must-BeValidEnv $env
    Must-BeValidEnv $toEnv
    if ($env -eq $toEnv) { throw "Quelle und Ziel sind identisch." }

    if ($toEnv -eq "main") {
      $answer = Read-Host "⚠️  Promotion nach MAIN? (J/N)"
      if ($answer -notin @("J","j","Y","y")) {
        throw "Abgebrochen."
      }
    }

    # 1) Backup (lokal, bevor irgendwas passiert)
    Backup-Project -src $ProjectPath -destRoot $BackupRoot

    # 2) Promotion: Klone Quelle und pushe 1:1 auf Ziel
    $fromUrl    = $Repos[$env]
    $fromBranch = $BranchFor[$env]
    $toUrl      = $Repos[$toEnv]
    $toBranch   = $BranchFor[$toEnv]

    Promote-Repo -fromUrl $fromUrl -fromBranch $fromBranch -toUrl $toUrl -toBranch $toBranch
    Write-Host "✅ Fertig: PROMOTE $env → $toEnv"
  }
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
