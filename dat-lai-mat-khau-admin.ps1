# Dat lai tai khoan admin theo ADMIN_EMAIL / ADMIN_PASSWORD trong file .env (khi quen mat khau hoac bi khoa)
Set-Location $PSScriptRoot
Write-Host "== Dap Chuot: dat lai mat khau admin ==" -ForegroundColor Cyan

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop chua mo. Hay mo Docker Desktop, cho bao 'Engine running', roi bam dup lai file nay." -ForegroundColor Red
  return
}
if (-not (Test-Path .env)) {
  Write-Host "Chua co file .env. Hay bam dup CHAY-DOCKER.bat truoc." -ForegroundColor Red
  return
}

Write-Host "Dang cap nhat va khoi dong game (co the mat 1 phut)..."
"== $(Get-Date) dat lai admin ==" | Out-File docker.log -Encoding utf8
docker compose up -d --build 2>&1 | Out-File docker.log -Append -Encoding utf8
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 3
  $ps = docker compose ps --format "{{.Service}} {{.Status}}"
  if (($ps -match 'app .*\(healthy\)') -and ($ps -match 'db .*\(healthy\)')) { break }
}

$out = docker compose exec -T app node server/reset-admin.js 2>&1
$out | Out-File docker.log -Append -Encoding utf8
$out | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
  $envMap = @{}
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $envMap[$Matches[1]] = $Matches[2].Trim() }
  }
  Write-Host ""
  Write-Host "Mo trinh duyet:  http://localhost:3000/admin" -ForegroundColor Green
  Write-Host "Email:           $($envMap['ADMIN_EMAIL'])" -ForegroundColor Yellow
  Write-Host "Mat khau tam:    $($envMap['ADMIN_PASSWORD'])" -ForegroundColor Yellow
  try {
    Set-Clipboard -Value $envMap['ADMIN_PASSWORD']
    Write-Host "(Da copy mat khau: bam vao o Mat khau roi Ctrl+V)" -ForegroundColor Yellow
  } catch { }
  Write-Host "Dang nhap xong se phai dat mat khau moi." -ForegroundColor Green
} else {
  Write-Host "Chua dat lai duoc. Nhan cho Claude 'xong' de Claude doc file docker.log." -ForegroundColor Red
}
