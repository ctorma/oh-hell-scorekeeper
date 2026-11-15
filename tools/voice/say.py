"""Synthesize lines with Kokoro. Usage: say.py lines.json outdir
lines.json: [{"id": "...", "text": "...", "voice": "af_heart", "speed": 1.05}]"""
import json, sys, os
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
k = Kokoro(os.path.join(here, 'kokoro-q8.onnx'), os.path.join(here, 'voices.bin'))
lines = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
for ln in lines:
    audio, sr = k.create(ln['text'], voice=ln.get('voice', 'af_heart'), speed=ln.get('speed', 1.0), lang='en-us')
    sf.write(os.path.join(out, ln['id'] + '.wav'), audio, sr)
    print(ln['id'], round(len(audio) / sr, 2), flush=True)
