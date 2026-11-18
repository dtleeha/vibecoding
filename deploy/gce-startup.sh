#!/bin/bash
# =============================================================================
# Cài đặt và khởi động Đập Chuột trên máy ảo Google Compute Engine (Debian).
# Máy ảo tự chạy file này mỗi lần khởi động (startup script). Chạy lại nhiều lần
# vẫn an toàn: bước nào đã làm rồi thì bỏ qua.
#   - 2 GB swap
#   - Docker + Compose, Git, tự cập nhật bảo mật
#   - Lấy code từ GitHub vào /opt/dapchuot (chỉ lần đầu)
#   - Tạo .env với mật khẩu ngẫu nhiên (chỉ lần đầu)
#   - docker compose up (kèm docker-compose.prod.yml: Caddy + HTTPS, giới hạn RAM)
# Tên miền lấy từ metadata "domain" của máy ảo.
# Theo dõi: Console → VM → Serial port 1, tìm các dòng "DAPCHUOT:".
# =============================================================================
set -euo pipefail

REPO="https://github.com/dtleeha/vibecoding.git"
DIR="/opt/dapchuot"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
say() { echo "DAPCHUOT: $*"; }

meta() {
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true
}

DOMAIN="$(meta domain)"
if [ -z "$DOMAIN" ]; then say "LOI: thieu metadata 'domain'"; exit 1; fi
say "bat dau (domain=$DOMAIN)"

# 1. Swap 2 GB
if ! swapon --show | grep -q /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
  sysctl --system > /dev/null
fi
say "swap: $(swapon --show --noheadings | awk '{print $3}' | head -1)"

# 2. Docker, Git, tự cập nhật bảo mật
if ! command -v docker > /dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git unattended-upgrades
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  echo 'APT::Periodic::Update-Package-Lists "1";'  > /etc/apt/apt.conf.d/20auto-upgrades
  echo 'APT::Periodic::Unattended-Upgrade "1";'   >> /etc/apt/apt.conf.d/20auto-upgrades
  systemctl enable --now docker
fi
say "$(docker compose version)"

# 3. Lấy code (chỉ lần đầu; cập nhật code về sau làm bằng tay: git pull)
if [ ! -d "$DIR/.git" ]; then
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
say "code: $(git log --oneline -1)"

# 4. File .env (chỉ lần đầu)
if [ ! -f .env ]; then
  umask 077
  ADMIN_PW="$(openssl rand -hex 8)"
  cat > .env << ENV
# Tao tu dong boi deploy/gce-startup.sh - KHONG dua len GitHub
POSTGRES_USER=dapchuot
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=dapchuot
ADMIN_EMAIL=admin@$DOMAIN
ADMIN_PASSWORD=$ADMIN_PW
ADMIN_NAME=Quan tri vien
DOMAIN=$DOMAIN
ENV
  chmod 600 .env
  say "da tao .env. Email admin: admin@$DOMAIN"
  say "MAT KHAU ADMIN TAM (doi ngay lan dang nhap dau): $ADMIN_PW"
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
fi

# 5. Khởi động
say "dang build va khoi dong (lan dau 3-8 phut)..."
$COMPOSE up -d --build
for i in $(seq 1 60); do
  if $COMPOSE ps --format '{{.Service}} {{.Status}}' | grep -q 'app .*(healthy)'; then break; fi
  sleep 5
done
$COMPOSE ps --format '{{.Service}}: {{.Status}}' | while read -r l; do say "$l"; done
say "RAM: $(free -m | awk '/Mem:/{print $3"/"$2" MB"}'), swap: $(free -m | awk '/Swap:/{print $3"/"$2" MB"}'), dia: $(df -h / | awk 'NR==2{print $3"/"$2}')"
say "XONG - mo https://$DOMAIN"
