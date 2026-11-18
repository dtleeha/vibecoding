#!/bin/bash
# Tạo hạ tầng Google Cloud (Free Tier) cho game Đập Chuột.
# Chạy trong Cloud Shell:  bash gcp-setup.sh
# Chạy lại nhiều lần vẫn an toàn: cái gì đã có thì bỏ qua.
set -u

DOMAIN="${DOMAIN:-game.dingdang.io.vn}"
REGION=us-central1
ZONE=us-central1-a
COMMIT=2e8fc366e09addb490c44181e3e8280e0d2509f9
STARTUP_URL="https://raw.githubusercontent.com/dtleeha/vibecoding/$COMMIT/deploy/gce-startup.sh"
STATE="$HOME/.dapchuot-project"

say() { echo "== $*"; }
fail() { echo "!! LOI: $*"; exit 1; }

say "1/8 Tai khoan thanh toan"
BILLING=$(gcloud billing accounts list --filter=open=true --format='value(name)' | head -1)
BILLING=${BILLING#billingAccounts/}
[ -n "$BILLING" ] || fail "khong thay tai khoan thanh toan dang mo"
echo "   billing: $BILLING"

say "2/8 Kiem tra may e2-micro co san (gio mien phi dung chung)"
for p in $(gcloud projects list --format='value(projectId)'); do
  gcloud --quiet compute instances list --project "$p" \
    --format='value(name,zone.basename(),machineType.basename())' 2>/dev/null \
    | sed "s/^/   [$p] /"
done

say "3/8 Project"
if [ -s "$STATE" ]; then
  PROJECT=$(cat "$STATE")
else
  PROJECT="dap-chuot-$(date +%y%m%d)$((RANDOM % 900 + 100))"
  gcloud projects create "$PROJECT" --name=dap-chuot || fail "tao project"
  echo "$PROJECT" > "$STATE"
fi
echo "   project: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null 2>&1
gcloud billing projects link "$PROJECT" --billing-account="$BILLING" >/dev/null || fail "gan thanh toan"

say "4/8 Bat API (mat 1-2 phut)"
gcloud services enable compute.googleapis.com billingbudgets.googleapis.com || fail "bat API"
gcloud config set compute/region $REGION >/dev/null 2>&1
gcloud config set compute/zone $ZONE >/dev/null 2>&1

say "5/8 IP tinh"
if ! gcloud compute addresses describe dapchuot-ip --region=$REGION >/dev/null 2>&1; then
  gcloud compute addresses create dapchuot-ip --region=$REGION --network-tier=PREMIUM || fail "tao IP"
fi
IP=$(gcloud compute addresses describe dapchuot-ip --region=$REGION --format='value(address)')
echo "   IP: $IP"

say "6/8 Tuong lua"
gcloud compute firewall-rules describe allow-http >/dev/null 2>&1 || \
  gcloud compute firewall-rules create allow-http --network=default --allow=tcp:80 \
    --target-tags=http-server --source-ranges=0.0.0.0/0 >/dev/null
gcloud compute firewall-rules describe allow-https >/dev/null 2>&1 || \
  gcloud compute firewall-rules create allow-https --network=default --allow=tcp:443 \
    --target-tags=https-server --source-ranges=0.0.0.0/0 >/dev/null
# SSH chi qua Google (IAP), dong RDP
gcloud compute firewall-rules update default-allow-ssh --source-ranges=35.235.240.0/20 >/dev/null 2>&1
gcloud --quiet compute firewall-rules delete default-allow-rdp >/dev/null 2>&1
gcloud compute firewall-rules list --format='table(name,sourceRanges.list(),allowed[].map().firewall_rule().list())'

say "7/8 May ao e2-micro"
if ! gcloud compute instances describe dapchuot-vm --zone=$ZONE >/dev/null 2>&1; then
  cat > /tmp/dapchuot-startup.sh <<EOF
#!/bin/bash
curl -fsSL $STARTUP_URL -o /root/gce-startup.sh && bash /root/gce-startup.sh
EOF
  gcloud compute instances create dapchuot-vm --zone=$ZONE \
    --machine-type=e2-micro \
    --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --address="$IP" --network-tier=PREMIUM \
    --tags=http-server,https-server \
    --metadata=domain="$DOMAIN" \
    --metadata-from-file=startup-script=/tmp/dapchuot-startup.sh || fail "tao may ao"
fi
gcloud compute instances list --format='table(name,zone.basename(),machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP)'

say "8/8 Canh bao ngan sach"
if ! gcloud billing budgets list --billing-account="$BILLING" --format='value(displayName)' 2>/dev/null | grep -qx dapchuot; then
  CUR=$(gcloud billing accounts describe "$BILLING" --format='value(currencyCode)' 2>/dev/null)
  [ "$CUR" = "VND" ] && AMT=25000VND || AMT=1USD
  gcloud billing budgets create --billing-account="$BILLING" --display-name=dapchuot \
    --budget-amount="$AMT" --filter-projects="projects/$PROJECT" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
    >/dev/null && echo "   da tao ngan sach $AMT" || echo "   (chua tao duoc ngan sach - lam tay sau)"
else
  echo "   ngan sach da co"
fi

echo
echo "XONG. DOMAIN=$DOMAIN  IP=$IP  PROJECT=$PROJECT"
