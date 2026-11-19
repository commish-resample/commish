"""Commish 30s TikTok promo. 1080x1920, 30fps, beat-synced to 120 BPM music."""
import math, os, sys, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, '/home/claude/video')
import render as R
R.FONT = '/home/claude/video/bricolage.ttf'

W, H, FPS = 1080, 1920, 30
INK, PINK, YEL, PAID = R.INK, R.PINK, R.YEL, R.PAID
SHOTS = '/home/claude/promo/shots/'
ease, back = R.ease, R.ease_out_back

def k(t, a, d):
    return ease((t - a) / d)

def kb(t, a, d, s=1.4):
    return back((t - a) / d, s) if t > a else 0.0

# ---------------- source images ----------------
SW = 540                       # phone screen width (px)
SH = int(SW * 844 / 390)       # 1169
PS = SW / 390                  # css px -> screen px
LW, LH = 880, 550              # laptop screen
LS = LW / 1440

@functools.lru_cache(None)
def phone_src(name):
    im = Image.open(SHOTS + f'phone-{name}.jpg').convert('RGB')
    return im.resize((SW, int(im.height * SW / im.width)), Image.LANCZOS)

@functools.lru_cache(None)
def lap_src(name):
    im = Image.open(SHOTS + f'laptop-{name}.jpg').convert('RGB')
    return im.resize((LW, int(im.height * LW / im.width)), Image.LANCZOS)

# ---------------- devices ----------------
BZ = 20
PW, PHH = SW + 2 * BZ, SH + 2 * BZ
SCREEN_MASK = R.rr_mask(SW, SH, 62)

@functools.lru_cache(None)
def phone_bezel():
    im = Image.new('RGBA', (PW, PHH), (0, 0, 0, 0))
    im.paste(Image.new('RGBA', (PW, PHH), INK + (255,)), (0, 0), R.rr_mask(PW, PHH, 80))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((2, 2, PW - 3, PHH - 3), 78, outline=(255, 255, 255, 110), width=3)
    for y0, y1 in [(230, 300), (330, 430), (450, 550)]:
        d.rounded_rectangle((-1, y0, 5, y1), 3, fill=(60, 50, 110, 255))
    return im

def screen_from(src, scroll_css, extra=None):
    y = int(round(scroll_css * PS))
    y = max(0, min(y, src.height - SH))
    return src.crop((0, y, SW, y + SH))

def phone(screen, t):
    ph = phone_bezel().copy()
    scr = screen.convert('RGBA')
    sheen = Image.new('RGBA', (SW, SH), (255, 255, 255, 0))
    sheen.putalpha(R.sheen(t).resize((SW, SH)))
    scr.alpha_composite(sheen)
    ph.paste(scr, (BZ, BZ), SCREEN_MASK)
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle((PW / 2 - 60, BZ + 12, PW / 2 + 60, BZ + 46), 17, fill=(8, 6, 18, 255))
    return ph

LBZ = 18
LBW, LBH = LW + 2 * LBZ, LH + 2 * LBZ
BASE_H = 34
LPW, LPH = LBW + 120, LBH + BASE_H

@functools.lru_cache(None)
def laptop_frame():
    im = Image.new('RGBA', (LPW, LPH), (0, 0, 0, 0))
    lid = Image.new('RGBA', (LBW, LBH), INK + (255,))
    im.paste(lid, (60, 0), R.rr_mask(LBW, LBH, 28))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((61, 1, 60 + LBW - 2, LBH - 2), 27, outline=(255, 255, 255, 100), width=3)
    # base
    d.rounded_rectangle((0, LBH - 2, LPW - 1, LPH - 1), 16, fill=(43, 34, 87, 255))
    d.rounded_rectangle((0, LBH - 2, LPW - 1, LBH + 8), 6, fill=(70, 58, 130, 255))
    d.rounded_rectangle((LPW / 2 - 80, LBH - 2, LPW / 2 + 80, LBH + 10), 6, fill=(28, 22, 60, 255))
    d.ellipse((60 + LBW / 2 - 4, 6, 60 + LBW / 2 + 4, 14), fill=(60, 50, 110, 255))
    return im

LSCREEN_MASK = R.rr_mask(LW, LH, 10)

def laptop(src, scroll_css, t):
    lp = laptop_frame().copy()
    y = int(round(scroll_css * LS)); y = max(0, min(y, src.height - LH))
    scr = src.crop((0, y, LW, y + LH)).convert('RGBA')
    sheen = Image.new('RGBA', (LW, LH), (255, 255, 255, 0))
    sheen.putalpha(R.sheen(t * 0.8).resize((LW, LH)).point(lambda v: int(v * 0.7)))
    scr.alpha_composite(sheen)
    lp.paste(scr, (60 + LBZ, LBZ), LSCREEN_MASK)
    return lp

def place(canvas, layer, cx, cy, scale, ry=0.0, rx=0.0, shadow=0.42):
    w, h = layer.size
    dst = R.project(w, h, cx, cy, scale, math.radians(ry), math.radians(rx), f=2600)
    co = R.homography([(0, 0), (w, 0), (w, h), (0, h)], dst)
    warped = layer.transform((W, H), Image.PERSPECTIVE, tuple(co), Image.BICUBIC)
    if shadow:
        a = warped.getchannel('A').resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6)).resize((W, H), Image.BILINEAR)
        sh = Image.new('RGBA', (W, H), INK + (0,)); sh.putalpha(a.point(lambda v: int(v * shadow)))
        canvas.alpha_composite(sh, (int(24 * scale), int(44 * scale)))
    canvas.alpha_composite(warped)

# ---------------- text ----------------
def text_center(layer, y, s, size, fill=INK, wght=800):
    d = ImageDraw.Draw(layer)
    d.text((W / 2, y), s, font=R.font(size, wght), fill=fill, anchor='mm')

def fade_layer(canvas, layer, a):
    if a <= 0: return
    if a < 1:
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * a)))
    canvas.alpha_composite(layer)

def caption(canvas, t, t0, text, y=300):
    """glass caption card that drops in at t0"""
    a = k(t, t0, 0.25)
    if a <= 0: return canvas
    f = R.font(58)
    lines = R.wrap(text, f, 860)
    hgt = 70 + 70 * len(lines)
    yy = y - (1 - back((t - t0) / 0.35, 1.6)) * 60
    box = (W / 2 - 480, yy, W / 2 + 480, yy + hgt)
    layer = canvas.copy()
    R.glass_card(layer, box, r=44)
    d = ImageDraw.Draw(layer)
    for i, ln in enumerate(lines):
        d.text((W / 2, yy + 70 + i * 70), ln, font=f, fill=INK, anchor='mm')
    return Image.blend(canvas, layer, a) if a < 1 else layer

def doc_icon(size):
    im = Image.new('RGBA', (size, int(size * 1.25)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w, h = size, int(size * 1.25)
    d.rounded_rectangle((4, 4, w - 4, h - 4), int(size * 0.12), fill=YEL + (255,), outline=INK + (255,), width=int(size * 0.06))
    for i in range(3):
        y = h * (0.38 + i * 0.14)
        d.rounded_rectangle((w * 0.22, y, w * (0.78 if i < 2 else 0.6), y + size * 0.06), 4, fill=INK + (255,))
    r = size * 0.24
    cx, cy = w * 0.8, h * 0.82
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PINK + (255,), outline=INK + (255,), width=int(size * 0.05))
    d.text((cx, cy + 2), '£', font=R.font(int(r * 1.2)), fill=INK, anchor='mm')
    return im

def padlock(size):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    s = size
    d.rounded_rectangle((s * 0.18, s * 0.45, s * 0.82, s * 0.95), int(s * 0.1), fill=INK + (255,))
    d.arc((s * 0.28, s * 0.08, s * 0.72, s * 0.62), 180, 360, fill=INK + (255,), width=int(s * 0.09))
    d.line((s * 0.28 + s * 0.045, s * 0.35, s * 0.28 + s * 0.045, s * 0.47), fill=INK + (255,), width=int(s * 0.09))
    d.line((s * 0.72 - s * 0.045, s * 0.35, s * 0.72 - s * 0.045, s * 0.47), fill=INK + (255,), width=int(s * 0.09))
    d.ellipse((s * 0.44, s * 0.6, s * 0.56, s * 0.72), fill=YEL + (255,))
    d.rounded_rectangle((s * 0.475, s * 0.66, s * 0.525, s * 0.82), 3, fill=YEL + (255,))
    return im

# ---------------- scenes (absolute times) ----------------
SCENES = [
    ('hook', 0.0, 2.0), ('logo', 2.0, 4.0), ('devices', 4.0, 8.0), ('drop', 8.0, 10.0),
    ('paid', 10.0, 12.0), ('pending', 12.0, 14.0), ('insights', 14.0, 16.0), ('shops', 16.0, 18.0),
    ('videos', 18.0, 20.0), ('tax', 20.0, 22.0), ('montage', 22.0, 24.0), ('privacy', 24.0, 26.0), ('end', 26.0, 30.0),
]

def bg(t):
    b = R.background(t)
    # beat pulse: brief brighten on each beat after the drop
    if t >= 2.0:
        ph = (t % 0.5) / 0.5
        a = int(28 * max(0, 1 - ph * 4))
        if a:
            b.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, a)))
    return b

def frame(t):
    c = bg(t)
    name = next(n for n, a, b in SCENES if a <= t < b) if t < 30 else 'end'
    a0 = next(a for n, a, b in SCENES if n == name)
    lt = t - a0
    drift = math.sin(t * 1.3)

    if name == 'hook':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        words = [(0.0, 'Do you know', 760, 104, INK), (0.5, 'what TikTok Shop', 880, 104, INK), (1.0, 'actually', 1000, 104, INK), (1.25, 'paid you?', 1120, 130, INK)]
        for t0, s, y, size, col in words:
            p = kb(lt, t0, 0.3, 1.8)
            if p <= 0: continue
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            text_center(L, y + (1 - min(p, 1)) * 60, s, int(size * (0.6 + 0.4 * p)), col)
            fade_layer(layer, L, min(1, p * 2))
        # pink underline swipe under 'paid you?'
        u = k(lt, 1.5, 0.3)
        if u > 0:
            d = ImageDraw.Draw(layer)
            d.rounded_rectangle((W / 2 - 280, 1196, W / 2 - 280 + 560 * u, 1218), 11, fill=PINK)
        c.alpha_composite(layer)

    elif name == 'logo':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6)
        spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        size = int(190 * max(0.2, p))
        R.logo(layer, W / 2, 860, size, spin)
        q = k(lt, 0.55, 0.3)
        if q > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            text_center(L, 1080 + (1 - q) * 30, 'Your TikTok Shop commission,', 58, INK, 700)
            text_center(L, 1155 + (1 - q) * 30, 'made clear', 58, INK, 700)
            fade_layer(layer, L, q)
        c.alpha_composite(layer)

    elif name == 'devices':
        lp_in = kb(lt, 0.0, 0.6, 1.2)
        scroll = 700 * k(lt, 2.4, 1.4)
        lap = laptop(lap_src('home-full'), scroll, t)
        place(c, lap, W / 2 + 40 + (1 - lp_in) * 900, 980 + 10 * drift, 0.98, ry=-8 + 3 * drift, rx=4)
        ph_in = kb(lt, 1.0, 0.55, 1.3)
        if ph_in > 0:
            scr = screen_from(phone_src('home-full'), 552 * k(lt, 2.6, 1.3))
            place(c, phone(scr, t), 300 - (1 - ph_in) * 700, 1330, 0.58, ry=10 - 3 * drift, rx=2)
        c = caption(c, t, a0 + 0.3, 'Works on your phone and your laptop')

    elif name == 'drop':
        swap = k(lt, 1.45, 0.3)
        scr = phone_src('upload').crop((0, 0, SW, SH))
        if swap > 0:
            scr = Image.blend(scr, screen_from(phone_src('home-full'), 0), swap)
        pin = kb(lt, 0.0, 0.45, 1.3)
        place(c, phone(scr, t), W / 2, 1150 + (1 - pin) * 1000, 1.0, ry=-6 * drift, rx=3)
        # falling file
        fd = lt - 0.6
        if 0 <= fd < 1.0:
            yy = 300 + 820 * min(1, (fd / 0.45) ** 2)
            if fd > 0.45:
                yy = 1120 - 90 * math.sin(min(1, (fd - 0.45) / 0.3) * math.pi) * math.exp(-(fd - 0.45) * 4)
            ic = doc_icon(170).rotate(-12 + 12 * min(1, fd / 0.45), resample=Image.BICUBIC, expand=True)
            al = 1 - k(fd, 0.75, 0.2)
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); L.alpha_composite(ic, (int(W / 2 - ic.width / 2), int(yy - ic.height / 2)))
            fade_layer(c, L, al)
        if 1.2 <= lt < 1.6:
            # sparkle burst where the file lands
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            q = (lt - 1.2) / 0.4
            for i in range(10):
                ang = i * math.pi / 5
                r0, r1 = 120 + 160 * q, 150 + 200 * q
                d.line((W / 2 + r0 * math.cos(ang), 1120 + r0 * math.sin(ang), W / 2 + r1 * math.cos(ang), 1120 + r1 * math.sin(ang)), fill=PINK + (int(255 * (1 - q)),), width=10)
            c.alpha_composite(L)
        c = caption(c, t, a0 + 0.1, 'Drop in your TikTok Shop export')

    elif name == 'paid':
        z = k(lt, 0.0, 1.6)
        scale = 1.0 + 0.55 * z
        place(c, phone(screen_from(phone_src('home-full'), 0), t), W / 2 + 200 * z, 1150 + 520 * z, scale, ry=4 * drift, rx=2)
        c = caption(c, t, a0 + 0.05, "See what you've actually been paid")

    elif name == 'pending':
        z = k(lt, 0.0, 1.6)
        place(c, phone(screen_from(phone_src('home-full'), 60 + 40 * z), t), W / 2 + 120 - 160 * z, 1300 - 200 * z, 1.35 + 0.1 * z, ry=-6 + 4 * drift, rx=2)
        c = caption(c, t, a0 + 0.05, "What's pending, and what you've lost")

    elif name == 'insights':
        pin = kb(lt, 0.0, 0.5, 1.2)
        lap = laptop(lap_src('home-full'), 380 + 260 * k(lt, 0.6, 1.2), t)
        place(c, lap, W / 2 - (1 - pin) * 1100, 1080, 1.15, ry=7 * drift, rx=3)
        c = caption(c, t, a0 + 0.05, 'Ideas to earn more, from your own orders')

    elif name == 'shops':
        pin = kb(lt, 0.0, 0.45, 1.3)
        src = phone_src('shopslost-full')
        scr = screen_from(src, 1883 + 520 * k(lt, 0.5, 1.3))
        place(c, phone(scr, t), W / 2 + (1 - pin) * 900, 1150, 1.0, ry=-8 + 3 * drift, rx=3)
        c = caption(c, t, a0 + 0.05, 'Spot the shops losing your orders')

    elif name == 'videos':
        pin = kb(lt, 0.0, 0.5, 1.2)
        lap = laptop(lap_src('videos'), 0, t)
        place(c, lap, W / 2, 1080 + (1 - pin) * 1100, 1.15, ry=-6 * drift, rx=3)
        c = caption(c, t, a0 + 0.05, 'Find your best videos and posting times')

    elif name == 'tax':
        pin = kb(lt, 0.0, 0.45, 1.3)
        scr = screen_from(phone_src('home-full'), 5396 + 180 * k(lt, 0.5, 1.2))
        place(c, phone(scr, t), W / 2 - (1 - pin) * 900, 1150, 1.0, ry=8 - 3 * drift, rx=3)
        c = caption(c, t, a0 + 0.05, 'Tax year totals, sorted')

    elif name == 'montage':
        idx = min(3, int(lt / 0.5))
        offs = [0, 1883, 4100, 5396]
        bump = 1 + 0.06 * max(0, 1 - ((lt % 0.5) / 0.5) * 3)
        scr = screen_from(phone_src('home-full'), offs[idx])
        place(c, phone(scr, t), W / 2, 1150, 0.95 * bump, ry=[-10, 10, -10, 10][idx], rx=3)
        c = caption(c, t, a0 + 0.05, 'All from one export')

    elif name == 'privacy':
        layer = c.copy()
        p = kb(lt, 0.0, 0.45, 1.5)
        box = (W / 2 - 440, 640, W / 2 + 440, 1240)
        R.glass_card(layer, box, r=56)
        lock = padlock(220)
        bob = 10 * math.sin(lt * 4)
        layer.alpha_composite(lock, (int(W / 2 - 110), int(700 + bob)))
        d = ImageDraw.Draw(layer)
        d.text((W / 2, 1010), 'Your file never', font=R.font(66), fill=INK, anchor='mm')
        d.text((W / 2, 1090), 'leaves your device', font=R.font(66), fill=INK, anchor='mm')
        d.text((W / 2, 1170), 'Read on your device, never uploaded', font=R.font(34, 600), fill=INK, anchor='mm')
        # scale pop
        sc = max(0.2, p)
        reg = layer.crop((0, 560, W, 1320)).resize((int(W * sc), int(760 * sc)), Image.BICUBIC)
        out = c.copy(); out.paste(reg, (int(W / 2 - reg.width / 2), int(940 - reg.height / 2)))
        c = Image.blend(c, out, min(1, k(lt, 0, 0.2))) if lt < 0.2 else out

    elif name == 'end':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6)
        spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        R.logo(layer, W / 2, 470, int(150 * max(0.2, p)), spin)
        q = k(lt, 0.35, 0.3)
        L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.text((W / 2, 680 + (1 - q) * 30), 'Try it free', font=R.font(120), fill=INK, anchor='mm')
        fade_layer(layer, L, q)
        r2 = kb(lt, 0.7, 0.45, 1.8)
        if r2 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 640 * r2, 150 * r2
            d.rounded_rectangle((W / 2 - pw / 2, 860 - ph / 2, W / 2 + pw / 2, 860 + ph / 2), int(ph / 2), fill=INK)
            if r2 > 0.6:
                d.text((W / 2, 860), 'commish.fyi', font=R.font(int(84 * min(1, r2))), fill=YEL, anchor='mm')
            layer.alpha_composite(L)
        s3 = k(lt, 1.1, 0.3)
        if s3 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            d.text((W / 2, 1010), 'Pro from £2.99 a month', font=R.font(48, 700), fill=INK, anchor='mm')
            fade_layer(layer, L, s3)
        c.alpha_composite(layer)
        pin = kb(lt, 0.3, 0.6, 1.2)
        if pin > 0:
            place(c, phone(screen_from(phone_src('home-full'), 0), t), W / 2, 1650 + (1 - pin) * 700, 0.78, ry=-6 * drift, rx=10)
    return c.convert('RGB')

def render_scene(args):
    name, a, b = args
    tmp = f'/home/claude/promo/scenes/{name}.tmp.mp4'
    out = f'/home/claude/promo/scenes/{name}.mp4'
    n = int(round((b - a) * FPS))
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', tmp], stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame(a + i / FPS).tobytes())
    p.stdin.close()
    if p.wait() == 0:
        os.replace(tmp, out)
    return name

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        for ts in sys.argv[2:]:
            frame(float(ts)).save(f'/tmp/st_{ts}.jpg', quality=88)
    else:
        from multiprocessing import Pool
        os.makedirs('/home/claude/promo/scenes', exist_ok=True)
        todo = [s for s in SCENES if len(sys.argv) < 3 or s[0] in sys.argv[2:]]
        with Pool(2) as pool:
            for nm in pool.imap_unordered(render_scene, todo):
                print('done', nm, flush=True)
