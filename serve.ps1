# Minimális helyi fejlesztői webszerver (Python/Node nélkül).
# Használat:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
# Majd:       http://localhost:8080/            (app)
#             http://localhost:8080/?selftest   (automatizált tesztek)
param([int]$Port = 8080)

$root = $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".md" = "text/markdown; charset=utf-8"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Kiszolgálás: http://localhost:$Port/  (gyökér: $root)  — leállítás: Ctrl+C"
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
