# Night Sky (the site's design, live since 2026-10-01)

## What Nico asked for (his words, condensed)

Keep the current website as it is. Add stars to the dark grey background: subtle, like real
stars, flickering and doing what real stars actually do. Base them on actual stars in the real
sky. Across the site, about four per page (different on every page), a well-known star sits in
a spot; hovering over that area tells a little fact about it (he liked the old coordinates
pill, so the coordinates idea lives on here). Rare shooting stars, maybe even an alien,
but subtle: "a starry scene, and these things happen super subtly".

Keep: the nav bar and the "NICO MAGGIOLI" logo as they are, the opening zoom into the logo,
the scroll into the NM collage, "View all", the big statement, everything down to the footer.
Remove: the coordinates pill (top right), "Design & Manufacturing" and "Scroll Down" (hero
captions), "Where visions come true / Work with me" (footer headline). Already done in
`css/theme-stars.css`; since 2026-10-15 the three pages also no longer load the hidden
coordinates widget (`js/nm-coord.js` / `css/nm-coord.css`, which the proposal pages still use).

Footer: "go heavy into the stars". The NM logo that is currently a cloud becomes a
constellation: the shape of a constellation is his NM mark, and it fits the sky perfectly.

He previously rejected work that only recoloured backgrounds; this one is deliberately the
original site plus a believable sky. Realism and restraint are the whole brief.

## Pieces

- `js/theme-stars.js` / `css/theme-stars.css`: theme config + the removals. Sets
  `NMThemeConfig.blackHole = false`, `heroClear = true`, and `heroBackdrop = () => [NMSky.canvas]`
  so the homepage hero paints the sky outside the NM mark (the hero samples that canvas each
  frame; a 2D canvas works as is, a WebGL canvas needs `preserveDrawingBuffer: true`).
  Loads `js/nm-sky.js`.
- A faint aurora layer (green, cyan, magenta) was tried on 2026-10-01 and removed the same day at
  Nico's request; keep the sky's colour in the stars themselves.
- `js/nm-sky.js` → `window.NMSky` (the engine; owns all star rendering, events, featured-star
  labels and the footer NM constellation; exposes `NMSky.canvas`).
- `media/sky/stars.json`: the catalogue every page draws (every BSC5 star with V <= 6, J2000,
  brightest first): `{ source, fields, count, stars: [ra_h, dec_deg, V, B−V, ...] }` (flat).
- `media/sky/{home,about,index}.json`: each page's featured stars (format below).
- Both are requested by `js/nm-theme.js` at their content versions (its `DATA` map; see
  "Performance" below), so the HTTP cache keeps them between visits.

## Data format: `media/sky/PAGE.json`

```json
{
  "page": "home",
  "featured": [
    { "id": "sirius", "name": "Sirius", "designation": "α Canis Majoris",
      "ra": 6.7525, "dec": -16.7161, "vmag": -1.46, "bv": 0.00,
      "coords": "RA 06h 45m 09s · Dec −16° 42′ 58″",
      "distance": "8.6 light-years",
      "fact": "The brightest star in the night sky." }
  ],
  "source": "Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991); facts: see docs/night-sky-facts.md"
}
```

- `featured`: exactly four per page (below), with verified one-line facts (no more than about
  110 characters, plain and specific, no hype) and the J2000 coordinates string. The engine finds
  each in the catalogue by its position (or adds it from `vmag`/`bv` if it is missing there).
- The framing (view centre, roll and the pan through the sky as you scroll) is `VIEWS` in
  `js/nm-sky.js`; every featured star must pass through the viewport during a scroll of the page.
- Until 2026-10-01 these files also carried their own `stars` and `view`; the engine never read
  them (it draws the full catalogue and has its own framing), so they were dropped. How they were
  built is in `docs/night-sky-facts.md`.
- After editing any sky file run `python3 tools/build-theme-versions.py`.

### Regions and featured stars

| page | sky | featured |
|---|---|---|
| home | Orion, Canis Major, Taurus (winter sky) | Sirius, Betelgeuse, Rigel, Aldebaran |
| about | Summer Triangle: Lyra, Cygnus, Aquila | Vega, Deneb, Altair, Albireo |
| index | the northern pole: Ursa Minor, Ursa Major, Draco | Polaris, Mizar (with Alcor), Dubhe, Thuban |

## Engine requirements (`js/nm-sky.js`)

- One fixed, full-viewport canvas behind all content (below `#global-canvas`, at a negative
  z-index), `pointer-events: none`, `aria-hidden`. Sections that paint
  the flat #0a0a0a are made transparent in `css/theme-stars.css` so the sky shows; text stays
  readable (the sky is dim).
- Real sky, projected stereographically around the view centre; the page's flat dark grey stays
  the ground colour. Brightness from magnitude (most stars barely there, a few bright), tiny
  sharp cores with a soft halo only on the brightest, colour from B−V (Betelgeuse and Aldebaran
  orange, Rigel and Vega blue-white), crisp at DPR 2. No constellation lines except the NM one.
- Realistic behaviour: atmospheric scintillation (independent, irregular brightness flicker,
  stronger for bright stars; the brightest can flash slight colours like Sirius does), a slow
  turn of the sky as you scroll (the view pans along `scrollPan`) and an almost imperceptible
  drift over time.
- Rare events, all subtle and small: shooting stars (a short fading streak every minute or two
  at random), the occasional satellite (a steady dim dot crossing slowly over tens of seconds,
  sometimes fading out mid-sky as it enters Earth's shadow), and very rarely a tiny UFO (three
  dim lights gliding, pausing and darting away, easy to miss).
- Featured stars: when the pointer comes within about 28px of a featured star that is visible
  in open sky (not covered by text, images or video at that point), a small label fades in
  beside it, styled like the site's existing mono labels: name and designation, the
  coordinates line, distance, the fact. It fades out when the pointer leaves. A tap near the
  star does the same on touch screens. A barely-there brightening as the pointer nears is fine;
  no permanent markers.
- Footer: as the footer comes into view the sky gets "heavier": more and brighter faint stars
  and a faint Milky Way glow. The NM mark appears as a constellation where the cloud was (same
  size and position): about 18–28 stars of varied brightness placed on the shape of the NM mark
  (derive positions from `textures/nm-mark-sdf.png`: the four uprights with their round ends,
  the narrow waists and the diagonals), joined by thin, faint constellation-chart lines. It is
  rendered with exactly the same star look and twinkle as the sky. It stays the Cloud Run door
  (clicking it opens the game, keyboard accessible, as the cloud was). Hovering it can show a
  label in the same style, e.g. "NM · Boston, MA · 42.3601° N 71.0589° W".
- Pages: `/`, `/about/`, `/index/`, each with its own sky file.
- Budget: one canvas, about 30fps for twinkle, pause in hidden tabs and while Cloud Run is open,
  a single still frame (no events) under prefers-reduced-motion, no measurable scroll jank.
  The homepage already runs the WebGL hero and videos.
- With no theme (`?theme=current`) nothing changes.

## The pointer's wake (removed)

Nico asked for the stars to ease away from a moving cursor (2026-10-01), saw it live and had it
removed ("I don't like that"). It was switched off the same week and its code (the `pointermove`
path, the `WK` tuning, the shaders' `wake()` and `NMSpace.wake`) was stripped by the commit
"Night Sky: strip the cursor wake"; it is in git history before that. Neither layer reacts to the pointer except the
featured stars' hover labels.

## Performance (2026-10-01)

The look is unchanged; these change only when and how often the work is done.

- One beat for both layers. At rest the particle space and the sky redraw at ~30 fps on the same
  frames: `NMSpace.tick(now)` returns the frame's `{ t30, t60 }`, keyed by the rAF timestamp, so it
  does not matter which loop runs first (the space's loop or the sky's, which restart on their
  own after a hidden tab or Space Run). The sky's overlay nodes and footer canvas follow the same
  beat; without the space the sky keeps its own 31 ms clock. While the camera glides both still
  draw every display frame (60 or 120 Hz). `NMSpace.drawN` and `NMSky.drawN` count draws: the
  homepage hero (`nmClear` in the `nm-home-*` bundle) copies the space or sky canvas into its
  backdrop texture only when it has drawn since the last copy (still on the hero's every-other-
  frame cadence, one canvas a frame in Safari), so at rest on a 120 Hz screen, or under reduced
  motion, it skips the copies of unchanged frames.
- Start-up. The space is built at mount, as it always was: moved to the next frame or to tasks of
  its own, it pushed back either the homepage hero's first frame or its own on a throttled phone
  (the logo forming on an empty sky, or late). Only the wait for the driver is gone: the shaders go
  to the driver first and compile in parallel while the particles are made, and their results are
  read once `KHR_parallel_shader_compile` reports them done (by then, as a rule; else at the next
  frame, which then draws the first one). `NMSpace.whenReady(fn)` runs fn once it has started (or
  has failed). The sky builds its sprite atlas in a task of its own (one pixel buffer and one
  `putImageData`, the same pixels as before), and when its data is in: the catalogue; the
  context, shader and footer; then, once the space is ready (so its first frame already turns
  with that camera), the layout, text mask and first frame.
- Star data early. `js/nm-theme.js` asks for `stars.json` and the page's file at their content
  versions (its `DATA` map) while the scripts load: About from `<head>`, Index right after its
  first paint (asked during the parse, on a throttled phone it pushed the wall's first image back
  ~70 ms; after the paint it still shares the line with the wall's first images: on a Fast 4G
  phone the largest one lands ~30 ms and the particle space ~0.1 s later, the stars ~0.45 s
  sooner), the homepage after hydration at low priority (behind the hero). `window.__nmSkyData`
  is that promise and `window.__nmSkyURLs` the URLs; nothing revalidates them. The page files
  carry only their featured stars. (How many wall images an Index first view fetches is Chrome's
  lazy-load distance, set by the connection's effective type when the first lazy image is
  parsed, before any Night Sky script runs: 20 on 4G, ~32 on 3G.)
- The footer NM's targets load in CORS mode like the homepage's preload (one request), on About
  and Index in idle time or as soon as the footer comes near (a jump to the end); only the
  gathering layer's part of the particle buffer is uploaded again, and no CPU copy of the rest is
  kept (~8 MB on desktop).
- The overlay (`NMSky.fx`, events and the reticle) is hidden while it is blank, and shown before
  anything draws on it; while only the footer's nodes are on it, each clear covers just their
  box. The footer canvas is not cleared again while it is already blank.
- The footer fly-in picks its stars (each must be in open sky: `openSky`, a read of the page) a
  few reads a frame from when the footer's stars settle in, and is complete before a node lifts
  off; a fling's pick made again works the same way.
- Header scrim. While the page scrolls it is decided every frame from a cache of the page's content
  boxes (built at layout: lines of text, media, filled or ruled boxes, controls; what `openSky`
  counts), along the nine columns and over the rows the old probes used, stretched ahead in the
  direction of travel by 0.3 s of the scroll's speed (never past where the scroll will stop: the
  page's end, or on the homepage Lenis's target; 90 px more during a warp fling), so the scrim
  is back as content arrives instead of up to ~0.15 s later, and lifts where a scroll stops over
  sky (the footer) as soon as it did before. Sticky sections keep their boxes relative to
  themselves (About's résumé heading, including where it goes once it lets go); where something
  inside one moves on its own (the homepage collage) the old probes decide there (every 140 ms
  while it covers the band, every 60 ms while it does not). At rest the probes decide, as before,
  and the cache is rebuilt if it disagrees. `NMSky.debug().veil` compares the two.
- Quality governor (`quality()` in `js/nm-space.js`). Frames that run long while the camera moves
  lower the particle count (to half), then the resolution (×0.75); unchanged at 60 and 120 Hz
  (over 24 ms is slow, under 18 ms fast). Two kinds of long frame no longer count, because fewer
  particles would not shorten them: a display capped at 30 fps (Low Power Mode, an energy saver;
  the cadence is the 20th percentile of the camera's resting frames, and it counts as a cap only
  when this page's own work, timed every 16th draw on the CPU and with a WebGL2 fence on the GPU,
  is under 0.35 of it; then a frame is slow only past 1.45 of the cadence), and WebKit's scroll-dip
  frames (`js/nm-warp.js` sets `window.__nmDip` while its CPU filter is on; that frame and the next
  are not counted). A slow GPU or CPU still steps down exactly as before. After 600 fast moving
  frames a lowered resolution comes back when the measured work leaves room for it (once; if it
  has to drop again it stays), then the particles 0.1 at a time, as they always could. Before this,
  Safari under Low Power Mode, or after a few fast flings on About, ended at half the particles and
  0.75 resolution for the rest of the visit.
- The scroll dip in WebKit (`js/nm-warp.js`). WebKit samples the dip's displacement at whole device
  pixels, truncating toward zero, so a dip under 1.5 device px down or 0.5 up moves nothing (measured
  on About and the homepage at DPR 1, 2 and 3: those frames match a zero-scale filter's), yet each one
  is a CPU-filtered frame. At an episode's edges (before the filter first goes on, and once the scroll
  has slowed and the dip springs back) such frames go without the filter (margins: under 1.25 down,
  0.4 up, scaled by `devicePixelRatio` and pinch zoom); mid-episode it stays on. The dip's speed,
  spring and timing are untouched. The only pixel change is the filter's own antialiasing, at most
  one level on 0.1–0.6% of the screen, the same flip the filter makes when it comes off today, a few
  frames earlier. Chrome is unchanged.
- The scroll dip on Index (`js/nm-warp.js`). Each tile's box is read once (document px) instead of
  178 `getBoundingClientRect` calls every frame of a dip: a tile's own transform never moves layout.
  It is read again when the wall's box or the lowest tile of any column moves (checked each frame:
  the wall and one tile per column), on a resize, and on a ResizeObserver report from the wall, the
  body or any tile. A box read mid-dip has the tile's offset taken off and the near-screen test adds
  it back, so every tile gets exactly the offset it did (checked frame by frame on a fake clock,
  with a block inserted above the wall, tiles resized and the window resized mid-dip). `will-change`
  goes to a band of tiles at once (the stretch that can dip, plus a screen ahead and a quarter
  behind) and moves on in one pass, so the wall relays out about once a screen of scrolling instead
  of most frames; tiles on screen hold it exactly as before and about as many layers exist.
- Index under its image wall. The wall is opaque from its lowest column top to its highest column
  bottom (tiles edge to edge, filled #141414 under their images); `js/nm-sky.js` measures it at
  layout (and forgets it at once on a resize or ResizeObserver report, until the next layout). While
  it covers the screen with a screen plus the dip to spare at both ends (`NMSky.covered()`), the sky,
  its overlay and the particle space skip their draws; clocks, camera, events, labels and the scrim
  run on, and the first frame out draws whatever the beat (never the first draw of a visit, which
  fades the canvases in). That is 77–90% of the scroll range (82% at 1440×900, 87.5% on a 390×844
  phone). Checked frame by frame on a fake clock, flinging out across both edges in Chrome and WebKit
  at 1440×900@2 and 390×844@3: on every frame where any sky can show, the draws are exactly the old
  code's and a forced redraw of that frame changes nothing on screen; drawing resumes 13–15 frames
  (830–880 px) before the sky shows. With real (compositor) flings up to 15,000 px/s no frame showed
  the sky undrawn. Only a main-thread stall long enough for compositor scrolling to carry the view a
  whole screen in the last screen before an edge (120 ms at 8000 px/s) shows the sky as last drawn
  under the wall for those frames (the old code shows it as drawn before the stall).
- The Index footer door loads `/js/nm-run.js` at its content version (`RUN_SRC` in
  `js/nm-sky.js`, refreshed by `tools/build-theme-versions.py` like the home and About pages'
  own `?v=`).
