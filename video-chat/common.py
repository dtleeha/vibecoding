import json,re
NORM=[("???","hả hả hả"),("...",""),("45cm","bốn lăm xăng ti mét"),("cm"," xăng ti mét")]
def norm(t):
    for a,b in NORM: t=t.replace(a,b)
    return t.strip()
def load_script(path):
    if path.endswith(".json"): return json.load(open(path,encoding="utf-8"))
    vids=[];cur=None;sc=None
    for raw in open(path,encoding="utf-8"):
        l=raw.rstrip("\n")
        if not l.strip() or l.startswith("#"): continue
        if l.startswith("=="):
            p=[x.strip() for x in l[2:].split("|")]; cur={"id":p[0],"title":p[1] if len(p)>1 else p[0],"scenes":[]}; vids.append(cur); continue
        if l.startswith("--"):
            p=[x.strip() for x in l[2:].split("|")]; k=p[0]; p+=[""]*10
            if k=="chat":
                sc={"poster":p[1],"time":p[2],"contact":p[3],"dark":p[4]=="dark","caption":p[5],"pair":p[6] or "F1M1","color":"#9a1427","msgs":[],"vo":""}
            elif k=="meme":
                sc={"meme":True,"file":p[1],"text":p[2],"ss":float(p[3] or 1),"dur":float(p[4] or 1.6),"green":p[5]!="0","vol":float(p[6] or 0.5)}
            elif k=="product":
                sc={"product":True,"name":p[1],"note":p[2] or "Giỏ hàng ở góc trái video 👈","img":p[3],"vo":""}
            cur["scenes"].append(sc); continue
        m=re.match(r"^(a|b):\s*(.*)$",l)
        if m: sc["msgs"].append(["in" if m.group(1)=="a" else "out",m.group(2)]); continue
        if l.startswith("vo:"): sc["vo"]=l[3:].strip()
    return vids
def lines_for(path,voices):
    L=[]
    for v in load_script(path):
        for i,s in enumerate(v["scenes"]):
            if s.get("meme"): continue
            if s.get("product"): L.append({"key":f"{v['id']}_{i}_vo","voice":voices["narr"],"text":s["vo"]}); continue
            pr=s.get("pair","F1M1"); vm={"in":voices[pr[:2]],"out":voices[pr[2:]]}
            for j,(k,t) in enumerate(s["msgs"]):
                if not t.startswith("IMG:"): L.append({"key":f"{v['id']}_{i}_{j}","voice":vm[k],"text":norm(t)})
    return L
