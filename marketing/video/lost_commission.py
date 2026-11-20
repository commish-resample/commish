"""Commish personal bests clip, 26s, 1080x1920, 120 BPM."""
import math, os, sys, subprocess, json, functools
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/claude/promo')
import promo as P
R = P.R
W, H, FPS = P.W, P.H, P.FPS
INK, PINK, YEL = P.INK, P.PINK, P.YEL
k, kb = P.k, P.kb
ease = R.ease

SHOTS = '/home/claude/lost/shots/'
INFO = json.load(open(SHOTS + 'phone.json'))
WC_L = json.load(open(SHOTS + 'laptop.json'))['worthCard']

@functools.lru_cache(None)
def phone_full():
    im = Image.open(SHOTS + 'phone-full.jpg').convert('RGB')
    return im.resize((P.SW, int(im.height * P.SW / im.width)), Image.LANCZOS)

@functools.lru_cache(None)
def lap_view():
    im = Image.open(SHOTS + 'laptop-full.jpg').convert('RGB')
    return im.resize((P.LW, int(im.height * P.LW / im.width)), Image.LANCZOS)

def scr(scroll_css):
    return P.screen_from(phone_full(), scroll_css)

def focus_place(c, scroll_css, t, fx_css, fy_css, zoom, cx=540, cy=1000, ry=0, rx=2):
    """place the phone so that page point (fx, fy) in css px sits at (cx, cy) on canvas, at a given zoom"""
    # screen point in phone-layer px
    sx = P.BZ + fx_css * P.PS
    sy = P.BZ + (fy_css - scroll_css) * P.PS
    # place() centres the layer: offset of the focus point from the layer centre, scaled
    ox = (sx - P.PW / 2) * zoom
    oy = (sy - P.PHH / 2) * zoom
    P.place(c, P.phone(scr(scroll_css), t), cx - ox, cy - oy, zoom, ry=ry, rx=rx)

def tile(name):
    return next(x for x in INFO['tiles'] if x[0] == name)[2]


def svg_trophy(size, col):
    s = size; im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    w = max(3, int(s * 0.09))
    d.rounded_rectangle((s * .26, s * .1, s * .74, s * .5), int(s * .2), fill=col)
    d.rectangle((s * .26, s * .1, s * .74, s * .3), fill=col)
    d.arc((s * .06, s * .14, s * .36, s * .44), 90, 270, fill=col, width=w)
    d.arc((s * .64, s * .14, s * .94, s * .44), 270, 90, fill=col, width=w)
    d.rectangle((s * .45, s * .5, s * .55, s * .72), fill=col)
    d.rounded_rectangle((s * .28, s * .72, s * .72, s * .86), int(s * .05), fill=col)
    return im

def svg_flame(size, col):
    s = size; im = Image.new('RGBA', (s, int(s * 1.25)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    h = s * 1.25
    pts = []
    for i in range(0, 361, 6):
        a = math.radians(i)
        r = 1 - 0.55 * max(0, math.sin(a)) ** 3
        x = s / 2 + s * 0.42 * math.cos(a) * r
        y = h * 0.62 + h * 0.36 * math.sin(a) * (1 if math.sin(a) > 0 else 1.55)
        pts.append((x, y))
    d.polygon(pts, fill=col, outline=INK)
    d.line(pts + [pts[0]], fill=INK, width=max(3, int(s * .05)))
    inner = [(s / 2 + (x - s / 2) * .5, h * .78 + (y - h * .62) * .5) for x, y in pts]
    d.polygon(inner, fill=YEL)
    return im

SCENES = [('hook', 0, 2), ('logo', 2, 4), ('tile', 4, 7), ('notret', 7, 9.5), ('shops', 9.5, 12), ('insight', 12, 14.5),
          ('worth', 14.5, 17.5), ('copy', 17.5, 20), ('lap', 20, 22), ('end', 22, 26)]

LT = INFO['lostTile']            # x, y, w, h (css)
WC = INFO['worthCard']

def burst(c, x, y, q):
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    for i in range(12):
        a = i * math.pi / 6
        r0, r1 = 40 + 140 * q, 70 + 190 * q
        d.line((x + r0 * math.cos(a), y + r0 * math.sin(a), x + r1 * math.cos(a), y + r1 * math.sin(a)), fill=PINK + (int(255 * (1 - q)),), width=9)
    c.alpha_composite(L)

def tap(c, x, y, dt):
    if dt < -0.3 or dt > 0.6: return
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    if dt < 0:
        q = ease((dt + 0.3) / 0.3); r = 46 + 40 * (1 - q)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, int(150 * q)), outline=PINK + (int(255 * q),), width=7)
    else:
        q = dt / 0.6; r = 46 + 110 * ease(q)
        d.ellipse((x - r, y - r, x + r, y + r), outline=PINK + (int(255 * (1 - q)),), width=10)
        r2 = 46 * (1 - 0.4 * q); d.ellipse((x - r2, y - r2, x + r2, y + r2), fill=PINK + (int(200 * (1 - q)),))
    c.alpha_composite(L)

def frame(t):
    c = P.bg(t)
    name = next((n for n, a, b in SCENES if a <= t < b), 'end')
    a0 = next(a for n, a, b in SCENES if n == name)
    lt = t - a0
    drift = math.sin(t * 1.3)

    if name == 'hook':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        words = [(0.0, 'You made the sale.', 760, 92), (0.6, 'But did TikTok', 900, 104), (1.1, 'actually pay you?', 1020, 104)]
        for t0, s_, y, size in words:
            p = kb(lt, t0, 0.3, 1.8)
            if p <= 0: continue
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            P.text_center(L, y + (1 - min(p, 1)) * 60, s_, int(size * (0.6 + 0.4 * p)))
            P.fade_layer(layer, L, min(1, p * 2))
        u = k(lt, 1.5, 0.3)
        if u > 0:
            ImageDraw.Draw(layer).rounded_rectangle((W / 2 - 270, 1090, W / 2 - 270 + 540 * u, 1112), 11, fill=PINK)
        c.alpha_composite(layer)

    elif name == 'logo':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6)
        spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        R.logo(layer, W / 2, 760, int(170 * max(0.2, p)), spin)
        q = kb(lt, 0.5, 0.4, 1.8)
        if q > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 720 * q, 140 * q
            d.rounded_rectangle((W / 2 - pw / 2, 980 - ph / 2, W / 2 + pw / 2, 980 + ph / 2), int(ph / 2), fill=PINK, outline=INK, width=max(1, int(6 * q)))
            if q > 0.6:
                d.text((W / 2, 980), 'Lost commission', font=R.font(int(72 * min(1, q))), fill=INK, anchor='mm')
            layer.alpha_composite(L)
        r = k(lt, 1.0, 0.3)
        if r > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            P.text_center(L, 1140 + (1 - r) * 30, 'The bit most affiliates never see', 50, INK, 700)
            P.fade_layer(layer, L, r)
        c.alpha_composite(layer)

    elif name == 'tile':
        pin = kb(lt, 0.0, 0.5, 1.3)
        z = 0.86 + 1.0 * k(lt, 1.0, 1.0)
        x, y, w, h = LT
        if lt < 1.0:
            P.place(c, P.phone(scr(0), t), W / 2 + (1 - pin) * 900, 1080, 0.86, ry=-8 + 3 * drift, rx=3)
        else:
            q = k(lt, 1.0, 1.0)
            focus_place(c, 0, t, 195 * (1 - q) + (x + w / 2) * q, 422 * (1 - q) + (y + h / 2) * q, z, cx=540, cy=1080 - 80 * q, ry=-4 * drift)
        c = P.caption(c, t, a0 + 0.25, "Commission you thought you'd earned")

    elif name == 'notret':
        x, y, w, h = LT
        focus_place(c, 0, t, x + w / 2, y + h - 30, 2.25 + 0.15 * k(lt, 0, 2.5), cx=540, cy=1000, ry=3 * drift)
        if 0.3 <= lt < 0.9:
            burst(c, 540, 1000, (lt - 0.3) / 0.6)
        c = P.caption(c, t, a0 + 0.05, 'Not returned. Just never paid out.')

    elif name == 'shops':
        pin = kb(lt, 0.0, 0.45, 1.3)
        q = k(lt, 0.7, 1.3)
        focus_place(c, 3330, t, 195, 3500 + 130 * q, 1.6, cx=540 + (1 - pin) * 900, cy=1000, ry=-5 + 3 * drift)
        c = P.caption(c, t, a0 + 0.05, 'See which shops lose your orders')

    elif name == 'insight':
        z = 1.55
        focus_place(c, 560, t, 200, 690, z, cx=540, cy=1000, ry=4 * drift)
        c = P.caption(c, t, a0 + 0.05, 'Commish spots the pattern for you')

    elif name == 'worth':
        x, y, w, h = WC
        q = k(lt, 0.8, 1.2)
        focus_place(c, y - 120, t, 195, (y + 110) * (1 - q) + (y + 250) * q, 1.45 + 0.2 * q, cx=540, cy=1020, ry=-3 * drift)
        c = P.caption(c, t, a0 + 0.05, '52 orders. Nothing returned. No commission.')

    elif name == 'copy':
        x, y, w, h = WC
        fx, fy = 120, y + 252
        focus_place(c, y - 60, t, fx, fy, 2.1, cx=540, cy=1000, ry=2 * drift)
        for tt in (0.8, 1.6):
            tap(c, 540, 1000, lt - tt)
        if lt > 1.0:
            L = c.copy(); dd = ImageDraw.Draw(L)
            a_ = k(lt, 1.0, 0.2)
            bw = 330
            dd.rounded_rectangle((W / 2 - bw / 2, 1150, W / 2 + bw / 2, 1240), 45, fill=INK)
            dd.text((W / 2, 1195), 'Copied', font=R.font(48), fill=YEL, anchor='mm')
            c = Image.blend(c, L, a_)
        c = P.caption(c, t, a0 + 0.05, 'Copy the order IDs and ask TikTok support')

    elif name == 'lap':
        pin = kb(lt, 0.0, 0.5, 1.2)
        lap = P.laptop(lap_view(), WC_L[1] - 60, t)
        P.place(c, lap, W / 2 + (1 - pin) * 1100, 1000, 1.12, ry=6 * drift, rx=3)
        c = P.caption(c, t, a0 + 0.05, 'Then back the shops that actually pay out')

    elif name == 'end':
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        p = kb(lt, 0.0, 0.45, 1.6)
        spin = math.cos(min(lt, 0.8) / 0.8 * math.pi * 4)
        R.logo(layer, W / 2, 500, int(140 * max(0.2, p)), spin)
        q = k(lt, 0.3, 0.3)
        L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
        d.text((W / 2, 690 + (1 - q) * 30), 'Find your', font=R.font(104), fill=INK, anchor='mm')
        d.text((W / 2, 800 + (1 - q) * 30), 'lost commission', font=R.font(104), fill=INK, anchor='mm')
        P.fade_layer(layer, L, q)
        r2 = kb(lt, 0.7, 0.45, 1.8)
        if r2 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            pw, ph = 640 * r2, 150 * r2
            d.rounded_rectangle((W / 2 - pw / 2, 990 - ph / 2, W / 2 + pw / 2, 990 + ph / 2), int(ph / 2), fill=INK)
            if r2 > 0.6:
                d.text((W / 2, 990), 'commish.fyi', font=R.font(int(84 * min(1, r2))), fill=YEL, anchor='mm')
            layer.alpha_composite(L)
        s3 = k(lt, 1.1, 0.3)
        if s3 > 0:
            L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            d.text((W / 2, 1140), 'Try it free. Pro from £2.99 a month', font=R.font(46, 700), fill=INK, anchor='mm')
            d.text((W / 2, 1210), 'Your file never leaves your device', font=R.font(40, 600), fill=INK, anchor='mm')
            P.fade_layer(layer, L, s3)
        c.alpha_composite(layer)
    return c.convert('RGB')

def render_scene(args):
    name, a, b = args
    tmp = f'/home/claude/lost/scenes/{name}.tmp.mp4'; out = f'/home/claude/lost/scenes/{name}.mp4'
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
            frame(float(ts)).save(f'/tmp/lost_{ts}.jpg', quality=88)
    else:
        from multiprocessing import Pool
        os.makedirs('/home/claude/lost/scenes', exist_ok=True)
        todo = [s for s in SCENES if len(sys.argv) < 3 or s[0] in sys.argv[2:]]
        with Pool(2) as pool:
            for nm in pool.imap_unordered(render_scene, todo):
                print('done', nm, flush=True)
