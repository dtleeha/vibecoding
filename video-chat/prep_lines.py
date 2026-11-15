import json,sys
from common import lines_for
L=lines_for(sys.argv[1],json.load(open("voices.json",encoding="utf-8")))
json.dump(L,open("lines.json","w",encoding="utf-8"),ensure_ascii=False,indent=1); print(len(L),"dòng thoại")
