"""Builds scene durations from the voiceover, an original cheerful backing track, and the final mix.
Writes ../oh-hell/video/durs.json and ../oh-hell/video/soundtrack.wav"""
import json, os, subprocess
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
VID = os.path.join(HERE, '..', 'video')
SR = 44100
BASE_D = [3.6, 6.2, 6.4, 6.6, 6.4, 4.6, 6.2, 6.2, 5.8, 5.8, 5.6, 6.8, 5.8, 6.4, 3.6]
LEAD, TAIL = 0.45, 0.6

# ---- voice ----
vo = []
for i in range(15):
    src = os.path.join(HERE, 'vo', f's{i+1:02d}.wav')
    dst = os.path.join(HERE, 'vo', f's{i+1:02d}_44.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-ar', str(SR), '-ac', '1', dst], check=True)
    a, _ = sf.read(dst, dtype='float32')
    vo.append(a)
durs = [round(max(b, LEAD + len(a) / SR + TAIL), 2) for b, a in zip(BASE_D, vo)]
json.dump(durs, open(os.path.join(VID, 'durs.json'), 'w'))
total = sum(durs)
N = int(total * SR) + SR
voice = np.zeros(N, np.float32)
t0 = 0.0
for d, a in zip(durs, vo):
    s = int((t0 + LEAD) * SR)
    voice[s:s + len(a)] += a
    t0 += d
voice /= max(1e-6, np.abs(voice).max())
voice *= 0.9

# ---- music: original ukulele-and-glockenspiel loop, C major, 116 bpm ----
BPM = 116.0
beat = 60.0 / BPM
rng = np.random.default_rng(3)
music = np.zeros(N, np.float32)
cache = {}

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

def pluck(freq, dur=1.4, bright=1.0):
    key = ('p', round(freq, 2), dur, bright)
    if key in cache: return cache[key]
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for k in range(1, 9):
        amp = (1 / k ** 1.3) * (bright if k > 2 else 1)
        out += amp * np.exp(-t * (2.2 + 1.6 * k)) * np.sin(2 * np.pi * freq * k * t + k)
    out *= np.minimum(1, t / 0.004)
    cache[key] = out.astype(np.float32); return cache[key]

def glock(freq, dur=1.6):
    key = ('g', round(freq, 2))
    if key in cache: return cache[key]
    t = np.arange(int(dur * SR)) / SR
    out = (np.sin(2*np.pi*freq*t) * np.exp(-t*2.6) + 0.35*np.sin(2*np.pi*freq*2.76*t)*np.exp(-t*6)
           + 0.15*np.sin(2*np.pi*freq*5.4*t)*np.exp(-t*11)) * np.minimum(1, t/0.002)
    cache[key] = out.astype(np.float32); return cache[key]

def bass(freq, dur):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 0.008) * np.exp(-t * 3.0) * np.minimum(1, (dur - t) / 0.03)
    return ((np.sin(2*np.pi*freq*t) + 0.3*np.sin(4*np.pi*freq*t)) * env).astype(np.float32)

def kick():
    if 'k' in cache: return cache['k']
    t = np.arange(int(0.25 * SR)) / SR
    f = 50 + 70 * np.exp(-t * 30)
    out = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    cache['k'] = out.astype(np.float32); return cache['k']

def shaker(level):
    t = np.arange(int(0.07 * SR)) / SR
    n = rng.standard_normal(len(t))
    n = np.diff(n, prepend=0)  # brighten
    return (n * np.exp(-t * 60) * np.minimum(1, t / 0.004) * level).astype(np.float32)

def snap():
    t = np.arange(int(0.12 * SR)) / SR
    n = np.diff(rng.standard_normal(len(t)), prepend=0)
    body = np.sin(2*np.pi*1800*t) * 0.3
    return ((n * 0.6 + body) * np.exp(-t * 38)).astype(np.float32)

def add(buf, sig, at, gain):
    s = int(at * SR)
    if s >= len(buf): return
    e = min(len(buf), s + len(sig))
    buf[s:e] += sig[:e - s] * gain

# progression: C  Am  F  G  |  C  Em  F  G  (one chord per bar)
CH = [[60,64,67,72],[57,64,69,72],[53,65,69,72],[55,62,67,71],[60,64,67,72],[59,64,67,71],[53,65,69,72],[55,62,67,71]]
ROOT = [36, 33, 41, 43, 36, 40, 41, 43]
# strum pattern in eighths: D . D U . U D U
STRUM = [(0,'D'),(1,'D'),(1.5,'U'),(2.5,'U'),(3,'D'),(3.5,'U')]
MEL = [(0,76),(0.5,79),(1,81),(2,79),(3,76),(3.5,74), (0,72),(1,76),(2,77),(3,76), (0,77),(0.5,76),(1,74),(2,72),(3,69), (0,71),(1,74),(2,79),(3.5,77)]
# melody per 4 bars as (bar offset, beat, midi)
mel_bars = [[(0,76),(0.5,79),(1,81),(2,79),(3,76)],[(0,72),(1,76),(2.5,74)],[(0,77),(0.5,76),(1,74),(2,72)],[(0,71),(1,74),(2,79)]]

bar = 4 * beat
nbars = int(total / bar) + 2
end_t = total - 0.2
for b in range(nbars):
    tb = b * bar
    if tb > end_t - bar * 0.5: break
    ci = b % 8
    chord = CH[ci]
    intro = b < 1
    for (bt, d) in STRUM:
        at = tb + bt * beat + (0.03 if bt % 1 else 0)  # gentle swing
        notes = chord if d == 'D' else chord[::-1]
        g = 0.20 if d == 'D' else 0.13
        for j, m in enumerate(notes):
            add(music, pluck(mtof(m), bright=0.8 if d == 'U' else 1.0), at + j * 0.011, g)
    if not intro:
        for (bt, m) in [(0, ROOT[ci]), (1.5, ROOT[ci] + 7), (2, ROOT[ci] + 12), (3, ROOT[ci] + 7)]:
            add(music, bass(mtof(m), beat * 0.9), tb + bt * beat, 0.32)
        for k in range(8):
            add(music, shaker(0.05 if k % 2 else 0.03), tb + k * beat / 2 + (0.03 if k % 2 else 0), 1)
        for k in (0, 2):
            add(music, kick(), tb + k * beat, 0.35)
        for k in (1, 3):
            add(music, snap(), tb + k * beat, 0.11)
    # glockenspiel motif on every other 4-bar phrase
    if (b // 4) % 2 == 1:
        for (bt, m) in mel_bars[b % 4]:
            add(music, glock(mtof(m)), tb + bt * beat, 0.16)

# final ringing chord
add(music, np.concatenate([pluck(mtof(m), dur=3.0) for m in [0]]) * 0, end_t, 0)
last = int(end_t // bar) * bar
for j, m in enumerate([48, 60, 64, 67, 72, 76]):
    add(music, pluck(mtof(m), dur=3.0), end_t - 1.6 + j * 0.02, 0.18)
add(music, glock(mtof(84)), end_t - 1.6, 0.2)

# simple room: two short echoes
for dly, g in ((0.071, 0.25), (0.137, 0.15)):
    d = int(dly * SR)
    music[d:] += music[:-d] * g

music /= max(1e-6, np.abs(music).max())

# ---- ducking: music sits under the voice ----
env = np.abs(voice)
win = int(0.05 * SR)
env = np.convolve(env, np.ones(win) / win, mode='same')
speaking = (env > 0.01).astype(np.float32)
# smooth with attack ~80ms, release ~400ms
sm = np.zeros_like(speaking)
a_up, a_dn = 1 / (0.08 * SR), 1 / (0.4 * SR)
# vectorized-ish smoothing at 1 kHz control rate
step = SR // 1000
ctrl = speaking[::step]
out = np.zeros_like(ctrl); v = 0.0
for i, x in enumerate(ctrl):
    v += (x - v) * (0.08 if x > v else 0.0025 * 1)
    out[i] = v
duck = np.repeat(out, step)[:N]
duck = np.pad(duck, (0, N - len(duck)), mode='edge')
mgain = 0.8 * (0.30 - 0.19 * duck)   # music 20% quieter than v1

t = np.arange(N) / SR
fade = np.clip(t / 0.8, 0, 1) * np.clip((total + 0.2 - t) / 1.5, 0, 1)
mix = voice + music * mgain * fade
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = mix[:int(total * SR)]
sf.write(os.path.join(VID, 'soundtrack.wav'), mix, SR)
print('total', round(total, 2), 'durs', durs)
