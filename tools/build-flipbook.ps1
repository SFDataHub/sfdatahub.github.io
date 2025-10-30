# tools/build-flipbook.ps1  (Poppler + ImageMagick, KEIN Ghostscript nötig)
param(
  [Parameter(Mandatory=$true)] [string]$Slug,     # z.B. "sf-history-book"
  [Parameter(Mandatory=$true)] [string]$PdfPath   # z.B. "public/flipbooks/sf-history-book/SFHistoryBook.pdf"
)

$ErrorActionPreference = "Stop"

function Test-Cmd($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

if (-not (Test-Cmd "pdftoppm")) {
  Write-Error "Poppler 'pdftoppm' nicht gefunden. Bitte Poppler installieren (winget install -e --id oschwartz10612.Poppler) und neues PowerShell-Fenster öffnen."
}
if (-not (Test-Cmd "magick")) {
  Write-Error "ImageMagick 'magick' nicht gefunden. Bitte ImageMagick 7 installieren und neues PowerShell-Fenster öffnen."
}

# Pfade
$Base   = "public/flipbooks/$Slug"
$Pages  = Join-Path $Base "pages"
$Thumbs = Join-Path $Base "thumbs"

# Ordner
New-Item -ItemType Directory -Force -Path $Base   | Out-Null
New-Item -ItemType Directory -Force -Path $Pages  | Out-Null
New-Item -ItemType Directory -Force -Path $Thumbs | Out-Null

# 1) PDF -> RAW PNG mit Poppler (r = DPI)
Write-Host "==> Exportiere RAW-PNGs aus PDF via Poppler (@r=240) …"
& pdftoppm -r 240 -png "$PdfPath" "$Pages\raw" | Out-Null

# 2) Umbenennen: raw-1.png -> raw_0001.png (Zero-Pad)
Write-Host "==> Benenne RAW-Dateien (Zero-Pad) …"
Get-ChildItem "$Pages\raw-*.png" | ForEach-Object {
  if ($_ -match "raw-(\d+)\.png") {
    $n = [int]$Matches[1]
    $padded = $n.ToString("0000")
    Rename-Item -Path $_.FullName -NewName ("raw_{0}.png" -f $padded)
  }
}

# 3) Maße der ersten Seite prüfen
$first = Get-ChildItem "$Pages\raw_0001.png" -ErrorAction Stop
$imgInfo = magick identify -format "%w,%h" "$($first.FullName)"
$parts = $imgInfo.Split(",")
$rawW = [int]$parts[0]
$rawH = [int]$parts[1]

# 4) Zielbreiten für srcset
$w1x = 1400
$w15 = 1800
$w2x = 2400

# 5) Ausgabevarianten rendern (WEBP)
Write-Host "==> Erzeuge @2x WEBP ($w2x px Breite)"
Get-ChildItem "$Pages\raw_*.png" | ForEach-Object {
  $num = $_.BaseName.Replace("raw_","")
  magick "$($_.FullName)" -resize "$w2x" -quality 80 "$Pages\$($num)@2x.webp"
}

Write-Host "==> Erzeuge @1.5x WEBP ($w15 px Breite)"
Get-ChildItem "$Pages\raw_*.png" | ForEach-Object {
  $num = $_.BaseName.Replace("raw_","")
  magick "$($_.FullName)" -resize "$w15" -quality 80 "$Pages\$($num)@1.5x.webp"
}

Write-Host "==> Erzeuge @1x WEBP ($w1x px Breite)"
Get-ChildItem "$Pages\raw_*.png" | ForEach-Object {
  $num = $_.BaseName.Replace("raw_","")
  magick "$($_.FullName)" -resize "$w1x" -quality 80 "$Pages\$($num)@1x.webp"
}

# 6) Thumbnails (256 px) aus @1x
Write-Host "==> Erzeuge Thumbnails (256 px) aus @1x"
Get-ChildItem "$Pages\*@1x.webp" | Sort-Object Name | ForEach-Object {
  $num = $_.BaseName.Substring(0,4)
  magick "$($_.FullName)" -resize "256" -quality 80 "$Thumbs\$num.webp"
}

# 7) RAW-PNGs löschen
Write-Host "==> Entferne RAW-PNGs"
Remove-Item "$Pages\raw_*.png" -Force

# 8) Seiten zählen
$pagesCount = (Get-ChildItem "$Pages\*@1x.webp").Count
if ($pagesCount -eq 0) {
  Write-Error "Keine @1x-Seiten gefunden. Prüfe PDF-Pfad oder Poppler-Ausgabe."
}

# 9) Höhe @2x proportional
$scaledH = [math]::Round(($w2x / $rawW) * $rawH)

# 10) manifest.json schreiben
Write-Host "==> Erzeuge manifest.json"
$manifest = @{
  title = "SF History Book"
  pageCount = $pagesCount
  pageWidth = $w2x
  pageHeight = $scaledH
  pages = @()
  chapters = @()
}

$files1x = Get-ChildItem "$Pages\*@1x.webp" | Sort-Object Name
foreach ($f in $files1x) {
  $num = $f.BaseName.Substring(0,4)  # "0001"
  $entry = @{
    src    = "pages/$num@1x.webp"
    thumb  = "thumbs/$num.webp"
    srcset = @(
      @{ src = "pages/$num@1x.webp";   width = $w1x },
      @{ src = "pages/$num@1.5x.webp"; width = $w15 },
      @{ src = "pages/$num@2x.webp";   width = $w2x }
    )
  }
  $manifest.pages += $entry
}

$manifestPath = Join-Path $Base "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host "✅ Fertig:"
Write-Host "   - $pagesCount Seiten gebaut"
Write-Host "   - Manifest: $manifestPath"
