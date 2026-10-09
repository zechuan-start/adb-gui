# Bookmark palette check: WCAG contrast against the file list backgrounds and
# CIEDE2000 distance to the theme semantic colors, in light and dark themes.
# Usage: python3 palette-check.py '{"orange": {"light": "#c25e0a", "dark": "#ff9f43"}, ...}'
import math, itertools, sys

def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
def blend(fg, bg, a):
    return tuple(f * a + b * (1 - a) for f, b in zip(fg, bg))
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lum(rgb): r, g, b = map(lin, rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
def lab(rgb):
    r, g, b = map(lin, rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b)
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
def de2000(c1, c2):
    L1, a1, b1 = lab(c1); L2, a2, b2 = lab(c2)
    C1 = math.hypot(a1, b1); C2 = math.hypot(a2, b2); Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360; h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp = L2 - L1; dCp = C2p - C1p
    dh = h2p - h1p
    if C1p * C2p == 0: dh = 0
    elif dh > 180: dh -= 360
    elif dh < -180: dh += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lbp = (L1 + L2) / 2; Cbp = (C1p + C2p) / 2
    if C1p * C2p == 0: hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180: hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360: hbp = (h1p + h2p + 360) / 2
    else: hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dtheta = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp; Sh = 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))

themes = {
  'light': dict(bg=blend(hex2rgb('#f3f1eb'), hex2rgb('#eae8e1'), 0.45),
                sem={'note': '#7a5cb8', 'ok': '#1f6b4f', 'warn': '#8a6410', 'err': '#a93326', 'ink': '#1b2a4a', 'ink3': '#7a8394'}),
  'dark':  dict(bg=blend(hex2rgb('#0e1f38'), hex2rgb('#102340'), 0.45),
                sem={'note': '#b49cee', 'ok': '#57c99b', 'warn': '#e0b54a', 'err': '#ff7a6b', 'ink': '#e4eaf3', 'ink3': '#8a98af'}),
}
import json
palette = json.loads(sys.argv[1])
for theme, cfg in themes.items():
    print(f'== {theme}')
    tags = {k: hex2rgb(v[theme]) for k, v in palette.items()}
    hover = blend((27/255, 42/255, 74/255), cfg['bg'], 0.055) if theme == 'light' else blend((1, 1, 1), cfg['bg'], 0.07)
    for k, c in tags.items():
        sem = {s: round(de2000(c, hex2rgb(h)), 1) for s, h in cfg['sem'].items()}
        nearest = min(sem.items(), key=lambda kv: kv[1])
        print(f'{k:7s} {palette[k][theme]}  contrast bg={contrast(c, cfg["bg"]):.2f} hover={contrast(c, hover):.2f}  nearest-semantic={nearest[0]} dE={nearest[1]}')
    pairs = sorted(((round(de2000(tags[a], tags[b]), 1), a, b) for a, b in itertools.combinations(tags, 2)))
    print('closest tag pairs:', pairs[:3])
