# Chay game Dap Chuot bang Docker: tao .env (neu chua co), build, cho khoi dong, ghi log vao docker.log
Set-Location $PSScriptRoot
Write-Host "== Dap Chuot: dang khoi dong bang Docker ==" -ForegroundColor Cyan

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop chua mo hoac chua san sang. Hay mo Docker Desktop, cho bao 'Engine running', roi bam dup lai file nay." -ForegroundColor Red
  "LOI: Docker Desktop chua chay ($(Get-Date))" | Out-File docker.log -Encoding utf8
  return
}

if (-not (Test-Path .env)) {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  function NewPw([int]$n) {
    $b = New-Object byte[] $n
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $chars[$_ % $chars.Length] })
  }
  $adminPw = NewPw 16
  $lines = @(
    '# File nay chua mat khau - KHONG dua len GitHub.',
    'POSTGRES_USER=dapchuot',
    "POSTGRES_PASSWORD=$(NewPw 32)",
    'POSTGRES_DB=dapchuot',
    'ADMIN_EMAIL=admin@dapchuot.local',
    "ADMIN_PASSWORD=$adminPw",
    'ADMIN_NAME=Quan tri vien'
  )
  [IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), $lines)
  Write-Host ""
  Write-Host "Da tao file .env." -ForegroundColor Yellow
  Write-Host "Email admin:        admin@dapchuot.local" -ForegroundColor Yellow
  Write-Host "Mat khau admin tam: $adminPw" -ForegroundColor Yellow
  Write-Host "(Ghi lai mat khau nay. Cung xem duoc trong file .env, dong ADMIN_PASSWORD.)" -ForegroundColor Yellow
  Write-Host ""
}

Write-Host "Dang build va khoi dong (lan dau mat 1-3 phut)..."
"== $(Get-Date) ==" | Out-File docker.log -Encoding utf8
docker compose up -d --build 2>&1 | Out-File docker.log -Append -Encoding utf8

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 3
  $ps = docker compose ps --format "{{.Service}} {{.Status}}"
  if (($ps -match 'app .*\(healthy\)') -and ($ps -match 'db .*\(healthy\)')) { $ok = $true; break }
}
"== docker compose ps ==" | Out-File docker.log -Append -Encoding utf8
docker compose ps 2>&1 | Out-File docker.log -Append -Encoding utf8
"== docker compose logs ==" | Out-File docker.log -Append -Encoding utf8
docker compose logs --tail 60 app db 2>&1 | Out-File docker.log -Append -Encoding utf8

if ($ok) {
  Write-Host ""
  Write-Host "XONG! Game:        http://localhost:3000" -ForegroundColor Green
  Write-Host "      Trang admin: http://localhost:3000/admin" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Chua khoi dong duoc. Hay nhan cho Claude 'xong' de Claude doc file docker.log." -ForegroundColor Red
}
