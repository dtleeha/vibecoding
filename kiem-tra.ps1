# Kiem tra nhanh (chi doc, khong sua du lieu): trang thai container + so nguoi choi trong database
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$log = Join-Path $PSScriptRoot 'kiem-tra.log'
"== $(Get-Date) ==" | Out-File $log -Encoding utf8
function Log($t) { $t | Out-File $log -Append -Encoding utf8; $t | ForEach-Object { Write-Host $_ } }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Log "LOI: Docker Desktop chua chay."; return }

Log "== 1. Khoi dong container (docker compose up -d) =="
Log (docker compose up -d 2>&1)
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep 3
  $ps = docker compose ps --format "{{.Service}} {{.Status}}"
  if (($ps -match 'app .*\(healthy\)') -and ($ps -match 'db .*\(healthy\)')) { break }
}
Log "== Trang thai =="
Log (docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>&1)

Log "== 3. Bang nguoi choi (players) =="
$sql = @"
SELECT count(*) AS so_dong FROM players;
SELECT full_name AS ho_ten, email, phone AS sdt,
       to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS ngay_dang_ky
  FROM players ORDER BY created_at DESC LIMIT 3;
SELECT count(*) AS so_luot_choi FROM rounds;
"@
Log ($sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off' 2>&1)

Log "== Log app (20 dong cuoi) =="
Log (docker compose logs --tail 20 app 2>&1)
Log "== XONG =="
