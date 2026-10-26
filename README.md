# hush

An endless, quiet mountain to ski down. A browser game (three.js + Vite): carve, float off
natural lips, thread the trees, watch the day turn over. No score to chase.

## Play

`npm install && npm run dev` then open http://127.0.0.1:5290

| | |
|---|---|
| ← → / A D | carve (edge angle sets the arc) |
| ↑ / W | tuck, or skate on the flats |
| ↓ / S | slow down (skid) |
| Space | hold to load, release to pop |
| ← → in the air | spin (let go and press again after a lip) |
| Shift / E in the air | grab |
| C | follow / cinematic / drone camera |
| T | next time of day |
| P | photo mode (drag to orbit, scroll to zoom) |
| M | music |
| R | a fresh line further down |
| Esc | settings |

Gamepad: left stick, triggers tuck/slow, A to pop. Touch: hold the left or right third of
the screen to carve, middle to pop.

## How it's made

- `src/world.js` — the one height function (downhill is +z, forever): a meandering valley
  between ridged ranges, benches with natural lips, rollers. Trees, rocks, powder all sample it.
- `src/terrain.js` + `terrainWorker.js` — LOD chunks streamed by workers (skirts, alternating
  diagonals), one warped far grid for the ranges, snow shader with glints, rock, far canopy.
- `src/sky.js` — painted sky dome keyed on the sun's elevation (night, blue hour, golden hour,
  day), clouds, stars, moon; the dome is re-baked into the image-based light as the sun moves.
- `src/atmos.js` — height fog + aerial perspective patched into every material; tileable noise.
- `src/props.js` — instanced spruce (bough cards + dense core / cones far away) and boulders.
- `src/rider.js` — a procedurally lofted, skinned skier (jacket, pants, sleeves) with IK legs
  and arms, helmet, mirrored goggles, skis and poles.
- `src/skier.js` — physics: sidecut carving, skids, powder drag, airs when gravity can't follow
  the ground, spins, soft landings, gentle wipeouts.
- `src/camera.js`, `src/fx.js`, `src/post.js`, `src/audio.js` — cameras, spray/tracks/snowfall,
  bloom + filmic grade, synthesized wind/ski sounds and a generative ambient score.
- Floating origin rebases every kilometre so precision never runs out.

Tools: `tools/shot.mjs`, `tools/multi.mjs` (several looks, `__freeCam`, `__lookTree`),
`tools/play.mjs` (real key presses, logs airs/wipes), `tools/eval.mjs`.

Textures: Poly Haven Snow 02 and Rock Face 04 (CC0). Everything else is generated in code.
