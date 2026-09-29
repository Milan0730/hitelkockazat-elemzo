# Minimális helyi fejlesztői webszerver (Python/Node nélkül).
# Legegyszerűbb: dupla kattintás az Inditas.cmd-re (app) vagy a Tesztek_futtatasa.cmd-re.
# Kézzel:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080] [-Open] [-Test]
#   -Open  a böngészőben megnyitja az appot, amint a szerver elindult
#   -Test  az automatizált tesztekkel nyitja meg (?selftest)
# Ha a port foglalt, a következő szabadot választja (legfeljebb +19).
param([int]$Port = 8080, [switch]$Open, [switch]$Test)

$root = $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".md" = "text/markdown; charset=utf-8"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
  ".woff" = "font/woff"; ".woff2" = "font/woff2"; ".webmanifest" = "application/manifest+json"; ".txt" = "text/plain; charset=utf-8"
}

# Első szabad port keresése
$listener = $null
$first = $Port
for ($p = $first; $p -lt $first + 20; $p++) {
  $candidate = New-Object System.Net.HttpListener
  $candidate.Prefixes.Add("http://localhost:$p/")
  try { $candidate.Start(); $listener = $candidate; $Port = $p; break }
  catch { $candidate.Close() }
}
if (-not $listener) {
  Write-Host "Nem találtam szabad portot ($first-$($first + 19)). Zárd be a másik szervert, vagy adj meg mást: -Port 9000" -ForegroundColor Red
  exit 1
}

$url = "http://localhost:$Port/"
if ($Test) { $url = $url + "?selftest" }
Write-Host ""
Write-Host "  Hitelkockázat-elemző fut:  $url" -ForegroundColor Green
Write-Host "  Leállítás: zárd be ezt az ablakot (vagy Ctrl+C)."
Write-Host ""
if ($Open) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($rel -eq "") { $rel = "index.html" }
      $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
      # csak a projektmappán belüli fájlokat szolgáljuk ki (path traversal ellen)
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
        $res.StatusCode = 404; $bytes = [Text.Encoding]::UTF8.GetBytes("404")
      } else {
        $ext = [IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Cache-Control", "no-store")
        $bytes = [IO.File]::ReadAllBytes($full)
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("{0} {1} {2}" -f $res.StatusCode, $ctx.Request.HttpMethod, $ctx.Request.Url.PathAndQuery)
    } catch {
      Write-Host "Hiba: $_"
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
