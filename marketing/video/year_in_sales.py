"""Commish 2026: Your Year in Sales launch clip. 26s, 1080x1920, 30fps, 120 BPM.
Text is kept left (x 80 to 860) so TikTok's profile and action icons on the right never cover it."""
import math, os, sys, subprocess, json, functools
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/claude/promo')
import promo as P
R = P.R
W, H, FPS = P.W, P.H, P.FPS
INK, PINK, YEL = P.INK, P.PINK, P.YEL
k, kb, ease = P.k, P.kb, R.ease
LILAC = (140, 116, 255)

D = '/home/claude/yrvid/'
SH_ = D + 'shots/'
BTN = json.load(open(SH_ + 'btn.json'))
HIDE = json.load(open(SH_ + 'hide.json'))
TX, TMAX = 80, 860   # left text margin and right limit

@functools.lru_cache(None)
def shot(name):
    im = Image.open(SH_ + name + '.jpg').convert('RGB')
    return im.resize((P.SW, P.SH), Image.LANCZOS)

@functools.lru_cache(None)
def card(i, w=300):
    im = Image.open(SH_ + f'c{i}.png').convert('RGBA')
    im = im.resize((w, int(w * 16 / 9)), Image.LANCZOS)
    m = R.rr_mask(im.width, im.height, int(w * 0.07)); out = Image.new('RGBA', im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), m)
    return out

def fit(s, size, maxw, wght=800):
    while size > 30 and R.font(size, wght).getlength(s) > maxw: size -= 2
    return R.font(size, wght)

def caption(c, t, t0, text, y=300):
    """glass caption, left-aligned, clear of the right-hand icons"""
    a = k(t, t0, 0.25)
    if a <= 0: return c
    f = R.font(56); lines = R.wrap(text, f, TMAX - TX - 70)
    hgt = 66 + 68 * len(lines)
    yy = y - (1 - R.ease_out_back(min(1, (t - t0) / 0.35), 1.6)) * 60
    L = c.copy(); R.glass_card(L, (TX - 20, yy, TMAX, yy + hgt), r=42)
    d = ImageDraw.Draw(L)
    for i, ln in enumerate(lines): d.text((TX + 24, yy + 66 + i * 68), ln, font=f, fill=INK, anchor='lm')
    return Image.blend(c, L, a) if a < 1 else L

PX, PY, PZ = 470, 1090, 0.96     # phone sits left of centre
def scr_pt(fx, fy, cx=PX, cy=PY, z=PZ):
    sx = P.BZ + fx * P.PS; sy = P.BZ + fy * P.PS
    return cx + (sx - P.PW / 2) * z, cy + (sy - P.PHH / 2) * z

def tap(c, x, y, dt):
    if dt < -0.3 or dt > 0.6: return
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    if dt < 0:
        q = ease((dt + 0.3) / 0.3); r = 44 + 40 * (1 - q)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, int(150 * q)), outline=PINK + (int(255 * q),), width=7)
    else:
        q = dt / 0.6; r = 44 + 110 * ease(q)
        d.ellipse((x - r, y - r, x + r, y + r), outline=PINK + (int(255 * (1 - q)),), width=10)
        r2 = 44 * (1 - 0.4 * q); d.ellipse((x - r2, y - r2, x + r2, y + r2), fill=PINK + (int(200 * (1 - q)),))
    c.alpha_composite(L)

def swipe_dot(c, q):
    """finger swiping right to left across the phone"""
    if q <= 0 or q >= 1: return
    x0, y0 = scr_pt(330, 520); x1, _ = scr_pt(90, 520)
    x = x0 + (x1 - x0) * ease(q); a = math.sin(q * math.pi)
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    for j in range(6):
        xx = x + j * 22; r = 38 - j * 5
        d.ellipse((xx - r, y0 - r, xx + r, y0 + r), fill=(255, 255, 255, int(160 * a * (1 - j / 6))))
    d.ellipse((x - 38, y0 - 38, x + 38, y0 + 38), outline=PINK + (int(255 * a),), width=6)
    c.alpha_composite(L)

def slide(prev, nxt, q):
    """next story screen slides in from the right"""
    if q >= 1: return nxt
    y0, y1 = int(66 * P.PS), int(742 * P.PS)     # only the card area slides; the bars stay put
    out = nxt.copy(); off = int(P.SW * ease(q))
    mid = Image.new('RGB', (P.SW, y1 - y0), (18, 12, 43))
    mid.paste(prev.crop((off, y0, P.SW, y1)), (0, 0)); mid.paste(nxt.crop((0, y0, off, y1)), (P.SW - off, 0))
    out.paste(mid, (0, y0)); return out

def words(c, lt, items, x=TX):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for t0, s, y, size, col in items:
        p = kb(lt, t0, 0.3, 1.8)
        if p <= 0: continue
        L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        f = fit(s, int(size * (0.7 + 0.3 * min(1, p))), TMAX - x)
        d.text((x, y + (1 - min(p, 1)) * 50), s, font=f, fill=col, anchor='ls')
        P.fade_layer(layer, L, min(1, p * 2))
    c.alpha_composite(layer)

# story screens shown one per beat-second
STORY = [(8, 's1'), (9, 's2'), (10, 's3'), (11, 's4'), (12, 's5'), (13, 's6'), (14, 's7'), (15, 's8')]
SCENES = [('hook', 0, 2), ('hook2', 2, 4), ('logo', 4, 6), ('tap', 6, 8), ('story', 8, 16), ('hide', 16, 18),
          ('summary', 18, 20), ('save', 20, 23), ('end', 23, 26)]

def frame(t):
    c = P.bg(t)
    name = next((n for n, a, b in SCENES if a <= t < b), 'end')
    a0 = next(a for n, a, b in SCENES if n == name); lt = t - a0
    drift = math.sin(t * 1.3)

    if name == 'hook':
        words(c, lt, [(0.0, 'Every app gets', 860, 118, INK), (0.5, 'a year review.', 990, 118, INK)])
    elif name == 'hook2':
        words(c, lt, [(0.0, 'Now TikTok Shop', 860, 112, INK), (0.4, 'affiliates', 985, 112, INK), (0.8, 'get one too.', 1110, 112, PINK)])
        u = k(lt, 1.2, 0.35)
        if u > 0: ImageDraw.Draw(c).rounded_rectangle((TX, 1150, TX + 560 * u, 1172), 11, fill=INK)
    elif name == 'logo':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6); spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        R.logo(layer, 420, 720, int(150 * max(0.2, p)), spin)
        q = kb(lt, 0.45, 0.4, 1.8)
        if q > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 700 * q, 140 * q
            d.rounded_rectangle((TX + 10, 930 - ph / 2, TX + 10 + pw, 930 + ph / 2), int(ph / 2), fill=PINK, outline=INK, width=max(1, int(6 * q)))
            if q > 0.6: d.text((TX + 10 + pw / 2, 930), 'Your Year in Sales', font=R.font(int(68 * min(1, q))), fill=INK, anchor='mm')
            layer.alpha_composite(L)
        r = k(lt, 0.9, 0.3)
        if r > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            d.text((TX + 14, 1100 + (1 - r) * 30), 'Commish 2026. Free for everyone.', font=fit('Commish 2026. Free for everyone.', 52, TMAX - TX - 14, 700), fill=INK, anchor='ls')
            P.fade_layer(layer, L, r)
        c.alpha_composite(layer)
    elif name == 'tap':
        pin = kb(lt, 0.0, 0.5, 1.3)
        scr = shot('home') if lt < 1.45 else shot('s0')
        P.place(c, P.phone(scr, t), PX + (1 - pin) * 900, PY, PZ, ry=-6 + 3 * drift, rx=3)
        bx, by = scr_pt(BTN['x'] + BTN['width'] / 2, BTN['y'] + BTN['height'] / 2)
        tap(c, bx, by, lt - 1.2)
        c = caption(c, t, a0 + 0.2, 'Add your exports, then tap See my year')
    elif name == 'story':
        idx = int(lt); s_now = STORY[idx][1]; s_prev = 's0' if idx == 0 else STORY[idx - 1][1]
        q = (lt - idx) / 0.28
        P.place(c, P.phone(slide(shot(s_prev), shot(s_now), q), t), PX, PY, PZ, ry=-4 * drift, rx=2)
        swipe_dot(c, (lt - idx + 0.12) / 0.4)
        caps = ['Your total and best month', 'Your biggest day and top seller', 'Your top 5, and the videos behind them', 'Your streak and seller type']
        ci = min(3, int(lt // 2))
        c = caption(c, t, a0 + ci * 2 + 0.05, caps[ci])
    elif name == 'hide':
        scr = shot('s1') if lt < 0.75 else shot('s1h')
        P.place(c, P.phone(scr, t), PX, PY, PZ, ry=3 * drift, rx=2)
        hx, hy = scr_pt(HIDE['x'] + HIDE['width'] / 2, HIDE['y'] + HIDE['height'] / 2)
        tap(c, hx, hy, lt - 0.6)
        c = caption(c, t, a0 + 0.05, 'Rather keep your earnings private? Hide £')
    elif name == 'summary':
        z = PZ + 0.32 * k(lt, 0.1, 1.4)
        P.place(c, P.phone(shot('s9'), t), PX + 20 * k(lt, 0.1, 1.4), PY + 120 * k(lt, 0.1, 1.4), z, ry=-3 * drift, rx=2)
        c = caption(c, t, a0 + 0.05, 'And your whole year on one card')
    elif name == 'save':
        # cards fan out in a spread, one per beat-eighth
        n = 10; cx0, cy0 = 430, 1040
        for i in range(n):
            p = kb(lt, 0.1 + i * 0.12, 0.45, 1.5)
            if p <= 0: continue
            j = i - (n - 1) / 2
            ang = j * 5.2 * min(1, p); ox = j * 44 * min(1, p); oy = abs(j) ** 1.6 * 9 * min(1, p)
            im = card(i).rotate(-ang, resample=Image.BICUBIC, expand=True)
            s = 0.6 + 0.4 * min(1, p)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BICUBIC)
            sh = Image.new('RGBA', im.size, INK + (0,)); sh.putalpha(im.getchannel('A').point(lambda v: int(v * 0.35)))
            x, y = int(cx0 + ox - im.width / 2), int(cy0 + oy - im.height / 2)
            c.alpha_composite(sh, (x + 14, y + 24)); c.alpha_composite(im, (x, y))
        if lt > 1.7:
            q = kb(lt, 1.7, 0.4, 1.8); L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 600 * q, 120 * q
            d.rounded_rectangle((TX, 1430 - ph / 2, TX + pw, 1430 + ph / 2), int(ph / 2), fill=YEL, outline=INK, width=max(1, int(6 * q)))
            if q > 0.6: d.text((TX + pw / 2, 1430), 'Save all 10 cards', font=R.font(int(56 * min(1, q))), fill=INK, anchor='mm')
            c.alpha_composite(L)
        c = caption(c, t, a0 + 0.05, 'Save all 10 and post them to your Story')
    elif name == 'end':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6); spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        R.logo(layer, 400, 520, int(130 * max(0.2, p)), spin)
        q = k(lt, 0.25, 0.3)
        L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.text((TX, 760 + (1 - q) * 30), 'Get your', font=R.font(110), fill=INK, anchor='ls')
        d.text((TX, 880 + (1 - q) * 30), 'year in sales', font=fit('year in sales', 110, TMAX - TX), fill=PINK, anchor='ls')
        P.fade_layer(layer, L, q)
        r2 = kb(lt, 0.6, 0.45, 1.8)
        if r2 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 620 * r2, 146 * r2
            d.rounded_rectangle((TX, 1010 - ph / 2, TX + pw, 1010 + ph / 2), int(ph / 2), fill=INK)
            if r2 > 0.6: d.text((TX + pw / 2, 1010), 'commish.fyi', font=R.font(int(84 * min(1, r2))), fill=YEL, anchor='mm')
            layer.alpha_composite(L)
        s3 = k(lt, 1.0, 0.3)
        if s3 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            d.text((TX, 1170), 'Free. No sign-up needed.', font=R.font(50, 700), fill=INK, anchor='ls')
            d.text((TX, 1240), 'Your file never leaves your phone.', font=R.font(42, 600), fill=INK, anchor='ls')
            P.fade_layer(layer, L, s3)
        c.alpha_composite(layer)
    return c.convert('RGB')

def render_scene(args):
    name, a, b = args
    tmp = D + f'scenes/{name}.tmp.mp4'; out = D + f'scenes/{name}.mp4'
    n = int(round((b - a) * FPS))
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', tmp], stdin=subprocess.PIPE)
    for i in range(n): p.stdin.write(frame(a + i / FPS).tobytes())
    p.stdin.close()
    if p.wait() == 0: os.replace(tmp, out)
    return name

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        for ts in sys.argv[2:]: frame(float(ts)).save(f'/tmp/yv_{ts}.jpg', quality=88)
    else:
        from multiprocessing import Pool
        os.makedirs(D + 'scenes', exist_ok=True)
        todo = [s for s in SCENES if len(sys.argv) < 3 or s[0] in sys.argv[2:]]
        with Pool(2) as pool:
            for nm in pool.imap_unordered(render_scene, todo): print('done', nm, flush=True)
