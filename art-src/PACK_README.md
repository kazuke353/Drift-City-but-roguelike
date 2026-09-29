# Dungeon Drive — raster game assets

A cohesive original asset pack for a cel-shaded car-combat dungeon looter. **18 individually generated PNGs**, created with the built-in GPT Image tool. Every item has its own file. All PNG masters are 1254 × 1254 pixels; 14 have verified alpha transparency and four are opaque material images. There is no composite concept sheet, game implementation, or required application dependency.

## Asset inventory

| Folder | Files | Intended use |
|---|---:|---|
| `textures/` | 4 | Floor, masonry, salvaged armor, molten hazard materials |
| `inventory/` | 6 | Car, enchanted V8 engine, wheel, battering ram, chest, coin |
| `weapons/` | 3 | Autocannon, arc cannon, scattergun inventory artwork |
| `decals/` | 2 | Portal sigil and finite tire skid stamp |
| `vfx/` | 2 | Single-frame muzzle flash and arcane impact particles |
| `ui/` | 1 | Empty legendary loot-card frame |

The equipment, decal, effect, and frame assets use real PNG transparency. The material images are opaque. Native resolutions and alpha measurements are recorded per file in [manifest.json](manifest.json).

## Start here

1. Browse the six image folders and import the files you need.
2. Follow [docs/IMPORT_GUIDE.md](docs/IMPORT_GUIDE.md) for color space, wrapping, alpha, and intended use.
3. Use [manifest.json](manifest.json) for asset IDs, dimensions, normalized pivots, hashes, and import suggestions.
4. Read [docs/quality-report.json](docs/quality-report.json) for measured transparency, canvas-edge checks, and texture edge differences.
5. Reuse the full prompt set in [docs/generation-prompts.md](docs/generation-prompts.md) to expand the pack's visual direction.

## What the files contain

These are raster textures, decals, particles, and inventory illustrations. Vehicle and equipment sprites show a fixed view. GPT Image does not produce rigged 3D meshes, UV-unwrapped car models, PBR map sets, or animation clips. Use the surface textures on your own dungeon geometry, and the isolated equipment images in inventories, loot cards, menus, or fixed-view sprites.

The source images are retained at their native dimensions and copied byte-for-byte from GPT Image outputs. No resizing, color-keying, hand-painted replacement, or programmatic image generation was used. The archive includes this folder's assets and documentation.
