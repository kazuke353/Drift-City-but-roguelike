#!/usr/bin/env python3
"""
Processes the 'Dungeon Drive raster asset pack' (unzipped to PACK_DIR) into web-sized game assets in public/art.
  - textures are made seamless (edge cross-blend) and resized to 1024; height maps are derived from luminance
  - sprites are trimmed to their alpha bounds and resized
Run:  python3 tools/process_pack.py /path/to/dungeon-drive-assets
"""
import os, sys
import numpy as np
import cv2
from PIL import Image

PACK = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/assets_zip/dungeon-drive-assets'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'art')
os.makedirs(OUT, exist_ok=True)


def seamless(a):
    """Cross-blend an image with a half-shifted copy so opposite edges match."""
    h, w = a.shape[:2]
    out = a.astype(np.float32)
    for axis in (1, 0):
        n = out.shape[axis]
        t = np.abs(np.linspace(-1, 1, n))  # 1 at edges, 0 at centre
        m = (1 - t) ** 0.8  # weight of the original: 1 in the middle, 0 at the borders
        shape = [1, 1, 1]
        shape[axis] = n
        m = m.reshape(shape) if out.ndim == 3 else m.reshape(shape[:2])
        out = out * m + np.roll(out, n // 2, axis=axis) * (1 - m)
    return out


def save_tex(src, name, size=1024, make_seamless=True, height=False, q=88):
    im = np.array(Image.open(os.path.join(PACK, src)).convert('RGB')).astype(np.float32)
    if make_seamless:
        im = seamless(im)
    im = cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)
    Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.webp'), quality=q)
    if height:
        g = cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 1.1)
        # stretch contrast so cracks sink and slabs rise
        lo, hi = np.percentile(g, 2), np.percentile(g, 98)
        g = np.clip((g - lo) / (hi - lo + 1e-3), 0, 1)
        Image.fromarray((g * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_h.webp'), quality=88)
    print('tex', name)


def save_sprite(src, name, maxdim=512, q=92):
    im = Image.open(os.path.join(PACK, src)).convert('RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb:
        pad = 6
        bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad))
        im = im.crop(bb)
    s = maxdim / max(im.size)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), quality=q, method=6)
    print('sprite', name, im.size)


save_tex('textures/dungeon_flagstone_basecolor.png', 'tex_floor', height=True, make_seamless=False)
save_tex('textures/dungeon_masonry_basecolor.png', 'tex_wall', height=True)
save_tex('textures/salvaged_armor_basecolor.png', 'tex_metal', size=512)
save_tex('textures/molten_rift_basecolor_emission.png', 'tex_lava', size=512)

save_sprite('inventory/rally_scavenger.png', 'pk_car_rally', 720)
save_sprite('inventory/riftcharged_v8.png', 'pk_engine_v8', 512)
save_sprite('inventory/crypt_grip_wheel.png', 'pk_wheel_crypt', 512)
save_sprite('inventory/knightbreaker_ram.png', 'pk_ram', 560)
save_sprite('inventory/dungeon_loot_chest.png', 'pk_chest', 512)
save_sprite('inventory/dungeon_gold_coin.png', 'pk_coin', 256)
save_sprite('weapons/brass_jackal_autocannon.png', 'pk_w_autocannon', 560)
save_sprite('weapons/arc_relic_cannon.png', 'pk_w_arc', 560)
save_sprite('weapons/breach_hammer_scattergun.png', 'pk_w_scatter', 560)
save_sprite('decals/arcane_portal_sigil.png', 'pk_sigil', 512)
save_sprite('decals/tire_skid_segment.png', 'pk_skid', 256)
save_sprite('vfx/muzzle_flash.png', 'pk_muzzle', 256)
save_sprite('vfx/arcane_impact.png', 'pk_impact', 256)
save_sprite('ui/legendary_loot_frame.png', 'pk_frame_legend', 640)
