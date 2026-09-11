# Portfolio maintenance

This repository is a static Next.js export served by GitHub Pages. It does not contain the original React source project or a package/build manifest. Files in `_next/static/chunks/` are production bundles, so changes to React-owned markup must also match the server HTML and embedded Flight data in `index.html`.

## Initialization and scrolling

`nm-sync.js` queues custom extensions until the homepage React component emits `nm:hydrated`. Static pages initialize at DOMContentLoaded. Extensions mount once; they must not rewrite React text or use document-wide mutation observers to repair content. The dialog focus observer only reacts to overlay classes.

The homepage extensions now live in `/js/nm-home-content.js`, `nm-home-scroll.js`, `nm-brands.js`, `nm-anchors.js`, `nm-navact.js`, `nm-magnet.js`, and `nm-sites.js`. The extracted homepage styling is `/css/nm-home.css`.

`nm-home-scroll.js` alone owns the custom grid pin, spacer and zoom. It caches layout dimensions on resize and coalesces scroll updates with requestAnimationFrame. Keep the spacer and the fixed/relative handoff together to preserve the total document height in both scroll directions.

The `nm-home-*` bundle provides the hydration event, Lenis bridge, stable About markup and hero-label visibility. `nm-shared-*` fades complete text elements without splitting and replacing their children. `nm-scenes-*` pauses the WebGL canvas outside visible hero/footer regions and while the tab is hidden.

## Media and caching

Homepage loops have posters and deferred `data-src` / `data-mobile-src` attributes. `nm-video.js` assigns a source only when a tile becomes visible and pauses it when hidden. Reduced motion and Save-Data visitors keep posters. Original media are retained. The first desktop loop and all five phone loops have optimized variants; the other desktop originals were already smaller than their recompressed candidates.

Shared CSS/JS references in HTML carry content-version query strings. Refresh these after editing their source. Changed production bundles use new filenames; update every reference in HTML and other chunks whenever changing a bundle's cache identity.

## Validation

Run from the repository root:

```sh
node --test tests/runtime.test.cjs tests/runner.test.mjs
python3 tests/validate_static.py
git diff --check
```

Serve the repository as static files (`python3 -m http.server 8814`) and check `/` and `/index/`. The existing `serve.py` supports media range requests if needed. Check narrow phones, portrait and landscape, repeated complete down/up scrolls, visible/offscreen video playback, menu close/focus restoration, About navigation from both pages, and gallery next/previous/close. Do not test the exported HTML through a file:// URL.

Deploy by merging the reviewed branch into the repository's configured Pages source branch. Keep the existing CNAME and hosting configuration. A real iOS Safari check remains useful: desktop viewport emulation cannot validate the mobile browser engine or device GPU.

## Cloud Run easter egg

The footer cloud is a real keyboard-accessible button. On phones it uses a small SVG projection of the existing point-cloud geometry. `/js/nm-run.js` is the lightweight door; it lazy-loads the game module, CSS and sprite atlas only after a click (or a direct `/#run` visit).

`nm-run-engine.mjs` contains deterministic movement, collision, obstacle spacing, stars and scoring. `nm-run-game.mjs` owns drawing and the dialog lifecycle. The sky/cloud scenery uses the transparent `sky-atlas.png`: billowing cloud platforms, storm/bolt/gust/hail obstacles, two bird wing poses, a paper plane and a gold star. `runner-character-v2.png` is a magenta-key atlas with eight running frames and idle/jump/duck/hit/dead poses based on the supplied character. Running frames use shared foot baselines and explicit torso pivots, preserving the stride instead of re-centering each trimmed silhouette. Animation cadence follows distance. The magenta is removed once when the image loads, and trimmed sprite canvases are reused every frame. No image decoding or pixel reads happen inside the animation loop.

The self-hosted Press Start 2P font and its OFL license live in `fonts/`. Its font-face is declared only in the lazy game stylesheet. The taller canvas leaves space below the cloud. Maintain both the logical height and short-landscape CSS aspect ratio when resizing the stage.

Space/Up or the Jump button jumps; holding jumps higher. Down or the Duck button ducks under birds and paper planes; P pauses; Escape closes. A local high score persists across sessions. The game never sends scores or collects contact information. The canvas loop stops when paused/closed, and the underlying WebGL scene pauses while the game is open. Reduced-motion visitors can still choose to play, with decorative cloud parallax disabled.

The shared focus manager must include `.nm-run` in its active-dialog query, so menu resize events do not release the game dialog's focus containment. Maintain this when adding other overlays. Always test phone rotation while the game is open.
