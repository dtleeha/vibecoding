#!/bin/bash
# Dùng: ./make.sh scripts/ten.txt   (chạy trong thư mục video-chat; cần products/ + MEME_DIR)
set -e; cd "$(dirname "$0")"; S="$1"
python3 prep_lines.py "$S" >/dev/null
need=$(python3 -c "
import json,os;print(sum(1 for i in json.load(open('lines.json')) if not os.path.exists('voice_ext/'+i['key']+'.wav')))")
if [ "$need" -gt 0 ]; then
  echo "Thiếu $need file giọng, nhờ GitHub tạo..."
  git add -A . ../.github; git commit -qm "voices for $S" || true
  git push -q origin HEAD; git diff HEAD~1 --quiet -- lines.json voices.json gen_voices.py && gh workflow run video-voices.yml --ref "$(git branch --show-current)" >/dev/null; sha=$(git rev-parse HEAD); br=$(git branch --show-current); id=""
  for i in $(seq 1 20); do id=$(gh run list --branch "$br" --limit 8 --json databaseId,headSha -q ".[]|select(.headSha==\"$sha\")|.databaseId"|head -1); [ -n "$id" ] && break; sleep 6; done
  gh run watch "$id" --exit-status >/dev/null || true
  git pull -q --rebase origin "$br"
fi
python3 build.py "$S"
