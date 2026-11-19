"""30s deep-house groove, 120 BPM, 15 bars. Synthesised from scratch (no samples)."""
import numpy as np, wave

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 15
N = int(SR * BARS * BAR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(7)

def env(n, a, d, s, r, sus_len):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sl = max(int(sus_len * SR) - a - d, 0)
    e = np.concatenate([np.linspace(0, 1, a, False), np.linspace(1, s, d, False), np.full(sl, s), np.linspace(s, 0, r)])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))

def add(buf, sig, start):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]

def midi(m):
    return 440 * 2 ** ((m - 69) / 12)

# ---------- drums ----------
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 6.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return np.tanh((s + click) * 1.6) * 0.95

def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(6) / 6, 'same')
    return hp * np.exp(-t * (18 if open_ else 90)) * (0.22 if open_ else 0.16)

def clap():
    n = int(0.3 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    bp = noise - np.convolve(noise, np.ones(14) / 14, 'same')
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        k = int(off * SR); e[k:] += np.exp(-(t[: n - k]) * 30)
    return bp * e * 0.18

def shaker():
    n = int(0.07 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(3) / 3, 'same')
    return hp * np.sin(np.pi * t / t[-1]) * 0.05

K, H, HO, C, SH = kick(), hat(), hat(True), clap(), shaker()

drums = np.zeros(N)
for bar in range(BARS):
    b0 = bar * BAR
    intro = bar < 1
    outro = bar >= BARS - 1
    for beat in range(4):
        tb = b0 + beat * BEAT
        if not intro:
            add(drums, K, tb)
        add(drums, HO if not intro else H * 0.6, tb + BEAT / 2)
        if not intro and beat in (1, 3):
            add(drums, C, tb)
        for s in range(4):
            if not intro:
                add(drums, SH * (1.2 if s % 2 else 0.7), tb + s * BEAT / 4)
    if bar in (6, 13):  # little fill
        for k in range(4):
            add(drums, C * 0.6, b0 + 3 * BEAT + k * BEAT / 4)

# ---------- sidechain envelope ----------
side = np.ones(N)
for bar in range(1, BARS):
    for beat in range(4):
        i = int((bar * BAR + beat * BEAT) * SR)
        n = int(BEAT * SR)
        tt = np.arange(n) / SR
        seg = 1 - 0.65 * np.exp(-tt * 9)
        j = min(N, i + n)
        side[i:j] = np.minimum(side[i:j], seg[: j - i])

# ---------- chords: Am9 - Fmaj9 - Cmaj9 - G6/9 (swanky minor house) ----------
prog = [
    [57, 60, 64, 67, 71],  # Am9  (A C E G B)
    [53, 57, 60, 64, 67],  # Fmaj9 (F A C E G)
    [48, 55, 59, 62, 64],  # Cmaj9 (C G B D E)
    [55, 59, 62, 64, 69],  # G6/9 (G B D E A)
]
bass_roots = [45, 41, 36, 43]

def epiano(freq, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 1.0 * t) * 1.2 * np.exp(-t * 3)
    s = np.sin(2 * np.pi * freq * t + mod)
    s += 0.25 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 4)
    s *= env(n, 0.005, 0.6, 0.45, 0.4, dur)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 5 * t)
    return s * trem * vel

def pad(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(np.sign(np.sin(2 * np.pi * freq * (1 + d) * t + p)) for d, p in ((-0.004, 0), (0.0, 1.3), (0.005, 2.1)))
    # soften: one-pole low pass
    out = np.zeros(n); a = 0.04; y = 0.0
    for k in range(0, n):
        y += a * (s[k] - y); out[k] = y
    return out * env(n, 0.4, 0.5, 0.8, 0.6, dur) * 0.05

chords = np.zeros(N)
pads = np.zeros(N)
for bar in range(BARS):
    ch = prog[bar % 4]
    b0 = bar * BAR
    # stabs: syncopated house rhythm (in 8ths): 0, 1.5, 3, 5.5 ...
    for pos in (0, 1.5, 2.5, 3.5) if bar >= 1 else (0,):
        for m in ch[1:]:
            add(chords, epiano(midi(m), BEAT * 0.9, 0.11), b0 + pos * BEAT)
    if bar >= 2:
        for m in ch[:4]:
            add(pads, pad(midi(m + 12), BAR), b0)

# ---------- bass ----------
def bass_note(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.12 * np.sin(2 * np.pi * freq * 3 * t)
    return np.tanh(s * 1.4) * env(n, 0.004, 0.15, 0.7, 0.05, dur) * 0.32

bass = np.zeros(N)
pattern = [(0.5, 0, 0.45), (1.5, 0, 0.35), (2.0, 12, 0.25), (2.5, 0, 0.45), (3.5, 7, 0.4)]
for bar in range(2, BARS - 1):
    r = bass_roots[bar % 4]
    for pos, iv, d in pattern:
        add(bass, bass_note(midi(r + iv), d), bar * BAR + pos * BEAT)

# ---------- sparkle arp ----------
def pluck(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 9) + 0.3 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 14)
    return s * 0.07

arp = np.zeros(N)
for bar in range(4, BARS - 1):
    ch = prog[bar % 4]
    notes = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12]
    for k in range(16):
        if k % 3 == 0 or k % 4 == 2:
            add(arp, pluck(midi(notes[k % 4]), 0.4), bar * BAR + k * BEAT / 4)

# simple stereo echo for arp + keys
def echo(x, delay, fb, mix):
    d = int(delay * SR); y = x.copy()
    for k in range(1, 4):
        y[d * k:] += x[: -d * k] * (fb ** k)
    return x * (1 - mix) + y * mix

chords = echo(chords, BEAT * 0.75, 0.35, 0.4)
arp = echo(arp, BEAT * 0.75, 0.45, 0.5)

# riser into the drop at bar 1 and final sweep
riser = np.zeros(N)
n = int(BAR * SR); t = np.arange(n) / SR
nz = rng.standard_normal(n)
nz = nz - np.convolve(nz, np.ones(4) / 4, 'same')
add(riser, nz * (t / t[-1]) ** 2 * 0.12, 0)

drums *= 0.55; chords *= 1.5; pads *= 1.3; arp *= 1.8; bass *= 0.9
mixL = drums + bass + (chords + pads) * side + arp * side + riser
mixR = drums + bass + (chords * 0.9 + pads) * side + np.roll(arp, int(0.012 * SR)) * side + riser

# master: gentle fade in/out, normalise to about -1 dBFS peak, soft clip
fade = np.ones(N)
fi, fo = int(0.05 * SR), int(1.8 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[-fo:] = np.linspace(1, 0, fo)
st = np.stack([mixL, mixR], 1) * fade[:, None]
for nm,x in [("drums",drums),("bass",bass),("chords",chords*side),("pads",pads*side),("arp",arp*side)]: print(nm, round(float(np.sqrt((x[int(4*SR):int(26*SR)]**2).mean())),4))
st = np.tanh(st * 1.1)
st /= np.abs(st).max() / 0.89
pcm = (st * 32767).astype(np.int16)
with wave.open('/home/claude/promo/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('done', N / SR, 's')
