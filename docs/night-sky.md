# Night Sky (preview theme `?theme=stars`, local branch `design/cosmic`)

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
`css/theme-stars.css`.

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
- `js/nm-sky.js` → `window.NMSky` (the engine; owns all star rendering, events, featured-star
  labels and the footer NM constellation; exposes `NMSky.canvas`).
- `media/sky/{home,about,index}.json`: real sky data per page (format below).

## Data format: `media/sky/PAGE.json`

```json
{
  "page": "home",
  "view": { "ra": 5.6, "dec": -3.0, "fov": 75, "roll": 0, "scrollPan": [1.2, 4.0] },
  "stars": [[6.7525, -16.7161, -1.46, 0.00], ...],
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

- `stars`: `[ra_hours_J2000, dec_degrees_J2000, V_magnitude, B_minus_V]` for every catalogue star
  with V <= 6.0 inside the page's region plus a 20° margin, sorted brightest first. Missing B−V:
  use 0.6.
- `view`: suggested framing (centre RA/Dec, field of view in degrees across the viewport's
  long side, roll in degrees, and how far the view pans over a full page scroll in
  [RA hours, Dec degrees]). The engine may tune it, but every featured star must pass through
  the viewport during a scroll of the page.
- `featured`: exactly four per page (below), with verified one-line facts (no more than about
  110 characters, plain and specific, no hype) and the J2000 coordinates string.

### Regions and featured stars

| page | sky | featured |
|---|---|---|
| home | Orion, Canis Major, Taurus (winter sky) | Sirius, Betelgeuse, Rigel, Aldebaran |
| about | Summer Triangle: Lyra, Cygnus, Aquila | Vega, Deneb, Altair, Albireo |
| index | the northern pole: Ursa Minor, Ursa Major, Draco | Polaris, Mizar (with Alcor), Dubhe, Thuban |

## Engine requirements (`js/nm-sky.js`)

- One fixed, full-viewport canvas behind all content (below `#global-canvas`, like the NMCosmos
  page layers at negative z-index), `pointer-events: none`, `aria-hidden`. Sections that paint
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
