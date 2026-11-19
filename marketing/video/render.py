import math, sys, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

W, H, FPS = 1080, 1920, 30
YEL = (255, 228, 92); INK = (27, 19, 64); PINK = (255, 111, 181); PAID = (42, 30, 140)
FONT = 'bricolage.ttf'

@functools.lru_cache(None)
def font(size, wght=800):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([wght])
    return f

# ---------- edit list: (src_in, src_out, speed, step) ----------
SEGS = [
    (6.40, 8.65, 1.0, 0),
    (8.65, 8.75, 1.0, 1),
    (9.65, 11.90, 1.2, 1),
    (11.90, 16.60, 1.5, 2),
    (16.60, 16.75, 1.0, 3),
    (18.65, 20.70, 1.4, 3),
    (21.40, 25.30, 1.6, 4),
    (25.30, 30.00, 1.5, 5),
    (30.00, 37.20, 2.2, 5),
    (37.20, 40.80, 1.5, 6),
    (40.80, 57.65, 8.0, 7),
    (66.30, 69.10, 1.0, 8),
    (77.20, 79.60, 0.48, 8),
]
STEPS = [
    "Go to your profile and tap TikTok Studio",
    "Open TikTok Shop for Creators",
    "Scroll to the toolkit and tap Earnings",
    "Tap Affiliate orders",
    "Tap the download arrow, top right",
    "Choose Custom and pick up to 90 days",
    "Tap Confirm",
    "Wait for File ready, then tap download",
    "Tap Share, then Save to Files",
]
# taps: (src_time, x, y) in screen-normalised coords
TAPS = [
    (8.50, 0.155, 0.413),
    (11.75, 0.72, 0.649),
    (16.45, 0.40, 0.554),
    (20.50, 0.383, 0.524),
    (25.10, 0.925, 0.098),
    (29.75, 0.147, 0.46),
    (36.95, 0.50, 0.920),
    (40.35, 0.73, 0.915),
    (57.45, 0.92, 0.380),
    (69.00, 0.296, 0.940),
]
HIGHLIGHTS = [(77.3, 78.4, 0.06, 0.668, 0.94, 0.712), (78.45, 79.6, 0.515, 0.165, 0.71, 0.29)]  # Save to Files, then Mail
MAIL_FROM = 78.45
# blur boxes: (src_from, src_to, x0, y0, x1, y1)
BLURS = [
    (0, 8.70, 0.0, 0.115, 1.0, 0.395),
    (11.90, 15.2, 0.0, 0.125, 0.92, 0.255),
]

INTRO, OUTRO = 2.6, 3.6
seg_out = []
t0 = INTRO
for s in SEGS:
    d = (s[1] - s[0]) / s[2]
    seg_out.append((t0, t0 + d, s))
    t0 += d
MAIN_END = t0
TOTAL = MAIN_END + OUTRO

def src_to_out(ts):
    for a, b, s in seg_out:
        if s[0] <= ts <= s[1]:
            return a + (ts - s[0]) / s[2]
    return None

TAP_OUT = [(src_to_out(t), x, y) for t, x, y in TAPS]

def at(t):
    """returns (src_time, step) for output time t"""
    if t < INTRO:
        return SEGS[0][0], 0
    for a, b, s in seg_out:
        if t < b:
            return s[0] + (t - a) * s[2], s[3]
    return SEGS[-1][1] - 0.01, SEGS[-1][3]

def ease(x):
    x = min(max(x, 0), 1)
    return x * x * (3 - 2 * x)

def ease_out_back(x, k=1.6):
    x = min(max(x, 0), 1)
    return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2

# ---------- background ----------
def blob(r, color, alpha):
    im = Image.new('RGBA', (r * 4, r * 4), color + (0,))
    d = ImageDraw.Draw(im)
    d.ellipse((r, r, 3 * r, 3 * r), fill=color + (alpha,))
    return im.filter(ImageFilter.GaussianBlur(r * 0.45))

BASE = Image.new('RGB', (W, H))
g = np.linspace(0, 1, H)[:, None]
top = np.array([255, 236, 120]); bot = np.array([255, 214, 70])
BASE = Image.fromarray(np.repeat((top * (1 - g) + bot * g)[:, None, :].reshape(H, 1, 3), W, 1).astype(np.uint8)).convert('RGBA')
BLOBS = [
    (blob(300, PINK, 150), (0.15, 0.25), (0.10, 0.06), 0.13),
    (blob(340, (140, 116, 255), 120), (0.85, 0.70), (0.08, 0.07), 0.09),
    (blob(260, (255, 255, 255), 170), (0.80, 0.15), (0.06, 0.05), 0.11),
    (blob(280, PINK, 110), (0.20, 0.92), (0.07, 0.04), 0.07),
]

def glass_disc(r):
    im = Image.new('RGBA', (r * 2 + 40, r * 2 + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((20, 20, 20 + 2 * r, 20 + 2 * r), fill=(255, 255, 255, 60), outline=(255, 255, 255, 170), width=3)
    d.arc((20 + r * 0.25, 20 + r * 0.25, 20 + r * 1.75, 20 + r * 1.75), 200, 260, fill=(255, 255, 255, 220), width=6)
    return im

DISCS = [(glass_disc(70), (0.12, 0.62), 0.9), (glass_disc(46), (0.90, 0.40), 1.3), (glass_disc(34), (0.86, 0.90), 1.1)]

def background(t):
    bg = BASE.copy()
    for im, (cx, cy), (ax, ay), sp in BLOBS:
        x = (cx + ax * math.sin(t * sp * 2 * math.pi / 3 + cx * 7)) * W - im.width / 2
        y = (cy + ay * math.cos(t * sp * 2 * math.pi / 3 + cy * 5)) * H - im.height / 2
        bg.alpha_composite(im, (int(x), int(y)))
    for im, (cx, cy), sp in DISCS:
        x = cx * W + 18 * math.sin(t * sp) - im.width / 2
        y = cy * H + 30 * math.cos(t * sp * 0.8) - im.height / 2
        bg.alpha_composite(im, (int(x), int(y)))
    return bg

# ---------- phone ----------
SW, SH = 600, 1300
BZ = 22
PW, PH = SW + 2 * BZ, SH + 2 * BZ
SR = 74  # screen radius

def rr_mask(w, h, r, scale=4):
    m = Image.new('L', (w * scale, h * scale), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * scale - 1, h * scale - 1), r * scale, fill=255)
    return m.resize((w, h), Image.LANCZOS)

SCREEN_MASK = rr_mask(SW, SH, SR)

def make_bezel():
    im = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    body = Image.new('RGBA', (PW, PH), INK + (255,))
    # titanium-ish gradient
    gx = np.linspace(0, 1, PW)[None, :]
    shade = (np.clip(1 - 0.35 * np.abs(gx - 0.3) * 2, 0.55, 1.0) * 255)
    arr = np.zeros((PH, PW, 4), np.uint8)
    arr[..., 0] = (27 + 60 * (shade / 255 - 0.55)).clip(0, 255)
    arr[..., 1] = (19 + 50 * (shade / 255 - 0.55)).clip(0, 255)
    arr[..., 2] = (64 + 90 * (shade / 255 - 0.55)).clip(0, 255)
    arr[..., 3] = 255
    body = Image.fromarray(arr, 'RGBA')
    im.paste(body, (0, 0), rr_mask(PW, PH, SR + BZ))
    d = ImageDraw.Draw(im)
    # rim highlights
    d.rounded_rectangle((2, 2, PW - 3, PH - 3), SR + BZ - 2, outline=(255, 255, 255, 90), width=3)
    d.rounded_rectangle((BZ - 5, BZ - 5, PW - BZ + 4, PH - BZ + 4), SR + 5, outline=(0, 0, 0, 160), width=5)
    # side buttons
    for y0, y1 in [(250, 330), (360, 470), (490, 600)]:
        d.rounded_rectangle((-1, y0, 5, y1), 3, fill=(60, 50, 110, 255))
    d.rounded_rectangle((PW - 6, 380, PW + 1, 540), 3, fill=(60, 50, 110, 255))
    return im

BEZEL = make_bezel()

def sheen(t):
    """diagonal glass reflection that drifts across the screen"""
    im = Image.new('L', (SW, SH), 0)
    d = ImageDraw.Draw(im)
    pos = ((t * 0.18) % 1.6 - 0.3) * (SW + SH)
    d.polygon([(pos, 0), (pos + 160, 0), (pos + 160 - SH * 0.6, SH), (pos - SH * 0.6, SH)], fill=38)
    d.polygon([(pos + 210, 0), (pos + 250, 0), (pos + 250 - SH * 0.6, SH), (pos + 210 - SH * 0.6, SH)], fill=26)
    im = im.filter(ImageFilter.GaussianBlur(14))
    # static top-left glare
    g2 = Image.new('L', (SW, SH), 0)
    ImageDraw.Draw(g2).ellipse((-SW * 0.6, -SH * 0.35, SW * 0.9, SH * 0.25), fill=22)
    g2 = g2.filter(ImageFilter.GaussianBlur(60))
    return ImageChops.add(im, g2)

@functools.lru_cache(maxsize=4)
def src_frame(idx):
    return Image.open(f'sf/{idx:05d}.jpg').convert('RGB')

def screen_image(src_t, out_t):
    idx = min(max(int(src_t * 30) + 1, 1), 2426)
    im = src_frame(idx).copy()
    for a, b, x0, y0, x1, y1 in BLURS:
        if a <= src_t <= b:
            box = (int(x0 * SW), int(y0 * SH), int(x1 * SW), int(y1 * SH))
            reg = im.crop(box)
            small = reg.resize((max(1, reg.width // 14), max(1, reg.height // 14)), Image.BILINEAR)
            reg = small.resize(reg.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(10))
            im.paste(reg, box)
    im = im.convert('RGBA')
    ov = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    # highlight
    for a, b, x0, y0, x1, y1 in HIGHLIGHTS:
      if a <= src_t <= b:
        k = ease((src_t - a) / 0.25)
        pulse = 0.5 + 0.5 * math.sin((src_t - a) * 9)
        d.rounded_rectangle((x0 * SW - 6, y0 * SH - 6, x1 * SW + 6, y1 * SH + 6), 18,
                            outline=PINK + (int(255 * k),), width=int(5 + 3 * pulse), fill=PINK + (int(40 * k),))
    # tap ripples
    for to, x, y in TAP_OUT:
        dt = out_t - to
        if -0.35 <= dt <= 0.6:
            cx, cy = x * SW, y * SH
            if dt < 0:  # finger arriving
                k = ease((dt + 0.35) / 0.35)
                r = 30 + 30 * (1 - k)
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, int(150 * k)), outline=PINK + (int(255 * k),), width=5)
            else:
                k = dt / 0.6
                r = 30 + 70 * ease(k)
                d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=PINK + (int(255 * (1 - k)),), width=8)
                r2 = 30 * (1 - 0.4 * k)
                d.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=PINK + (int(200 * (1 - k)),))
    im.alpha_composite(ov)
    white = Image.new('RGBA', (SW, SH), (255, 255, 255, 0))
    white.putalpha(sheen(out_t))
    im.alpha_composite(white)
    return im

def phone_layer(src_t, out_t):
    ph = BEZEL.copy()
    scr = screen_image(src_t, out_t)
    ph.paste(scr, (BZ, BZ), SCREEN_MASK)
    # dynamic island stays on top of the screen
    return ph

# ---------- homography ----------
def homography(src_pts, dst_pts):
    """coefficients mapping dst -> src for PIL PERSPECTIVE"""
    A, B = [], []
    for (xs, ys), (xd, yd) in zip(src_pts, dst_pts):
        A.append([xd, yd, 1, 0, 0, 0, -xs * xd, -xs * yd]); B.append(xs)
        A.append([0, 0, 0, xd, yd, 1, -ys * xd, -ys * yd]); B.append(ys)
    return np.linalg.solve(np.array(A, float), np.array(B, float))

def project(w, h, cx, cy, scale, ry, rx, f=2600):
    pts = []
    for x, y in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        # rotate around y then x
        X = x * math.cos(ry); Z = x * math.sin(ry)
        Y = y * math.cos(rx) - Z * math.sin(rx); Z = y * math.sin(rx) + Z * math.cos(rx)
        s = f / (f + Z)
        pts.append((cx + X * s * scale, cy + Y * s * scale))
    return pts

# ---------- glass card ----------
def glass_card(bg, box, r=40, tint=(255, 255, 255), alpha=105):
    x0, y0, x1, y1 = [int(v) for v in box]
    reg = bg.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(26))
    tintl = Image.new('RGBA', reg.size, tint + (alpha,))
    reg.alpha_composite(tintl)
    # inner gradient highlight
    gl = Image.new('L', reg.size, 0)
    ImageDraw.Draw(gl).rectangle((0, 0, reg.width, reg.height * 0.45), fill=40)
    gl = gl.filter(ImageFilter.GaussianBlur(30))
    reg.alpha_composite(Image.merge('RGBA', [Image.new('L', reg.size, 255)] * 3 + [gl]))
    m = rr_mask(reg.width, reg.height, r)
    # soft shadow
    sh = Image.new('RGBA', (reg.width + 80, reg.height + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((40, 52, reg.width + 40, reg.height + 52), r, fill=INK + (60,))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    bg.alpha_composite(sh, (x0 - 40, y0 - 40))
    bg.paste(reg, (x0, y0), m)
    ImageDraw.Draw(bg).rounded_rectangle((x0, y0, x1 - 1, y1 - 1), r, outline=(255, 255, 255, 200), width=3)

def wrap(text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        test = (cur + ' ' + w_).strip()
        if f.getlength(test) <= maxw:
            cur = test
        else:
            lines.append(cur); cur = w_
    lines.append(cur)
    return lines

def coin(d, cx, cy, r, spin=1.0):
    rx = max(2, r * abs(spin))
    d.ellipse((cx - rx, cy - r, cx + rx, cy + r), fill=INK)
    ring = max(2, int(r * 0.2))
    d.ellipse((cx - rx, cy - r, cx + rx, cy + r), outline=PINK, width=ring)
    if abs(spin) > 0.35:
        f = font(int(r * 1.2))
        d.text((cx, cy + r * 0.04), '£', font=f, fill=YEL, anchor='mm')

def logo(img, cx, cy, size, spin=1.0, color=INK):
    d = ImageDraw.Draw(img)
    f = font(size)
    r = size * 0.43
    wc = f.getlength('C'); wm = f.getlength('mmish')
    total = wc + 2 * r + size * 0.06 + wm
    x = cx - total / 2
    d.text((x, cy), 'C', font=f, fill=color, anchor='lm')
    coin(d, x + wc + r + size * 0.03, cy + size * 0.04, r, spin)
    d.text((x + wc + 2 * r + size * 0.06, cy), 'mmish', font=f, fill=color, anchor='lm')

# ---------- frame ----------
CARD = (60, 110, W - 60, 400)

def render(t):
    bg = background(t)
    src_t, step = at(t)

    # phone motion
    rise = ease_out_back((t - 1.75) / 0.85, 1.2) if t < INTRO + 0.5 else 1.0
    out_k = ease((t - MAIN_END) / 0.8) if t > MAIN_END else 0.0
    ry = math.radians(5.5 * math.sin(t * 0.55) - 14 * (1 - rise))
    rx = math.radians(2.5 * math.sin(t * 0.43 + 1) + 10 * (1 - rise))
    cx = W / 2
    cy = 1150 + (1 - rise) * 1750
    scale = 1.0
    # gentle push-in towards each tap
    for to, x, y in TAP_OUT:
        dt = t - to
        if -1.1 <= dt <= 0.5:
            k = ease((dt + 1.1) / 0.7) * (1 - ease((dt - 0.1) / 0.4))
            scale = max(scale, 1 + 0.10 * k)
            cx += (0.5 - x) * PW * 0.10 * k
            cy += (0.5 - y) * PH * 0.10 * k
    # outro: phone shrinks and floats down-right
    scale *= 1 - 0.38 * out_k
    cx += 250 * out_k; cy += 260 * out_k
    ry += math.radians(-12 * out_k)

    ph = phone_layer(src_t, t)
    dst = project(PW, PH, cx, cy, scale, ry, rx)
    coeffs = homography([(0, 0), (PW, 0), (PW, PH), (0, PH)], dst)
    warped = ph.transform((W, H), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
    # shadow from warped alpha
    a = warped.getchannel('A').resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6)).resize((W, H), Image.BILINEAR)
    shadow = Image.new('RGBA', (W, H), INK + (0,))
    shadow.putalpha(a.point(lambda v: int(v * 0.42)))
    bg.alpha_composite(shadow, (26, 46))
    bg.alpha_composite(warped)

    d = ImageDraw.Draw(bg)

    # ----- intro title -----
    if t < INTRO + 0.4:
        k_in = ease(t / 0.5)
        k_out = 1 - ease((t - 1.45) / 0.4)
        k = k_in * k_out
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        spin = math.cos(min(t, 1.2) / 1.2 * math.pi * 4)
        logo(layer, W / 2, 330 - 40 * (1 - k_in), 110, spin)
        ld = ImageDraw.Draw(layer)
        ld.text((W / 2, 520 - 30 * (1 - k_in)), 'How to export your', font=font(64, 700), fill=INK, anchor='mm')
        ld.text((W / 2, 600 - 30 * (1 - k_in)), 'TikTok earnings file', font=font(84, 800), fill=INK, anchor='mm')
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * k)))
        bg.alpha_composite(layer)

    # ----- step caption card -----
    if INTRO - 0.2 <= t <= MAIN_END + 0.3:
        # find when this step started
        st_start = next(a for a, b, s in seg_out if s[3] == step)
        k = ease((t - st_start + 0.2) / 0.35) if step > 0 else ease((t - INTRO + 0.2) / 0.4)
        k *= 1 - ease((t - MAIN_END) / 0.3)
        if k > 0.01:
            dy = (1 - k) * -40
            box = (CARD[0], CARD[1] + dy, CARD[2], CARD[3] + dy)
            layer = bg.copy()
            glass_card(layer, box)
            ld = ImageDraw.Draw(layer)
            # step chip
            chx, chy = box[0] + 100, box[1] + 145
            ld.ellipse((chx - 62, chy - 62, chx + 62, chy + 62), fill=INK)
            ld.ellipse((chx - 62, chy - 62, chx + 62, chy + 62), outline=PINK, width=7)
            ld.text((chx, chy + 3), str(step + 1), font=font(70), fill=YEL, anchor='mm')
            text = STEPS[step]
            if step == 8 and src_t >= MAIL_FROM:
                text = 'Or tap Mail to email it to yourself'
            lines = wrap(text, font(56), box[2] - box[0] - 250)
            ty = box[1] + 145 - (len(lines) - 1) * 33
            for i, ln in enumerate(lines):
                ld.text((box[0] + 200, ty + i * 66), ln, font=font(56), fill=INK, anchor='lm')
            # progress dots
            n = len(STEPS)
            for i in range(n):
                px = W / 2 + (i - (n - 1) / 2) * 34
                py = box[3] - 30
                r = 8 if i != step else 11
                col = INK if i <= step else (255, 255, 255)
                if i == step:
                    ld.rounded_rectangle((px - 18, py - 8, px + 18, py + 8), 8, fill=PINK)
                else:
                    ld.ellipse((px - 7, py - 7, px + 7, py + 7), fill=col + (230,), outline=INK + (90,), width=2)
            if k < 0.999:
                bg = Image.blend(bg, layer, k)
            else:
                bg = layer
            d = ImageDraw.Draw(bg)
        # "sped up" tag
        if step == 7 and src_t < 57.3:
            tag = '⏩ Sped up 8x'
            f = font(38, 700)
            tw = f.getlength('Sped up 8x') + 60
            x0, y0 = W / 2 - tw / 2, 430
            d.rounded_rectangle((x0, y0, x0 + tw, y0 + 62), 31, fill=INK)
            d.text((W / 2, y0 + 31), 'Sped up 8x', font=f, fill=YEL, anchor='mm')

    # ----- outro -----
    if t > MAIN_END:
        k = ease((t - MAIN_END - 0.2) / 0.6)
        if k > 0.01:
            gl = bg.copy()
            glass_card(gl, (60, 150 - 30 * (1 - k), W - 60, 900 - 30 * (1 - k)))
            bg = Image.blend(bg, gl, k)
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        y0 = 260 - 40 * (1 - k)
        ld.text((90, y0), 'Done!', font=font(120), fill=INK, anchor='lm')
        ld.text((90, y0 + 130), 'Now drop that file', font=font(68, 700), fill=INK, anchor='lm')
        ld.text((90, y0 + 210), 'into Commish', font=font(68, 700), fill=INK, anchor='lm')
        ld.rounded_rectangle((90, y0 + 300, 90 + 470, y0 + 400), 50, fill=INK)
        ld.text((90 + 235, y0 + 350), 'commish.fyi', font=font(52), fill=YEL, anchor='mm')
        f2 = font(42, 600)
        ld.text((90, y0 + 480), 'Got more history? Export each 90 days,', font=f2, fill=INK, anchor='lm')
        l2 = 'then add them all at once with'
        ld.text((90, y0 + 538), l2, font=f2, fill=INK, anchor='lm')
        px = 90 + f2.getlength(l2) + 16
        ld.rounded_rectangle((px, y0 + 510, px + 112, y0 + 566), 28, fill=PINK)
        ld.text((px + 56, y0 + 538), 'Pro', font=font(40), fill=INK, anchor='mm')
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * k)))
        bg.alpha_composite(layer)
    return bg.convert('RGB')

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        for ts in sys.argv[2:]:
            render(float(ts)).save(f'still_{ts}.jpg', quality=88)
        print('total', TOTAL)
    else:
        out = sys.argv[2]
        n = int(TOTAL * FPS)
        p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                              '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                             stdin=subprocess.PIPE)
        for i in range(n):
            p.stdin.write(render(i / FPS).tobytes())
            if i % 100 == 0:
                print(i, n, flush=True)
        p.stdin.close(); p.wait()
