from common import *
import json,sys,os,re,wave,subprocess,glob,html,base64
from playwright.sync_api import sync_playwright
W,H=1080,1920
SPEED=float(os.environ.get("VOICE_SPEED","1.3"))
FONT="'Inter','DejaVu Sans',sans-serif"
def sh(c): subprocess.run(c,shell=True,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def dur(f):
    return float(subprocess.check_output(f"ffprobe -v error -show_entries format=duration -of csv=p=0 {f}",shell=True))
def imgsrc(n):
    p=glob.glob(f"products/{n}.*")[0]; return "file://"+os.path.abspath(p)
def snow():
    import random;random.seed(3)
    return "".join(f'<i style="left:{random.randint(0,1080)}px;top:{random.randint(0,1920)}px;width:{(s:=random.randint(5,12))}px;height:{s}px"></i>' for _ in range(40))
BASE=f"""<style>*{{box-sizing:border-box;margin:0}}body{{width:{W}px;height:{H}px;overflow:hidden;font-family:{FONT};position:relative}}
i{{position:absolute;background:#fff;border-radius:50%;opacity:.55}}</style>"""
def chat_html(s):
    dark=s.get("dark"); col=s["color"]
    card="#1d1d22" if dark else "#f6f1ea"; inb="#3a3a42" if dark else "#ffffff"; tx="#fff" if dark else "#222"
    out="#e8456b"
    rows=""
    for k,t in s["msgs"]:
        side="flex-end" if k=="out" else "flex-start"
        if t.startswith("IMG:"):
            rows+=f'<div style="display:flex;flex:none;justify-content:{side}"><div style="background:{out if k=="out" else inb};padding:10px;border-radius:34px"><img src="{imgsrc(t[4:])}" style="width:380px;height:340px;object-fit:cover;object-position:center 30%;border-radius:26px;display:block"></div></div>'
        else:
            rows+=f'<div style="display:flex;flex:none;justify-content:{side}"><div style="max-width:760px;font-size:50px;line-height:1.3;padding:20px 34px;border-radius:40px;background:{out if k=="out" else inb};color:{"#fff" if k=="out" else tx}">{html.escape(t)}</div></div>'
    return f"""<html><body style="background:{col}">{BASE}{snow()}
<div style="position:absolute;top:70px;left:0;right:0;text-align:center;color:#fff;font-weight:900;font-size:68px;letter-spacing:2px;padding:0 60px;line-height:1.2">{html.escape(s['poster'])}</div>
<div style="position:absolute;top:270px;left:50px;width:980px;height:1330px;background:{card};border-radius:60px;box-shadow:0 20px 60px #0007;display:flex;flex-direction:column;overflow:hidden">
 <div style="height:120px;display:flex;align-items:center;padding:0 40px;gap:24px;border-bottom:2px solid #8883;flex:none"><div style="width:72px;height:72px;border-radius:50%;background:{out}"></div><div style="font-size:46px;font-weight:800;color:{tx}">{html.escape(s['contact'])}</div><div style="margin-left:auto;font-size:34px;color:#999">{s['time']}</div></div>
 <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:22px;padding:30px 36px">{rows}</div></div>
<div style="position:absolute;bottom:130px;left:0;right:0;text-align:center;color:#fff;font-size:60px;font-weight:900;padding:0 60px">{html.escape(s['caption'])}</div></body></html>"""
def prod_html(s):
    return f"""<html><body style="background:#9a1427">{BASE}{snow()}
<div style="position:absolute;top:150px;left:110px;width:860px;height:1080px;background:#fff;border-radius:60px;padding:24px;box-shadow:0 20px 60px #0007"><img src="{imgsrc(s['img'].split('.')[0])}" style="width:100%;height:100%;object-fit:cover;object-position:center;border-radius:40px"></div>
<div style="position:absolute;top:1290px;left:0;right:0;text-align:center;color:#fff;font-size:68px;font-weight:900;padding:0 60px;line-height:1.2">{html.escape(s['name'])}</div>
<div style="position:absolute;top:1510px;left:120px;right:120px;text-align:center;background:#ffd34d;color:#7a0f20;font-size:54px;font-weight:900;padding:26px;border-radius:50px">{html.escape(s['note'].replace('👈','◀'))}</div></body></html>"""
def meme_html(s):
    u=imgsrc(s['file'].split('.')[0]) if False else "file://"+os.path.abspath("memes/"+s['file'] if os.path.exists("memes/"+s['file']) else "products/"+s['file'])
    t=f'<div style="position:absolute;bottom:170px;left:30px;right:30px;text-align:center;color:#fff;font-size:92px;font-weight:900;line-height:1.15;-webkit-text-stroke:3px #000;paint-order:stroke fill;text-shadow:0 6px 0 #000">{html.escape(s["text"])}</div>' if s.get("text") else ""
    return f"""<html><body style="background:#000">{BASE}
<img src="{u}" style="position:absolute;inset:-60px;width:1200px;height:2040px;object-fit:cover;filter:blur(40px) brightness(.55)">
<img src="{u}" style="position:absolute;top:260px;left:90px;width:900px;height:1400px;object-fit:contain;border-radius:40px">{t}</body></html>"""
# TTS
VOICE=None;CFG=None
def piper_voice():  # giọng dự phòng offline, chỉ nạp khi thiếu voice_ext
    global VOICE,CFG
    if VOICE is None:
        from piper import PiperVoice
        try:
            from piper import SynthesisConfig; CFG=SynthesisConfig(length_scale=1.1)
        except Exception: CFG=None
        VOICE=PiperVoice.load(glob.glob("vits-piper-vi_VN-vais1000-medium/*.onnx")[0])
    return VOICE
def tts(vo,out):
    sents=[x.strip() for x in re.split(r'(?<=[.!?])\s+',vo) if x.strip()]
    parts=[]
    for i,s in enumerate(sents):
        p=f"audio/_{os.path.basename(out)}_{i}.wav"
        w=wave.open(p,"wb")
        piper_voice().synthesize_wav(s,w,syn_config=CFG) if CFG else piper_voice().synthesize_wav(s,w)
        w.close(); parts.append(p)
    sh(f"ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=22050:cl=mono -t 0.25 audio/_sil.wav")
    lst="".join(f"file '{os.path.abspath(p)}'\nfile '{os.path.abspath('audio/_sil.wav')}'\n" for p in parts)
    open("audio/_l.txt","w").write(lst)
    sh(f"ffmpeg -y -loglevel error -f concat -safe 0 -i audio/_l.txt -af 'asetrate=22050*1.16,aresample=44100,atempo=0.9,equalizer=f=3500:t=q:w=1:g=3,equalizer=f=180:t=q:w=1:g=-3' {out}")
    return sents

NORM=[("???","hả hả hả"),("...",""),("45cm","bốn lăm xăng ti mét"),("cm"," xăng ti mét")]
def norm(t):
    for a,b in NORM: t=t.replace(a,b)
    return t.strip()
VF={"in":"asetrate=22050*1.2,aresample=44100,atempo=0.86,equalizer=f=3500:t=q:w=1:g=3,equalizer=f=180:t=q:w=1:g=-3",
    "out":"asetrate=22050*0.93,aresample=44100,atempo=1.08,equalizer=f=200:t=q:w=1:g=2"}
def say(text,spk,out,key=None):
    if key and os.path.exists(f"voice_ext/{key}.wav"):
        sh(f"ffmpeg -y -loglevel error -i voice_ext/{key}.wav -ac 1 -ar 44100 -af atempo={SPEED} {out}"); return
    w=wave.open("audio/_raw.wav","wb")
    piper_voice().synthesize_wav(norm(text),w,syn_config=CFG) if CFG else piper_voice().synthesize_wav(norm(text),w)
    w.close()
    sh(f"ffmpeg -y -loglevel error -i audio/_raw.wav -af '{VF[spk]}' -ar 44100 -ac 1 {out}")
def mksfx():
    if os.path.exists("audio/sfx_in.wav"): return
    G=lambda e,d,o: sh(f"ffmpeg -y -loglevel error -f lavfi -i \"aevalsrc='{e}':d={d}:s=44100\" -ac 1 audio/{o}.wav")
    G("0.55*sin(2*PI*1046*t)*exp(-14*t)+0.45*sin(2*PI*1568*max(t-0.08,0))*exp(-14*max(t-0.08,0))*gte(t,0.08)",0.35,"sfx_in")
    G("0.6*sin(2*PI*(450+1500*t)*t)*exp(-16*t)",0.22,"sfx_out")
    G("(2*random(0)-1)*0.5*exp(-70*t)+(2*random(1)-1)*0.5*exp(-70*max(t-0.07,0))*gte(t,0.07)",0.2,"sfx_img")

def chat_scene(i,s,vid):
    segs=[];wavs=[];lines=[];t=0.0
    sh("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.3 audio/_s03.wav")
    sh("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.35 audio/_s035.wav")
    sh("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.6 audio/_s06.wav")
    sh("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.12 audio/_s012.wav")
    mksfx(); sfxs=[]
    sh("ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 1.0 audio/_s10.wav")
    wavs.append("audio/_s03.wav"); t=0.3
    n=len(s["msgs"])
    for j,(k,txt) in enumerate(s["msgs"]):
        sub=dict(s); sub["msgs"]=s["msgs"][:j+1]
        png=f"audio/{vid}_{i}_{j}.png"
        open("tmp.html","w").write(chat_html(sub)); PG.goto("file://"+os.path.abspath("tmp.html")); PG.wait_for_timeout(250); PG.screenshot(path=png)
        sfxs.append((t,"img" if txt.startswith("IMG:") else k))
        if txt.startswith("IMG:"):
            wavs.append("audio/_s10.wav"); d=1.0
        else:
            a=f"audio/{vid}_{i}_{j}.wav"; say(txt,k,a,key=f"{vid}_{i}_{j}")
            gap="audio/_s06.wav" if j==n-1 else "audio/_s035.wav"
            wavs+= ["audio/_s012.wav",a,gap]; d=dur(a)+0.12+(0.6 if j==n-1 else 0.35)
            lines.append((t+0.12,t+0.12+dur(a),txt))
        if j==0: d+=0.3
        segs.append((png,d)); t+=d if j>0 else d-0.3
    open("audio/_l.txt","w").write("".join(f"file '{os.path.abspath(p)}'\n" for p in wavs))
    a=f"audio/{vid}_{i}.wav"
    sh(f"ffmpeg -y -loglevel error -f concat -safe 0 -i audio/_l.txt -c copy audio/{vid}_{i}_v.wav")
    tot=dur(f"audio/{vid}_{i}_v.wav")
    ins=" ".join(f"-i audio/sfx_{ {"in":"in","out":"out","img":"img"}[n_] }.wav" for _,n_ in sfxs)
    fc="".join(f"[{q+1}:a]adelay={int(tt*1000)}|{int(tt*1000)},volume=0.4[x{q}];" for q,(tt,_) in enumerate(sfxs))
    fc+="[0:a]"+"".join(f"[x{q}]" for q in range(len(sfxs)))+f"amix=inputs={len(sfxs)+1}:normalize=0:duration=first[sx]"
    sh(f"ffmpeg -y -loglevel error -i audio/{vid}_{i}_v.wav {ins} -filter_complex \"{fc}\" -map '[sx]' -ar 44100 -ac 1 {a}")
    mp=[]
    for j,(png,d) in enumerate(segs):
        o=f"audio/{vid}_{i}_{j}.mp4"
        sh(f"ffmpeg -y -loglevel error -loop 1 -i {png} -t {d:.3f} -vf format=yuv420p -r 30 -c:v libx264 -preset veryfast -crf 20 {o}"); mp.append(o)
    open("audio/_v.txt","w").write("".join(f"file '{os.path.abspath(p)}'\n" for p in mp))
    clip=f"audio/{vid}_{i}_scene.mp4"
    sh(f"ffmpeg -y -loglevel error -f concat -safe 0 -i audio/_v.txt -c copy {clip}")
    return clip,dur(clip),a,lines

MD=os.environ.get("MEME_DIR","/home/claude/memezip/MEME").rstrip("/")+"/"
def meme_clip(s,vid,i):
    src=MD+s["file"]; d=s.get("dur",1.6); ss=s.get("ss",1.0)
    ov=f"audio/{vid}_{i}_txt.png"
    t=f'<div style="position:absolute;bottom:200px;left:30px;right:30px;text-align:center;color:#fff;font-size:92px;font-weight:900;line-height:1.15;-webkit-text-stroke:3px #000;paint-order:stroke fill;text-shadow:0 6px 0 #000">{html.escape(s["text"])}</div>' if s.get("text") else ""
    open("tmp.html","w").write(f"<html><body style='background:transparent'>{BASE.replace('overflow:hidden','overflow:hidden;background:transparent')}{t}</body></html>")
    PG.goto("file://"+os.path.abspath("tmp.html")); PG.wait_for_timeout(300); PG.screenshot(path=ov,omit_background=True)
    out=f"audio/{vid}_{i}_meme.mp4"
    if s.get("green"):
        fc="[0:v]chromakey=0x00ff00:0.18:0.1,despill=type=green,scale=1000:1500:force_original_aspect_ratio=decrease[fg];[1:v][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[b];[b][2:v]overlay=0:0,format=yuv420p[o]"
        sh(f"ffmpeg -y -loglevel error -ss {ss} -t {d} -i \"{src}\" -f lavfi -i color=c=0x9a1427:s=1080x1920:r=30 -i {ov} -filter_complex \"{fc}\" -map '[o]' -t {d} -r 30 -c:v libx264 -preset veryfast -crf 20 {out}")
    else:
        fc="[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40,eq=brightness=-0.25[bg];[b]scale=1000:1500:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[x];[x][1:v]overlay=0:0,format=yuv420p[o]"
        sh(f"ffmpeg -y -loglevel error -ss {ss} -t {d} -i \"{src}\" -i {ov} -filter_complex \"{fc}\" -map '[o]' -t {d} -r 30 -c:v libx264 -preset veryfast -crf 20 {out}")
    wav=f"audio/{vid}_{i}_meme.wav"
    r=subprocess.run(f"ffmpeg -y -loglevel error -ss {ss} -t {d} -i \"{src}\" -vn -ac 1 -ar 44100 -af 'volume={s.get('vol',0.5)},afade=t=out:st={d-0.2}:d=0.2' {wav}",shell=True)
    return out,(wav if r.returncode==0 and os.path.exists(wav) else None)

def main(script):
    ids=None
    for d_ in ("audio","out2","voice_ext"): os.makedirs(d_,exist_ok=True)
    data=load_script(script)
    global PG
    pw=sync_playwright().start(); br=pw.chromium.launch(); pg=br.new_page(viewport={"width":W,"height":H}); PG=pg
    for v in data:
        if ids and v["id"] not in ids: continue
        vid=v["id"]; clips=[]; info=[]
        for i,s in enumerate(v["scenes"]):
            png=f"audio/{vid}_{i}.png"
            if s.get("meme"):
                clip,wav=meme_clip(s,vid,i)
                info.append((png,s.get("dur",1.6),wav,[],True,clip))
            elif s.get("product"):
                open("tmp.html","w").write(prod_html(s)); pg.goto("file://"+os.path.abspath("tmp.html")); pg.wait_for_timeout(400); pg.screenshot(path=png)
                a=f"audio/{vid}_{i}.wav"
                if os.path.exists(f"voice_ext/{vid}_{i}_vo.wav"):
                    sh(f"ffmpeg -y -loglevel error -i voice_ext/{vid}_{i}_vo.wav -ac 1 -ar 44100 -af atempo={SPEED} {a}"); sents=[x.strip() for x in re.split(r"(?<=[.!?])\s+",s["vo"]) if x.strip()]
                else: sents=tts(s["vo"],a)
                ad=dur(a); tot=sum(len(x) for x in sents); t0=0.0; ln=[]
                for x in sents:
                    l=ad*len(x)/tot; ln.append((t0,t0+l-0.2,x)); t0+=l
                info.append((png,max(3,ad+0.3+0.45+0.5),a,ln,False,None))
            else:
                clip,d,a,ln=chat_scene(i,s,vid)
                info.append((png,d,a,ln,False,clip))
        T=0.18; starts=[];t=0
        for k,(png,d,a,sents,m,clip) in enumerate(info):
            starts.append(t); t+=d-T
        total=t+T
        for k,(png,d,a,sents,m,clip) in enumerate(info):
            if clip: sh(f"cp {clip} audio/{vid}_{k}.mp4"); continue
            z="min(zoom+0.0006,1.06)" if m else "min(zoom+0.0003,1.04)"
            sh(f"ffmpeg -y -loglevel error -loop 1 -i {png} -vf \"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(d*30)+2}:s={W}x{H}:fps=30,format=yuv420p\" -t {d} -c:v libx264 -preset veryfast -crf 20 audio/{vid}_{k}.mp4")
        inp=" ".join(f"-i audio/{vid}_{k}.mp4" for k in range(len(info)))
        fc="";prev="[0:v]";cum=0
        tr=["fade","smoothup","fade","circleopen"]
        for k in range(1,len(info)):
            cum+=info[k-1][1]-T; fc+=f"{prev}[{k}:v]xfade=transition={tr[(k-1)%4]}:duration={T}:offset={cum-T+T-T if False else starts[k]}[v{k}];"; prev=f"[v{k}]"
        # audio
        ai=[];af=""
        for k,(png,d,a,sents,m,clip) in enumerate(info):
            if a: ai.append((k,a))
        ain=" ".join(f"-i {a}" for k,a in ai); n=len(info)
        for j,(k,a) in enumerate(ai):
            ms=int((starts[k]+(0.0 if not info[k][5] is None else 0.35))*1000); af+=f"[{n+j}:a]adelay={ms}|{ms}[a{j}];"
        af+="".join(f"[a{j}]" for j in range(len(ai)))+f"amix=inputs={len(ai)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.89[aout]"
        sh(f"ffmpeg -y -loglevel error {inp} {ain} -filter_complex \"{fc}{af}\" -map '{prev}' -map '[aout]' -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart out2/{vid}.mp4")
        # srt
        def ts(x): h=int(x//3600);m=int(x%3600//60);s=x%60;return f"{h:02d}:{m:02d}:{int(s):02d},{int((s%1)*1000):03d}"
        srt="";c=1
        for k,(png,d,a,sents,m,clip) in enumerate(info):
            if not a: continue
            for (x0,x1,x) in sents:
                st=starts[k]+(0 if clip else 0.35)+x0; srt+=f"{c}\n{ts(st)} --> {ts(starts[k]+(0 if clip else 0.35)+x1)}\n{x}\n\n"; c+=1
        open(f"out2/{vid}.srt","w").write(srt)
        print(vid,"total",round(total,1),[round(i[1],1) for i in info])
    br.close();pw.stop()
main(sys.argv[1])
