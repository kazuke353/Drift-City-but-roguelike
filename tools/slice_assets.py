#!/usr/bin/env python3
"""
Slices the concept / UI-kit reference sheets in art-src/ into individual game assets in public/art/.
Icons drawn on black are keyed by brightness; painted objects on dark panels are segmented against
the local background colour, holes are filled and edges feathered.
Run:  python3 tools/slice_assets.py
"""
import os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-src')
OUT = os.path.join(ROOT, 'public', 'art')
os.makedirs(OUT, exist_ok=True)


def load(n):
    return np.array(Image.open(os.path.join(SRC, f'ref{n}.webp')).convert('RGB')).astype(np.float32)


def save_rgba(rgb, alpha, name, scale=2, sharpen=True, pad=2):
    """rgb HxWx3 float (0-255), alpha HxW float (0-1). Crops to alpha bbox, upsamples, writes PNG."""
    ys, xs = np.where(alpha > 0.06)
    if len(ys) == 0:
        print('EMPTY', name)
        return
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + 1 + pad), max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + 1 + pad)
    rgb = rgb[y0:y1, x0:x1]
    a = alpha[y0:y1, x0:x1]
    # premultiplied resize avoids dark fringes
    pm = rgb * a[..., None]
    h, w = a.shape
    if scale != 1:
        pm = cv2.resize(pm, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
        a = cv2.resize(a, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    a = np.clip(a, 0, 1)
    col = pm / np.maximum(a[..., None], 1e-3)
    col = np.clip(col, 0, 255)
    if sharpen:
        blur = cv2.GaussianBlur(col, (0, 0), 1.2)
        col = np.clip(col + (col - blur) * 0.6, 0, 255)
    out = np.dstack([col, a * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, name + '.png'), optimize=True)
    print('ok', name, out.shape[1], 'x', out.shape[0])


def key_black(img, lo=26, hi=80, fill=False, dil=0):
    """Alpha from brightness for light artwork on black."""
    mx = img.max(axis=2)
    a = np.clip((mx - lo) / (hi - lo), 0, 1)
    if fill:
        m = a > 0.35
        if dil:
            m = ndi.binary_dilation(m, iterations=dil)
        m = ndi.binary_fill_holes(m)
        a = np.maximum(a, ndi.gaussian_filter(m.astype(np.float32), 0.8))
        a = np.where(m, np.maximum(a, 0.0), a)
    return a


def seg_object(img, bg=None, thr=38, close=3, keep='all', min_area=120, feather=0.9, erode=0):
    """Foreground mask by colour distance from the background. keep='largest' or 'all' blobs above min_area."""
    h, w, _ = img.shape
    if bg is None:
        border = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]])
        bg = np.median(border, axis=0)
    d = np.sqrt(((img - bg) ** 2).sum(axis=2))
    m = d > thr
    m = ndi.binary_closing(m, iterations=close)
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n:
        areas = ndi.sum(m, lab, range(1, n + 1))
        if keep == 'largest':
            k = int(np.argmax(areas)) + 1
            m = lab == k
        else:
            keepl = [i + 1 for i, a in enumerate(areas) if a >= min_area]
            m = np.isin(lab, keepl)
    if erode:
        m = ndi.binary_erosion(m, iterations=erode)
    a = ndi.gaussian_filter(m.astype(np.float32), feather)
    return a


def comps(mask, min_area=150, merge=6):
    """Bounding boxes of connected components (after dilation to merge fragments), sorted by x."""
    dm = ndi.binary_dilation(mask, iterations=merge)
    lab, n = ndi.label(dm)
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        if sl is None:
            continue
        area = (lab[sl] == i + 1).sum()
        if area < min_area:
            continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    boxes.sort()
    return boxes


def crop(img, box):
    x0, y0, x1, y1 = box
    return img[y0:y1, x0:x1]


# ------------------------------------------------------------------ ref4: icon set (white/coloured on black)
def icons():
    im = load(4)
    rows = [
        ((712, 762, 1265, 821), ['icon_treasure', 'icon_enemy', 'icon_boss', 'icon_shop', 'icon_rest', 'icon_crown', 'icon_skull']),
        ((712, 846, 1265, 894), ['icon_engine', 'icon_shield', 'icon_wheel', 'icon_rocket', 'icon_cannon', 'icon_gear', 'icon_heart', 'icon_shieldstat']),
    ]
    for (x0, y0, x1, y1), names in rows:
        sub = im[y0:y1, x0:x1].copy()
        if y0 == 762:
            sub[:14, :128] = 0  # header underline of the '14 ICON SETS' banner
        a = key_black(sub, 40, 95)
        boxes = comps(a > 0.4, min_area=250, merge=5)
        if len(boxes) != len(names):
            print('icon row: expected', len(names), 'found', len(boxes), boxes)
        for b, n in zip(boxes, names):
            pad = 3
            bx = (max(0, b[0] - pad), max(0, b[1] - pad), min(sub.shape[1], b[2] + pad), min(sub.shape[0], b[3] + pad))
            c = crop(sub, bx)
            save_rgba(c, key_black(c, 30, 85), n, scale=3)


def abilities():
    im = load(4)
    # frames of the four ability hotkeys (torn white outline, black fill)
    boxes = {'ab_boost': (293, 368, 370, 438), 'ab_ram': (370, 368, 447, 438), 'ab_turret': (446, 368, 525, 438), 'ab_mine': (526, 368, 606, 438)}
    for n, b in boxes.items():
        c = crop(im, b)
        a = key_black(c, 38, 90, fill=True, dil=1)
        save_rgba(c, a, n, scale=3)


def relics():
    im = load(4)
    sub = im[520:580, 12:352]
    a = key_black(sub, 34, 90, fill=True, dil=1)
    boxes = comps(a > 0.4, min_area=300, merge=3)
    names = ['relic_crown', 'relic_flame', 'relic_hex_purple', 'relic_clover', 'relic_gear', 'relic_empty']
    if len(boxes) != len(names):
        print('relics expected', len(names), 'found', len(boxes), boxes)
    for b, n in zip(boxes, names):
        c = crop(sub, (max(0, b[0] - 2), max(0, b[1] - 2), b[2] + 2, b[3] + 2))
        save_rgba(c, key_black(c, 30, 85, fill=True, dil=1), n, scale=3)


# ------------------------------------------------------------------ ref5: parts & weapons on dark navy panel
def parts():
    im = load(5)
    # generous cells (x0,y0,x1,y1) in ref5 coordinates; labels sit below and are excluded by y-limits
    W = {
        'w_cannon': (932, 414, 1030, 483), 'w_shotgun': (1018, 418, 1093, 481), 'w_laser': (1090, 414, 1165, 481),
        'w_rocket': (1163, 414, 1240, 481), 'w_minigun': (1236, 411, 1338, 484),
        'p_ram': (934, 503, 1016, 586), 'p_plow': (1012, 503, 1080, 580), 'p_spikes': (1070, 503, 1146, 571),
        'p_shield': (1144, 500, 1200, 572), 'p_booster': (1197, 507, 1260, 575), 'w_mine': (1256, 500, 1340, 570),
    }
    for n, b in W.items():
        c = crop(im, b)
        a = seg_object(c, thr=46, close=2, keep='largest', feather=0.8)
        save_rgba(c, a, n, scale=3)


def wheels():
    im = load(5)
    boxes = {'wheel_spiked': (934, 621, 993, 690), 'wheel_void': (990, 621, 1044, 690), 'wheel_slick': (1042, 621, 1094, 690), 'wheel_rose': (1091, 621, 1145, 690)}
    for n, b in boxes.items():
        c = crop(im, b)
        a = seg_object(c, thr=30, close=2, keep='largest', feather=0.8)
        save_rgba(c, a, n, scale=3)


def cosmetics():
    im = load(5)
    boxes = {'cos_banner_skull': (1160, 622, 1200, 683), 'cos_crown': (1205, 622, 1236, 645), 'cos_flame_heart': (1240, 620, 1276, 658),
             'cos_bunny': (1205, 658, 1236, 686), 'cos_checker': (1240, 660, 1276, 690), 'cos_banner_red': (1280, 618, 1324, 692)}
    for n, b in boxes.items():
        c = crop(im, b)
        a = seg_object(c, thr=34, close=1, keep='largest', feather=0.6)
        save_rgba(c, a, n, scale=4)


def grabcut(img, rect, iters=6):
    """OpenCV GrabCut inside a rectangle -> soft alpha. rect=(x,y,w,h) relative to img."""
    m = np.zeros(img.shape[:2], np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img.astype(np.uint8), m, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
    lab, n = ndi.label(fg)
    if n > 1:
        areas = ndi.sum(fg, lab, range(1, n + 1))
        fg = (lab == int(np.argmax(areas)) + 1).astype(np.uint8)
    fg = ndi.binary_fill_holes(fg)
    return ndi.gaussian_filter(fg.astype(np.float32), 1.0)


def portraits():
    def rect(ref, name, box, scale=3, q=92):
        im = load(ref)
        c = crop(im, box)
        Image.fromarray(c.astype(np.uint8)).resize((int(c.shape[1] * scale), int(c.shape[0] * scale)), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), quality=q)
        print('ok', name)
    rect(4, 'por_cat_grin', (957, 303, 1098, 415), 4)
    rect(3, 'por_cat_smug', (0, 372, 150, 492), 4)
    rect(1, 'por_cat_mono', (2, 584, 98, 696), 5)
    im = load(2)
    c = crop(im, (26, 630, 138, 748))
    a = grabcut(c, (3, 6, 104, 108))
    save_rgba(c, a, 'por_pilot_grin', scale=4)
    rect(2, 'por_gremlin', (1234, 582, 1318, 690), 5)


def hud_car():
    im = load(4)
    c = crop(im, (4, 145, 124, 246)).copy()
    red = (c[..., 0] > 140) & (c[..., 1] < 90) & (c[..., 2] < 90)
    c[red] = 0
    a = key_black(c, 40, 100, fill=True, dil=1)
    a[red] = 0
    save_rgba(c, a, 'hud_car', scale=3)


def cards():
    im = load(5)
    cards = {'card_legendary': (940, 152, 1064, 380), 'card_rare': (1073, 152, 1197, 380), 'card_epic': (1207, 152, 1341, 380)}
    for n, b in cards.items():
        c = crop(im, b)
        Image.fromarray(c.astype(np.uint8)).resize((c.shape[1] * 3, c.shape[0] * 3), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=90)
    # just the illustration windows of the cards (no text) for use as item art
    arts = {'art_ram': (958, 197, 1053, 270), 'art_gatling': (1092, 197, 1187, 270), 'art_tire': (1226, 197, 1324, 270)}
    for n, b in arts.items():
        c = crop(im, b)
        Image.fromarray(c.astype(np.uint8)).resize((c.shape[1] * 4, c.shape[0] * 4), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=92)


def enemies_sheet():
    im = load(5)
    boxes = {'en_buggy': (940, 748, 1045, 818), 'en_trucker': (1048, 705, 1178, 818), 'en_bishop': (1178, 703, 1340, 820)}
    for n, b in boxes.items():
        c = crop(im, b)
        a = seg_object(c, thr=34, close=3, keep='largest', feather=0.9)
        save_rgba(c, a, n, scale=3)


def env_sheet():
    im = load(5)
    boxes = {'env_arch': (540, 750, 700, 850), 'env_crystal': (640, 745, 760, 850), 'env_chest': (545, 800, 690, 850)}
    for n, b in boxes.items():
        c = crop(im, b)
        Image.fromarray(c.astype(np.uint8)).resize((c.shape[1] * 3, c.shape[0] * 3), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=90)


if __name__ == '__main__':
    which = sys.argv[1:] or ['icons', 'abilities', 'parts', 'wheels', 'cosmetics', 'portraits', 'hud_car', 'cards', 'enemies_sheet', 'env_sheet']
    for w in which:
        globals()[w]()
