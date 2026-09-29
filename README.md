# DUNGEON DRIVERS
### Cars. Loot. Dungeons. Repeat.

A cel-shaded **car-combat looter-shooter roguelike** that runs in the browser. Bolt guns onto a muscle car,
drift through fantasy crypts that were never meant for cars, ram skeletons into next week, and drive home
rich — or get wrecked trying.

Inspired by *Borderlands 2* vehicle combat and camera, *Drift City*'s drifting, and a *Persona 5*-style UI.

---

## Play

```bash
npm install
npm run dev      # then open the printed URL
```

Production build: `npm run build` (outputs a static site in `dist/`, deployable anywhere — `base` is relative).

Requires a desktop browser with WebGL2. Click the game view to capture the mouse.

## Controls

| Input | Action |
| --- | --- |
| **W** | Accelerate — the car steers toward where you look (Borderlands 2 style) |
| **S** | Brake / reverse |
| **A / D** | Manual steering (or switch to *Classic A/D* steering in Settings) |
| **Mouse** | Orbit camera & aim |
| **LMB / RMB** | Fire turret / fire side gun |
| **Space** | Handbrake — hold while turning to **drift**; charge blue → orange → purple sparks, release for a boost |
| **Shift** | Nitro |
| **Q** | Gadget (mines, hydraulic hop, shock pulse, sentry turret, bubble ward, gravity well) |
| **R** | Reload |
| **H** | Horn (knocks enemies back — *HONK AND YE SHALL DIE*) |
| **E / F / X** | Equip / stash / salvage loot · **E** also interacts |
| **1 2 3** / **T** | Pick a perk on level up / reroll |
| **Tab** · **M** · **Esc** | Loadout · map · pause |
| **C** | Look behind |

Gamepad is supported too (sticks, triggers fire, A handbrake, RB nitro, Y gadget, X interact).

## Features

- **Arcade car physics** with grip/slide, Mario-Kart style drift charging, nitro, jump ramps and hydraulic hops,
  ramming that launches enemies across the room, and a *Last Gear* second wind (get a kill before your engine dies).
- **Four chassis**: Rustbucket (muscle car), Will-o-Wisp (buggy), Grave Digger (hearse), Juggernaut (monster truck) —
  each with its own passive.
- **Borderlands-style loot**: 5 rarities, 12 weapon types (machine gun, minigun, cannon, shotgun, laser, flamethrower,
  tesla coil, railgun, rocket pod, swarm missiles, mortar, saw launcher), manufacturers, elemental effects
  (fire / shock / corrosive / cryo), parts (plows, engines, wheels, shields, gadgets) and 20+ legendaries with unique
  effects. Guns and parts visibly change your car.
- **Roguelike runs**: 3 acts × 3 floors of procedurally generated dungeons (Gilded Crypt, Crystal Vaults, Ashen Crypt),
  locking combat rooms with waves, elite rooms holding the floor's Keystone, treasure rooms (and mimics), vaults,
  goblin merchant shops, shrines, and a choice of two exit portals with floor modifiers.
- **Build-crafting**: level-up perks, 34 relics with tag synergies, and a meta-progression Garage paid for in Crowns.
- **13 enemy types + elite modifiers** and **three bosses**: *The Iron Bishop*, *The Hoardlord* (a skeletal dragon on a
  treasure war-cart) and *The Bone Sovereign*.
- **Cel-shaded rendering**: toon ramps, screen-space ink outlines from depth + normals, rim lighting, baked torch
  lighting, bloom, comic hatching, speed lines and chunky cartoon explosions.
- **Fully procedural audio**: every sound effect and the adaptive metal/synth soundtrack are synthesized with WebAudio.
- A Persona-inspired UI with a cat-mechanic navigator, Sprocket.

## Tech

TypeScript + [three.js](https://threejs.org) + Vite. 3D models are generated in code; textures, UI art and portraits
come from the supplied reference sheets and the *Dungeon Drive* asset pack (see below); audio is synthesized.

```
src/
  core/      input, RNG, save data
  render/    renderer & post-processing (ink outlines, SSAO, split-tone grade), toon / paint / stone materials,
             light map, detail textures, art loader
  world/     dungeon generation, level mesh building + dressing, light baking, collision grid & flow-field nav
  entities/  player cars (lofted bodies, camo livery), weapon models, enemies, bosses, pickups, props
  combat/    weapons, gadgets, projectiles
  loot/      items, relics, perks
  game/      game loop, world simulation, run state, camera
  audio/     synthesized SFX and adaptive music
  ui/        HUD, menus, item cards, portraits, torn-edge frames (frames.css is generated)
public/art/  sliced UI-kit art + processed asset-pack textures/sprites
art-src/     the source reference sheets (ref1-5.webp) and asset-pack notes
tools/       slice_assets.py, process_pack.py, gen_frames.py  (regenerate everything in public/art and frames.css)
```

### Regenerating art

```
pip install pillow numpy scipy opencv-python-headless
python3 tools/slice_assets.py            # icons, weapons, wheels, portraits, cards from art-src/ref*.webp
python3 tools/process_pack.py <pack-dir> # seamless textures + height maps + sprites from the asset pack
python3 tools/gen_frames.py              # torn-edge UI frames -> src/ui/frames.css
```
