import json,sys
from common import lines_for
L=lines_for(sys.argv[1],json.load(open("voices.json",encoding="utf-8")))
import os
os.makedirs("voice_ext",exist_ok=True)
for i in L:
    w=f"voice_ext/{i['key']}.wav"; t=f"voice_ext/{i['key']}.txt"
    if os.path.exists(w) and os.path.exists(t) and open(t,encoding="utf-8").read()!=i["text"]: os.remove(w)
    open(t,"w",encoding="utf-8").write(i["text"])
json.dump(L,open("lines.json","w",encoding="utf-8"),ensure_ascii=False,indent=1); print(len(L),"dòng thoại")
