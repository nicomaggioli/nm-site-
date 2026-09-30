# Cosmic redesign: four directions (local branch `design/cosmic`)

Nico's brief, in his words: the site copies the Podium template too closely. Add colour
and differentiation so it is unmistakably his. He loves an airbrushed zip hoodie (flowing,
blended thermal-map bands; see palette) and wants that aesthetic across the whole site.
"Switch up the format a little bit to resemble the universe and wonders of the world...
push this idea that I'm this curious type who likes to create stuff based on the wonders of
the universe." Replace the NM cloud at the bottom with a black hole; glittering stars in the
background. Build a few versions to compare on localhost. Keep ALL existing material.

His taste (from past feedback): bold single concepts with pro craft. He rejects anything that
reads generic or "AI-looking" (glossy stock gradients, loud fast motion, chrome blobs).
Motion he likes: slow, organic, liquid. Handmade texture matters: the hoodie is sprayed,
so spray grain / speckle and soft overspray edges are the signature, not smooth vector
gradients.

## Palette (sampled from the hoodie photo)

| token | hex | where it appears on the hoodie |
|---|---|---|
| cream | `#EDE1CC` | large warm fields |
| warm white | `#F4F8F0` | brightest cloth, hood |
| ice | `#C6CDC6` / sky `#BCD3E0` | cool pale areas, sleeve blues |
| peach | `#E9B4A3` | soft transitions |
| coral | `#E3837A` | the flowing bands |
| deep coral | `#CA5855` | band cores |
| violet fleck | `#6E6BD6` | one small spot at the shoulder; use sparingly as a rare accent |

The live site's accent is orange `#FF7820` on `#0a0a0a`. Directions may retire or keep the
orange, but the hoodie palette must lead.

## How the preview works

- `js/nm-theme.js` (sync, in each page's head) reads `?theme=nebula|horizon|atlas|cosmati` (remembered
  in localStorage; `?theme=current` returns to the live design), sets
  `<html data-nm-theme="NAME">` before first paint, creates `window.NMThemeConfig = {}`, then
  loads, in order and without blocking: `/css/theme-NAME.css`, `/js/theme-NAME.js`,
  `/js/nm-cosmos.js`, `/js/nm-blackhole.js`. A floating pill switches versions.
- With no theme active the site must look and behave exactly like the live site.
- Pages: `/` (React/WebGL homepage), `/index/` (static gallery), `/about/` (static).
- Local server: `http://localhost:8820/` (serves the repo working tree; no build step).
- `window.__nmReady(fn)` runs `fn` after the homepage React commit (and at load on static
  pages). Mount DOM additions there. Never rewrite React-owned text nodes or use
  document-wide MutationObservers (see docs/maintenance.md).

## Shared modules (built once, used by all directions)

### `js/nm-cosmos.js` → `window.NMCosmos`

Reads `NMThemeConfig.stars`, `NMThemeConfig.airbrush`, `NMThemeConfig.grain` on
`__nmReady` and mounts page layers automatically (a theme may also call the API directly).

- `NMCosmos.stars(opts)`: twinkling starfield. Real-sky feel: power-law brightness (many
  faint, few bright), slight colour temperature (ice-blue / white / cream / peach), only a
  fraction scintillating, never uniform blinking; optional rare slow shooting star; optional
  gentle scroll parallax. Mount as a fixed full-viewport layer behind content or inside a
  given element. Options include density, brightness, palette, twinkle amount, parallax,
  `visibleWhen` (a function or scroll range so a theme can fade stars in by section).
- `NMCosmos.airbrush(opts)`: animated airbrushed colour field in the hoodie palette.
  Flowing domain-warped bands like the hoodie (not generic blurry blobs), soft overspray
  edges, visible spray grain/speckle. Modes: `bands` (fabric-like, can be a light ground),
  `nebula` (dark ground, low-alpha blooms). Options: palette stops, opacity, scale, speed,
  target element or fixed page layer, blend mode, and a `progress` hook so a theme can
  drive it from scroll.
- `NMCosmos.grain(opts)`: cheap spray-speckle overlay (generated noise texture), static or
  slow.
- Budget: render fields at reduced resolution and upscale; cap DPR at 1.5; cap to 30fps
  for ambient layers; pause in hidden tabs, when offscreen, and while Cloud Run is open;
  one still frame under prefers-reduced-motion; phones get lighter settings. Degrade to
  CSS gradients if WebGL is unavailable.

### `js/nm-blackhole.js` → `window.NMBlackHole` (+ bundle hooks)

- Replaces the NM cloud in the footer on all three pages when a theme is active; with no
  theme, the cloud stays exactly as it is.
  - Home: the cloud is three.js points drawn in the single global canvas by the `nm-home-*`
    bundle (`models/nm-cloud.bin`). Stop drawing it when `window.__nmTheme` is set.
  - About: `js/nm-footer.js` (WebGL). Index: `js/nm-footmark.js` (2D canvas). Skip their
    cloud when themed and mount the black hole in the same host.
- Visual: a believable black hole, Interstellar-style: pure-black event-horizon disk,
  thin bright photon ring, an accretion disk seen slightly above edge-on whose far side is
  gravitationally lensed over the top and under the bottom of the shadow, Doppler-brighter
  on one side, slow turbulent rotation. Coloured with the hoodie palette (deep coral outer
  disk → coral → peach → cream → near-white/ice at the hot inner edge) and finished like
  airbrush: soft glow falloff with spray grain, not a clean vector ring. Faint lensed stars
  around it are a plus.
- It keeps the cloud's job: it is the Cloud Run door (a keyboard-accessible button that
  opens the game), sits where the cloud sat above "WHERE VISIONS COME TRUE / WORK WITH ME",
  and keeps the static fallback and contact actions if WebGL is unavailable.
- Config from `NMThemeConfig.blackHole` (palette, scale, tilt, intensity, spin, position).
- Hero hook: when `NMThemeConfig.heroClear` is true, the homepage hero must draw only the
  NM collage mask and leave everything outside the mark transparent, so the theme's page
  background (stars, airbrush) shows behind the hero. With no theme, the hero is unchanged.
- Budget: fragment shader at reduced resolution (upscaled), DPR cap 1.5, run only when the
  footer is on screen in a visible tab and Cloud Run is closed, still frame for reduced
  motion, lighter on phones.
- Bundle rules: changed `_next/static/chunks/*` bundles get a new filename (first 12 hex of
  the file's SHA-256) and every reference in `index.html` is updated (4 references for
  nm-home). Keep the previous bundle files in place. The current hero bundle is
  `nm-home-a0a65c8c3e9d.js` (includes the interactive "lava" hero, `js/nm-lava.js`).

## The four directions

Each direction owns only `css/theme-NAME.css` and `js/theme-NAME.js` (plus new assets
under `media/theme-NAME/` or self-hosted OFL fonts under `fonts/` with their licence).
Scope every rule under `html[data-nm-theme="NAME"]`.

### 1. Nebula: same site, under a night sky painted with an airbrush

Lowest-risk evolution. Keep the layout. The flat black becomes deep space (near-black with a
faint blue-violet cast) with a fixed twinkling starfield and slow airbrushed nebula blooms in
the hoodie palette drifting behind content (strongest around the hero and footer, faint behind
text). The orange accent becomes the airbrush: gradient-sprayed text for the "Hey, I'm Nico!"
highlight, the active service title and key words; pills and hairlines pick up soft
coral-to-ice gradients. Small cosmic touches in the framing (a star glyph on section tags,
faint orbit arcs in margins). Black hole footer. Gallery wall stays edge-to-edge.

### 2. Horizon: from the wonders of the world to the wonders of the universe

A scroll journey from day to night. The top of each page is bright airbrushed ground like the
hoodie fabric itself (cream / warm white / ice with flowing coral and peach bands and visible
spray grain; the hero NM collage sits on it). Scrolling deepens it through golden hour and
dusk (coral, deep coral, violet) into night: stars appear, and the footer is deep space with
the black hole. Text colour flips with the ground (dark ink on the light sections, light on
the dark ones) with AA contrast throughout. Format device: altitude markers as sections pass,
e.g. "0 m · Earth", "12 km · Sky", "100 km · Kármán line", "408 km · Orbit",
"∞ · Event horizon". Keep them as small mono labels, not new copy.

### 3. Atlas: a field guide to wonders, drawn like a star atlas

The biggest format change. Deep navy-black ground with a fine coordinate graticule, crosshair
ticks and faint constellation lines linking section anchors, like an astronomer's plate.
Every work image carries a soft airbrushed thermal halo (the hoodie's heat-map colours
glowing out from behind it, as if the work emits light), stronger on hover. Mono catalogue
annotations frame existing content: services get catalogue IDs, the live sites list reads as
a catalogue of known worlds with the coordinates styling the site already uses, gallery tiles
show plate numbers on hover. The footer black hole is annotated like a diagram plate (event
horizon, photon ring, accretion disk labels with leader lines). Starfield behind everything.

### 4. Cosmati: the universe, inlaid (ultra-detailed)

Nico's follow-up: "a super ultra-detailed version, kind of like Italian tiles, super detailed,
like Persian carpets." The bridge to the cosmic brief is real: Cosmatesque pavements (the
Great Pavement at Westminster, Roman basilica floors) are the cosmos laid in stone, Persian
carpet medallions stand for the heavens, and Islamic girih tilings are built from stars. So
this version is ornament at every scale, drawn with the rigour of real tile and carpet work:

- Ground: a deep carpet field with a faint all-over micro-pattern (a small-scale girih or
  star-and-cross tiling at low contrast) so even empty space rewards a close look.
- Borders: sections framed like carpet borders: a main border band (palmette/meander or
  star-and-cross tiles) flanked by thin guard stripes (reciprocal triangles, beading, cord).
  Corner pieces (spandrels) where borders meet.
- Tile bands: majolica-style tile strips as section dividers: 4-fold symmetric tiles
  (rosettes, quatrefoils, 8/12-point stars) glazed in the hoodie palette, with hand-painted
  life: slight line wobble, glaze pooling and colour bleed (the hoodie's airbrush becomes
  glaze), a hairline craquelure.
- Hero: the NM collage sits inside a medallion: a girih star rosette frame with corner
  spandrels, like the centre of a carpet.
- Work images: thin inlay frames (tessera strips) around gallery/service images; the
  gallery wall itself stays edge-to-edge and unobstructed.
- Footer: the black hole is the central medallion of a Cosmati roundel: concentric rings of
  interlaced guilloche and tesserae spiralling into the singularity.
- Colour: hoodie palette as glazes (cream/warm-white grounds, coral and deep coral, ice and
  sky blue, the violet fleck as a rare accent), plus one deep ink (indigo-black or oxblood)
  for linework and the carpet field. Crisp at every DPR.
- Type: an elegant classical display face for headings is welcome (self-host an OFL font
  under fonts/ with its licence); body stays Geist.
- Build the ornament procedurally (exact geometry in SVG/canvas, rendered once to pattern
  images and reused), not as heavy live DOM; any motion is slow and minimal (a medallion
  ring turning imperceptibly, a few stars in the tiling glinting).

## Non-negotiables for every direction

- Keep all existing content and behaviour: header (name pill, nav, coordinates popup, phone
  menu), hero NM collage + lava interaction, grid zoom, statement, "Made things for" logos,
  services accordion + images, live sites list + previews, gallery + lightbox, About +
  résumé, contact links, footer, Cloud Run game (opened from the black hole).
- Text contrast AA. Focus styles stay visible.
- Works at 1440×900, 1920×1080 and a 390×844 phone; no horizontal scroll.
- Respects reduced motion; no measurable jank on the homepage scroll (the site already runs
  a WebGL hero and videos, so keep ambient layers cheap).
- `?theme=current` (no theme) is byte-for-byte the live look.

## Tools

- Screenshots: `node $RIG/shots.mjs --url "http://localhost:8820/?theme=NAME" --out DIR --prefix home --at 0,0.2,0.4,0.6,0.8,1 [--mobile] --port P`
- Probe/eval: `node $RIG/probe.mjs --url URL --eval "expr" --port P` (prints the value and page errors)
- `$RIG` = the scratchpad rig directory given in your task. Use a unique CDP port range.
