# Portfolio maintenance

This repository is a static Next.js export served by GitHub Pages. It does not contain the original React source project or a package/build manifest. Files in `_next/static/chunks/` are production bundles, so changes to React-owned markup must also match the server HTML and embedded Flight data in `index.html`.

## Initialization and scrolling

`nm-sync.js` queues custom extensions until the homepage React component emits `nm:hydrated`. Static pages initialize at DOMContentLoaded. Extensions mount once; they must not rewrite React text or use document-wide mutation observers to repair content. The dialog focus observer only reacts to overlay classes.

The homepage extensions now live in `/js/nm-home-content.js`, `nm-home-scroll.js`, `nm-brands.js`, `nm-anchors.js`, `nm-navact.js`, `nm-magnet.js`, and `nm-sites.js`. The extracted homepage styling is `/css/nm-home.css`.

`nm-home-scroll.js` alone owns the custom grid zoom and sticky runway. The gallery keeps one positioning mode; the wrapper reserves its full height plus the hero scroll distance. ResizeObserver updates those dimensions, and scroll updates are coalesced with requestAnimationFrame. Do not restore fixed/relative switching, which caused header paint glitches on return to the top.

During the intro, the footer render texture is disabled and its point updates stop until footer progress becomes positive. Keep the cloud mounted so it resumes without loading again. The pointer-trail canvas uploads once when empty and stops after the final fade; only a fine hover pointer records new trail points. Touch scrolling must not drive this mouse effect. Grid styles update only when progress changes, with geometry reads before writes.

The `nm-home-*` bundle provides the hydration event, Lenis bridge, stable About markup and hero-label visibility. `nm-shared-*` fades complete text elements without splitting and replacing their children. `nm-scenes-*` pauses the WebGL canvas outside visible hero/footer regions and while the tab is hidden. The paused canvas must also use `visibility:hidden`: stopping its frame loop alone leaves the last cloud frame painted over intervening sections.

## Media and caching

Homepage loops have posters and deferred `data-src` / `data-mobile-src` attributes. `nm-video.js` assigns a source only when a tile becomes visible and pauses it when hidden. Reduced motion and Save-Data visitors keep posters. Original media are retained. The first desktop loop and all five phone loops have optimized variants; the other desktop originals were already smaller than their recompressed candidates.

Phones and coarse-pointer tablets retain posters until the opening zoom finishes, avoiding video startup and decoding during the zoom. Desktop playback still starts at 25% of the hero distance. Returning to the intro pauses all loops, including a late-resolving play request.

Shared CSS/JS references in HTML carry content-version query strings. Refresh these after editing their source. Changed production bundles use new filenames; update every reference in HTML and other chunks whenever changing a bundle's cache identity.

## Validation

Run from the repository root:

```sh
node --test tests/runtime.test.cjs tests/runner.test.mjs tests/touch-previews.test.cjs
python3 tests/validate_static.py
git diff --check
```

Serve the repository as static files (`python3 -m http.server 8814`) and check `/` and `/index/`. The existing `serve.py` supports media range requests if needed. Check narrow phones, portrait and landscape, repeated complete down/up scrolls, visible/offscreen video playback, menu close/focus restoration, About navigation from both pages, and gallery next/previous/close. Do not test the exported HTML through a file:// URL.

Deploy by merging the reviewed branch into the repository's configured Pages source branch. Keep the existing CNAME and hosting configuration. A real iOS Safari check remains useful: desktop viewport emulation cannot validate the mobile browser engine or device GPU.

## Cloud Run easter egg

The footer cloud is a real keyboard-accessible button. Phones render the same animated cloud as desktop, at a capped 1.25 DPR and 7,500 sprites with opacity compensation. Keep the full-height footer, 67% heading position, and text-size-adjust override together; the old tiny SVG and shortened footer must not return. `/js/nm-run.js` is the lightweight door; it lazy-loads the game module, CSS and sprite atlas only after a click (or a direct `/#run` visit).

`nm-run-engine.mjs` contains deterministic movement, collision, obstacle spacing, stars and scoring. Only two encounters spawn: low birds to jump over and high birds to duck under. Flight clearances are 34 and 58 canvas pixels, measured from the anchored body. These account for the full downward wings: low birds clear the tallest foreground cloud lobes, and high wings clear the 36-pixel duck pose. Rendering and collision share `DUCK_HEIGHT`. Collision uses the body, leaving decorative wing tips forgiving. `nm-run-game.mjs` anchors both bird poses around the beak so their body position remains stable during flapping. Every high bird carries a low star centered 24 pixels above the track. It can be collected only while grounded and ducking, and a collision cannot award a star. Low birds can carry a star above them for jumping. The transparent sky atlas also provides clouds and stars; its other older objects are not extracted or spawned.

`runner-ravi-stills.png` contains twelve complete running poses in a 4-column by 3-row atlas. `nm-run-motion.mjs` selects eight complete poses in the order `[1,2,3,4,8,7,10,11]`, skipping repeated extended kicks and the twisted, overlapping-foot pose. One cycle spans 140 canvas pixels of travel, giving each step equal timing. The loader removes the magenta background, trims each complete illustration, and registers it by its head center and foot baseline. All frames use one common scale, at most 60 pixels tall; flight poses lift by up to 2 pixels. Each character stays intact: the renderer does not assemble or stretch limbs. `runner-ravi-actions.png` supplies idle/jump/duck/hit/dead poses only. Art preparation happens once when the easter egg opens; no image decoding or pixel reads happen inside the animation loop. When replacing the running atlas, inspect the entire registered sequence and its wrap from the last selected pose to the first.

Stars turn around their vertical axis during play while keeping a constant collection area. Their rotation pauses with game time and stays still under reduced motion. The outer game background uses the portfolio’s `--nm-bg` token.

The self-hosted Press Start 2P font and its OFL license live in `fonts/`. Its font-face is declared only in the lazy game stylesheet. The taller canvas leaves space below the cloud. Maintain both the logical height and short-landscape CSS aspect ratio when resizing the stage.

Space/Up or the Jump button jumps; holding jumps higher. Down or the Duck button ducks under higher birds; P pauses; Escape closes. A local high score persists across sessions. The game never sends scores or collects contact information. The canvas loop stops when paused/closed, and the underlying WebGL scene pauses while the game is open. Reduced-motion visitors can still choose to play, with decorative cloud parallax disabled.

The shared focus manager must include `.nm-run` in its active-dialog query, so menu resize events do not release the game dialog's focus containment. Maintain this when adding other overlays. Always test phone rotation while the game is open.

## Floating previews and corners

The Services section is authored in `nm-brands.js` and controlled by `nm-services.js`. Desktop buttons select one image/description on pointer movement, focus or click. Images overlap in the right grid column; each description expands directly below its own title in the left column. Pointer selection requires changed coordinates, so expanding text beneath a stationary cursor cannot start a selection loop. The plus/minus icons align at the right edge of the list. At 900px and below the panels expand independently beneath their buttons, with text above the image, so opening a lower item does not collapse content above it. Arrow keys navigate the service buttons. Responsive images load near the section; there is no scroll listener or animation loop. Keep `aria-expanded`, `aria-hidden` and the visual open state synchronized when modifying the controls.

`nm-sites.js` retains decoded display-sized WebP images, tracks the current pointer position, and checks the row underneath on scroll. Do not unconditionally hide the panel on scroll: trackpad momentum would hide it until the pointer re-enters a row. The coordinates popup, site preview cards and enlarged archive images use an 18px corner radius.

The Index gallery uses the same 18px radius, responsive outer gutters, and a shared `--tile-gap` for column spacing and tile bottom margins. Keep the existing image aspect ratios and column breakpoints when adjusting spacing.

The homepage footer uses the original centered cloud, tagline and metadata. The Cloud Run button exists in both server HTML and the footer React component so resizing cannot remove it. Cloud hover deformation stays disabled.

## Responsive layouts

`nm-responsive.css` loads last on the homepage and Index. Above 1920px, `--nm-unit` scales the remaining fixed service typography, controls, spacing, popup text and gallery gaps against the 1920px composition. A 2560px viewport uses 4/3 of those dimensions and preserves wrapping. The game also uses this unit; its logical canvas and physics remain independent of the displayed size. Do not use page zoom or transform scaling for layout.

The phone menu has a real 44px hit box, so the header's paint containment cannot clip its target. Its close icon is positioned from the control's center. Phone visitors can open the same daily location facts through a compact globe. Both headers use identical spacing.

`nm-sites-touch.js` adds separate Preview buttons for coarse pointers and narrow screens. Site links still navigate directly. Preview images load only on first expansion and are retained; returning to desktop closes inline previews and restores the existing cursor preview. Keep each button outside its corresponding anchor and preserve `aria-expanded` / `aria-controls`.

Archive thumbnails have responsive source sets using their actual source widths. Narrow screens keep small files; larger or denser screens can select the existing full-size images. Only the first tile has high fetch priority; other images load lazily. Lightbox sizing uses the dynamic viewport height so controls and images stay visible after rotation.

The footer scene updates its stored progress on ScrollTrigger refresh as well as scroll. The home bridge coalesces window and main-layout resize events into a single refresh per frame, with cleanup. This is required when rotation changes the service layout and footer position while already at the bottom. Cloud sprites scale with viewport height relative to the 1080px desktop reference, so landscape phones do not become an overexposed blob.

On coarse pointers, window height-only changes from browser toolbars do not trigger a full scroll-range refresh. Width changes and ResizeObserver notifications for real content/hero geometry still refresh, including rotation. Preserve this distinction in both the home bridge and `nm-home-scroll.js`.
