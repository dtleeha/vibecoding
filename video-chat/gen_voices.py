"""Tạo giọng VieNeu-TTS cho video chat. Đọc lines.json + voices.json, ghi voice_ext/<key>.wav (mono 44.1kHz)."""
import json, os, subprocess, sys, unicodedata
from vieneu import Vieneu
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "voice_ext"); os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(HERE, "lines.json"), encoding="utf-8"))
def flat(s): return unicodedata.normalize("NFD", s.replace("đ","d").replace("Đ","D")).encode("ascii","ignore").decode().lower().strip()
tts = Vieneu()
catalog = tts.list_preset_voices()
print("Giọng có sẵn:", catalog)
cache = {}
def voice_for(name):
    if name in cache: return cache[name]
    try: v = tts.get_preset_voice(name)
    except Exception:
        v = None
        for desc, vid in catalog:
            if flat(name) in flat(str(desc)) or flat(name) in flat(str(vid)):
                v = tts.get_preset_voice(vid); break
        if v is None: sys.exit(f"Không tìm thấy giọng '{name}'. Sửa voices.json theo danh sách giọng in ở trên.")
    cache[name] = v; return v
bad = 0
for it in lines:
    out = os.path.join(OUT, it["key"] + ".wav")
    if os.path.exists(out): continue
    try:
        audio = tts.infer(text=it["text"], voice=voice_for(it["voice"]))
        tmp = os.path.join(OUT, "_tmp.wav"); tts.save(audio, tmp)
        import shutil
        try: subprocess.run(["ffmpeg","-y","-loglevel","error","-i",tmp,"-ac","1","-ar","44100",out], check=True)
        except Exception: shutil.copy(tmp,out)
        print("ok", it["key"])
    except Exception as e:
        bad += 1; print("LỖI", it["key"], e)
if os.path.exists(os.path.join(OUT, "_tmp.wav")): os.remove(os.path.join(OUT, "_tmp.wav"))
print("xong, lỗi:", bad); sys.exit(1 if bad else 0)
