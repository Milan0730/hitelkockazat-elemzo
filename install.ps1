# Asztali parancsikon létrehozása / eltávolítása a Hitelkockázat-elemzőhöz.
# A parancsikon a Windowsba beépített Microsoft Edge (ha nincs, Google Chrome) „alkalmazás módjában”
# nyitja meg a helyi index.html-t: saját ablak, címsor és böngészőfelület nélkül, internet nélkül is.
# Nem telepít semmit, nem ír a rendszerbe: csak két .lnk fájlt hoz létre (Asztal + Start menü).
#
# Használat:  dupla kattintás a Telepites.cmd-re   (vagy: powershell -ExecutionPolicy Bypass -File install.ps1)
# Eltávolítás: dupla kattintás az Eltavolitas.cmd-re (vagy: ... install.ps1 -Uninstall)
# Próba:       ... install.ps1 -DryRun   (csak kiírja, mit csinálna)
param([switch]$Uninstall, [switch]$DryRun)
$ErrorActionPreference = "Stop"

$appName = "Hitelkockázat-elemző"
$root    = $PSScriptRoot
$index   = Join-Path $root "index.html"
$icon    = Join-Path $root "icons\app.ico"

function Get-ShortcutPaths {
  $desktop  = [Environment]::GetFolderPath("Desktop")    # OneDrive-ra átirányított Asztalt is kezeli
  $programs = [Environment]::GetFolderPath("Programs")   # Start menü\Programok (csak ennek a felhasználónak)
  @($desktop, $programs) | Where-Object { $_ } | ForEach-Object { Join-Path $_ "$appName.lnk" }
}

function Find-Browser {
  # 1) a Windows „App Paths” regisztrációja, 2) szokásos telepítési helyek. Edge előnyben (minden Windows 10/11-en ott van).
  foreach ($exe in @("msedge.exe", "chrome.exe")) {
    foreach ($hive in @("HKCU:", "HKLM:")) {
      try {
        $p = (Get-ItemProperty -Path "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exe" -ErrorAction Stop)."(default)"
        if ($p -and (Test-Path $p)) { return $p }
      } catch { }
    }
  }
  $candidates = @(
    @(${env:ProgramFiles(x86)}, "Microsoft\Edge\Application\msedge.exe"),
    @($env:ProgramFiles,        "Microsoft\Edge\Application\msedge.exe"),
    @($env:ProgramFiles,        "Google\Chrome\Application\chrome.exe"),
    @(${env:ProgramFiles(x86)}, "Google\Chrome\Application\chrome.exe"),
    @($env:LOCALAPPDATA,        "Google\Chrome\Application\chrome.exe")
  )
  foreach ($c in $candidates) {
    if (-not $c[0]) { continue }            # pl. 32 bites rendszeren nincs ProgramFiles(x86)
    $p = Join-Path $c[0] $c[1]
    if (Test-Path $p) { return $p }
  }
  return $null
}

$links = Get-ShortcutPaths

if ($Uninstall) {
  foreach ($l in $links) {
    if (Test-Path $l) {
      if ($DryRun) { Write-Host "[próba] törölném: $l" } else { Remove-Item $l; Write-Host "Törölve: $l" }
    }
  }
  Write-Host "Kész. Az alkalmazás mappája és adatai érintetlenek maradtak." -ForegroundColor Green
  exit 0
}

if (-not (Test-Path $index)) { throw "Nem találom az index.html-t itt: $root" }
$browser = Find-Browser
if (-not $browser) { throw "Nem találtam Microsoft Edge-et vagy Google Chrome-ot. Telepítsd valamelyiket, majd futtasd újra." }

$url  = ([Uri]::new($index, [UriKind]::Absolute)).AbsoluteUri          # file:///C:/.../index.html (ékezetek, szóközök kódolva)
$appArgs = "--app=`"$url`""

Write-Host ""
Write-Host "  Böngésző:   $browser"
Write-Host "  Alkalmazás: $url"
Write-Host ""

if ($DryRun) {
  foreach ($l in $links) { Write-Host "[próba] létrehoznám: $l" }
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
foreach ($l in $links) {
  $lnk = $shell.CreateShortcut($l)
  $lnk.TargetPath       = $browser
  $lnk.Arguments        = $appArgs
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation     = "$icon,0"
  $lnk.Description      = "Hitelkockázat-elemző — PD-becslés, magyarázat és minta-portfólió"
  $lnk.Save()
  Write-Host "Létrehozva: $l" -ForegroundColor Green
}
Write-Host ""
Write-Host "Kész! Indítsd az Asztalon vagy a Start menüben lévő „$appName” ikonnal." -ForegroundColor Green
Write-Host "Tipp: az ikonra jobb gombbal → „Rögzítés a tálcán”."
