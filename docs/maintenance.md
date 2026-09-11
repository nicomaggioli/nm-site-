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
node --test tests/runtime.test.cjs
python3 tests/validate_static.py
git diff --check
```

Serve the repository as static files (`python3 -m http.server 8814`) and check `/` and `/index/`. The existing `serve.py` supports media range requests if needed. Check narrow phones, portrait and landscape, repeated complete down/up scrolls, visible/offscreen video playback, menu close/focus restoration, About navigation from both pages, and gallery next/previous/close. Do not test the exported HTML through a file:// URL.

Deploy by merging the reviewed branch into the repository's configured Pages source branch. Keep the existing CNAME and hosting configuration. A real iOS Safari check remains useful: desktop viewport emulation cannot validate the mobile browser engine or device GPU.
