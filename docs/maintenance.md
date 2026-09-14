# Portfolio maintenance

This repository is a static Next.js export served by GitHub Pages. It does not contain the original React source project or a package/build manifest. Files in `_next/static/chunks/` are production bundles, so changes to React-owned markup must also match the server HTML and embedded Flight data in `index.html`.

## Search metadata and static fallback

`tools/build-seo.py` owns the three public pages' titles, descriptions, canonical URLs, social cards and JSON-LD. The homepage's matching Next Flight metadata must change together with its HTML head or hydration can restore old metadata. Keep the Person, WebSite, ProfilePage and Service facts consistent with visible content; the sharing image shows footwear and must not be used as the Person's portrait. The generated sitemap lists the three canonical routes plus original images actually displayed on those pages. Do not add private proposals, guessed update dates, or duplicate HTML aliases.

The shipped template's project drawer and original mosaic components are disabled. Their unused Flight `projects`, `homeMosaicMedias` and `homeProjectItems` arrays are empty; the authored portfolio content lives in the custom scripts. Do not remove additional Flight fields without testing the actual component dependencies and hydration.

`tools/build-home-fallback.py` builds a readable no-JavaScript homepage from the current service descriptions, six service images and live-site links in `nm-brands.js`. Its short introduction matches the regular homepage. This fallback is parsed only with scripts disabled and loads `css/nm-nojs.css` only then; the animated homepage stays unchanged. Insert it before the actual final closing body, not every occurrence of `</body>`: an earlier occurrence is inside the file:// launcher's JavaScript string. If the main introduction changes, update the fallback copy too.

After changing these sources, run the fallback generator, then the SEO generator, then refresh CSS/JS content-version URLs. Run both static validators and the SEO browser tests. The generators are idempotent.

`404.html` keeps unknown public URLs on a usable noindex page with recovery links and the host's HTTP 404 response. It still forwards the existing `/clients/SLUG` proposal links. `robots.txt` excludes the `/clients` prefix; this is crawl control, not authentication or a guarantee that a URL cannot appear in search.

## About page and resume

`/about/` is a static page authored in `about/index.html` and `css/nm-about-page.css`. It uses the shared header, menu, location facts, fonts, and focus manager, without loading the homepage's React/WebGL/video bundles. The introduction and footwear process are based on Nico's September 14 draft. The homepage's short statement remains in place, while About navigation opens the standalone page.

The homepage's server-rendered desktop/mobile links and Flight navigation data both point to `/about/`. `nm-burger.js` and the archive/proposal headers use the same destination. `nm-sync.js` redirects legacy `/#about` links with `location.replace` so Back cannot get stuck on the old anchor. `nm-navact.js` also supports an About button from an older cached homepage.

The résumé was recovered from `d7bf9a89a5b5ad503ef02080bf22bee9d11b4a7b:index.html`, lines 2751–2881 (July 24, 2026). Roles, dates, descriptions, education, skills, leadership, and honors retain that source's information; ongoing role dates were not inferred from the new biography. Update the webpage and `tools/build-resume.py` together when details change. The About page presents the résumé inline without a download option. If a PDF is needed separately, build `media/resume/nico-maggioli-resume.pdf` with `python3 tools/build-resume.py` (ReportLab and fonttools with WOFF support). It embeds static instances of the site's Geist fonts and includes clickable site/email contacts. Render and inspect both pages after rebuilding.

## Initialization and scrolling

`nm-sync.js` queues custom extensions until the homepage React component emits `nm:hydrated`. Static pages initialize at DOMContentLoaded. Extensions mount once; they must not rewrite React text or use document-wide mutation observers to repair content. The dialog focus observer only reacts to overlay classes.

Public `#work`, `#nm-services` and `#contact` links resolve after the custom sections mount and their layout is ready. The old `#about` destination redirects as described above. Any wheel, touch, pointer or key input cancels the startup correction so it cannot pull a visitor away from their own scroll.

The homepage extensions now live in `/js/nm-home-content.js`, `nm-home-scroll.js`, `nm-brands.js`, `nm-anchors.js`, `nm-navact.js`, `nm-magnet.js`, and `nm-sites.js`. The extracted homepage styling is `/css/nm-home.css`.

`nm-home-scroll.js` alone owns the custom grid zoom and sticky runway. The gallery keeps one positioning mode; the wrapper reserves its full height plus the hero scroll distance. ResizeObserver updates those dimensions, and scroll updates are coalesced with requestAnimationFrame. Do not restore fixed/relative switching, which caused header paint glitches on return to the top.

During the intro, the footer render texture is disabled and its point updates stop until footer progress becomes positive. Keep the cloud mounted so it resumes without loading again. The pointer-trail canvas uploads once when empty and stops after the final fade; only a fine hover pointer records new trail points. Touch scrolling must not drive this mouse effect. Grid styles update only when progress changes, with geometry reads before writes.

`nm-intro-surface.js` caches the phone collage into two bounded canvases: the seven central posters and the surrounding tiles. It runs after content mounting and before the scroll controller. The scroll controller draws those two layers into a viewport-sized canvas using the existing scale and fade formulas. Central links retain their hit areas; live DOM images/videos return at the end. Never hide or remove the grid from layout, since that would change the runway. Preparation yields after 4ms, deduplicates source decoding, and falls back to the DOM if an image/canvas fails. Textures are capped at 2048px per side and the viewport at 1.5 DPR. Rotation rebuilds once and releases old buffers; toolbar height changes do not rebuild the collage. Desktop and reduced motion retain their original rendering. The hero shader skips pointer-noise calculations on coarse pointers without changing its mask/blur formula.

The `nm-home-*` bundle provides the hydration event, Lenis bridge, stable About markup and hero-label visibility. `nm-shared-*` fades complete text elements without splitting and replacing their children. `nm-scenes-*` pauses the WebGL canvas outside visible hero/footer regions and while the tab is hidden. The paused canvas must also use `visibility:hidden`: stopping its frame loop alone leaves the last cloud frame painted over intervening sections.

## Media and caching

Homepage loops have posters and deferred `data-src` / `data-mobile-src` attributes. `nm-video.js` assigns a source only when a tile becomes visible and pauses it when hidden. Reduced motion and Save-Data visitors keep posters. Original media are retained. The first desktop loop and all five phone loops have optimized variants; the other desktop originals were already smaller than their recompressed candidates.

Phones and coarse-pointer tablets retain posters until the opening zoom finishes, avoiding video startup and decoding during the zoom. Desktop playback still starts at 25% of the hero distance. Returning to the intro pauses all loops, including a late-resolving play request.

Video visibility is maintained by IntersectionObserver. The scroll handler schedules playback work only when crossing the intro threshold; hero sizing is cached and invalidated on real size/input changes. Avoid restoring layout reads and repeated pause calls on every scroll frame.

Each homepage video has a real poster image with width/height attributes in the grid flow. The video is absolutely positioned over it and stays transparent until `requestVideoFrameCallback` confirms a presented frame (or `playing` with decoded data on older browsers). Keep the image mounted underneath. Safari drops native poster dimensions between `play()` and metadata loading: allowing the video to size an auto grid row collapses the mobile collage and shifts the whole scroll runway. Errors/reloads restore the poster; buffering keeps the last video frame.

Shared CSS/JS references in HTML carry content-version query strings. Refresh these after editing their source. Changed production bundles use new filenames; update every reference in HTML and other chunks whenever changing a bundle's cache identity.

The header logo's Next Link sets `prefetch:false` in `nm-scenes-*`. GitHub Pages has no React Server Component endpoint; default prefetch previously downloaded four complete homepage copies as `?_rsc` requests. Keep this disabled. The hero mask preload uses `crossorigin="anonymous"` to match Three's image loader and avoid a second download.

The two static center photos reuse existing 512px/768px variants with `sizes` matching their grid fractions. In the phone intro cache, wait for the mounted responsive image's `decode()` before reading `currentSrc`: Chromium can initially return an empty string, causing a separate full-size fallback download. Preserve the mounted image dimensions and original URLs so the collage geometry and cached older pages remain stable.

## Validation

Run from the repository root:

```sh
node --test tests/runtime.test.cjs tests/runner.test.mjs tests/touch-previews.test.cjs tests/intro-surface.test.cjs tests/media-work.test.cjs tests/seo-routing.test.cjs
python3 tests/validate_static.py
python3 tests/validate_seo.py
git diff --check
```

Serve the repository as static files (`python3 -m http.server 8814`) and check `/`, `/index/`, and `/about/`. The existing `serve.py` supports media range requests if needed. Check narrow phones, portrait and landscape, repeated complete down/up scrolls, visible/offscreen video playback, menu close/focus restoration, About navigation from both pages, and gallery next/previous/close. Do not test the exported HTML through a file:// URL.

With Playwright and its WebKit/Chromium browsers installed, run `node --test tests/video-reveal.browser.cjs tests/responsive.browser.cjs tests/about.browser.cjs` against that preview. `NM_TEST_URL`, `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH`, and `CHROMIUM_EXECUTABLE` can select an existing environment. This regression delays MP4 responses, checks that photos remain visible, and samples every frame for layout collapse through loading/playback on phone, tablet, and desktop. Chromium alone did not reproduce the iPhone failure; include WebKit.

The About suite checks layouts from 320px to 2560px, navigation/history and legacy redirects, keyboard menu focus, and content without JavaScript in both engines.

`node --test tests/seo.browser.cjs` checks metadata after hydration on all three pages, a readable homepage and its six photos without JavaScript at 320–2560px, and navigation to About. It also prevents unwanted RSC prefetch and fallback stylesheet requests in the normal site. Index and About use a labeled nav wrapper around the list, and their focus-visible skip links target the main content.

For Cloud Run changes, also run `node --test tests/runner.browser.cjs`. It checks later unlocks, score/bonus UI, pause, rotation, restart, and panel/HUD clipping, 44px touch targets, held controls and cancellation in both browser engines. Chromium also checks two simultaneous touch contacts. The unit suite simulates ten-minute mixed runs with several random seeds at phone and desktop stage widths to check reaction gaps and jump/duck sequences.

Deploy by merging the reviewed branch into the repository's configured Pages source branch. Keep the existing CNAME and hosting configuration. A real iOS Safari check remains useful: desktop viewport emulation cannot validate the mobile browser engine or device GPU.

## Cloud Run easter egg

The footer cloud is a real keyboard-accessible button. Phones render the same animated cloud as desktop, at a capped 1.25 DPR and 7,500 sprites with opacity compensation. Keep the full-height footer, 67% heading position, and text-size-adjust override together; the old tiny SVG and shortened footer must not return. `/js/nm-run.js` is the lightweight door; it lazy-loads the game module, CSS and sprite atlas only after a click (or a direct `/#run` visit).

`nm-run-engine.mjs` contains deterministic movement, collision, obstacle spacing, stars and scoring. Active play time unlocks high birds at 12 seconds, laser birds at 25, diving birds at 45, shooting stars at 70, and Rush Hour at 105. Planes and balloons have been removed. The first encounter after each unlock introduces that type; later encounters mix the unlocked pool. Jump low birds; duck high birds and lasers; watch the height of a diving bird to time the jump or duck. Speed ramps smoothly from 210 toward 360 canvas pixels per second while recovery intervals shrink toward 0.85 seconds. Pausing freezes the clock and restart resets progression.

Rendering and collision share `DUCK_HEIGHT` and `birdClearance`. Normal bird clearances remain 34 and 58 canvas pixels, with forgiving wing tips and both poses anchored around the beak. Diving birds use a continuous sine path spanning clearances 30–86; their collider follows the drawn body. Cyan guide marks distinguish their vertical path. Laser birds have a clearance of 48, wait until their beak is visible and approaching the runner, then charge for a full 0.7 seconds before firing. A glowing beak and dotted aim line warn of the beam; there is no flashing. Rendering and collision use the same beam position, and the 36-pixel duck pose clears it. Each laser encounter reserves an additional 0.8 seconds of approach spacing before the bird, also delaying the next spawn, so the beam cannot catch a player landing from the previous bird. Test mixed sequences at high speeds before changing those intervals.

High and laser birds carry a low star collectible only while grounded and ducking. Low birds can carry a star above them. Diving birds have no attached star, to avoid misleading players about which path to take. Shooting stars descend diagonally in their own encounter slot, have a fixed pixel trail, and award three stars (75 points); missing one is harmless. A collision cannot award a star. The sky atlas supplies clouds, birds and the star core; laser effects and path markers are canvas primitives with no extra asset downloads. The HUD shows the current level and briefly announces each unlock. The sky changes to violet when shooting stars unlock.

`runner-ravi-stills.png` contains twelve complete running poses in a 4-column by 3-row atlas. `nm-run-motion.mjs` selects eight complete poses in the order `[1,2,3,4,8,7,10,11]`, skipping repeated extended kicks and the twisted, overlapping-foot pose. One cycle spans 140 canvas pixels of travel, giving each step equal timing. The loader removes the magenta background, trims each complete illustration, and registers it by its head center and foot baseline. All frames use one common scale, at most 60 pixels tall; flight poses lift by up to 2 pixels. Each character stays intact: the renderer does not assemble or stretch limbs. `runner-ravi-actions.png` supplies idle/jump/duck/hit/dead poses only. Art preparation happens once when the easter egg opens; no image decoding or pixel reads happen inside the animation loop. When replacing the running atlas, inspect the entire registered sequence and its wrap from the last selected pose to the first.

Stars turn around their vertical axis during play while keeping a constant collection area. Their rotation pauses with game time and stays still under reduced motion. The outer game background uses the portfolio’s `--nm-bg` token.

The self-hosted Press Start 2P font and its OFL license live in `fonts/`. Its font-face is declared only in the lazy game stylesheet. The taller canvas leaves space below the cloud. Maintain both the logical height and short-landscape CSS aspect ratio when resizing the stage.

Touch devices and viewports up to 900px use a Game Boy-style control deck: exactly two buttons, with a round red B/Duck button on the left and a round green A/Jump button on the right. Both glyphs are visually centered. There is no directional pad or Pause/Resume button in the control deck; automatic pause and the keyboard P shortcut still use the existing resume overlay. Portrait phones reserve room below the field for both thumbs; short landscape uses smaller (at least 48px) action buttons and a 900×340 logical stage. Short portrait phones hide secondary copy to keep the controls visible. Safe-area padding keeps the deck away from screen corners. Desktop keyboard controls remain available alongside the compact Duck/Jump button row. Pointer capture handles release outside a button; source sets preserve simultaneous holds; cancellation, pause, blur, restart and exit clear inputs and visual pressed states.

Space/Up or the Jump button jumps; holding jumps higher. Down or the red B/Duck button ducks under higher birds and lasers; P pauses; Escape closes. A local high score persists across sessions. The game never sends scores or collects contact information. The canvas loop stops when paused/closed, and the underlying WebGL scene pauses while the game is open. Reduced-motion visitors can still choose to play, with decorative cloud parallax and star rotation disabled.

The shared focus manager must include `.nm-run` in its active-dialog query, so menu resize events do not release the game dialog's focus containment. Maintain this when adding other overlays. Always test phone rotation while the game is open.

## Floating previews and corners

The Services section is authored in `nm-brands.js` and controlled by `nm-services.js`. Desktop buttons select one image/description on pointer movement, focus or click. Images overlap in the right grid column; each description expands directly below its own title in the left column. Pointer selection requires changed coordinates, so expanding text beneath a stationary cursor cannot start a selection loop. The plus/minus icons align at the right edge of the list. At 900px and below the panels expand independently beneath their buttons, with text above the image, so opening a lower item does not collapse content above it. Arrow keys navigate the service buttons. Responsive images load near the section; there is no scroll listener or animation loop. Keep `aria-expanded`, `aria-hidden` and the visual open state synchronized when modifying the controls.

`nm-sites.js` retains decoded display-sized WebP images, tracks the current pointer position, and checks the row underneath on scroll. It warms the eight previews when the site list comes within 1000px of the viewport, without startup idle downloads. Cursor updates run only for an active fine pointer; inactive and touch previews do not schedule frames. Do not unconditionally hide the panel on scroll: trackpad momentum would hide it until the pointer re-enters a row. The coordinates popup, site preview cards and enlarged archive images use an 18px corner radius.

The Index gallery is a continuous edge-to-edge image wall: no horizontal padding, no column or tile gaps, and square tile corners. Keep the existing image aspect ratios and 2/3/4/5-column breakpoints. Shared large-screen rules must not reintroduce rounded tile corners or spacing.

The homepage footer uses the original centered cloud, tagline and metadata. The Cloud Run button exists in both server HTML and the footer React component so resizing cannot remove it. Cloud hover deformation stays disabled.

## Responsive layouts

`nm-responsive.css` loads last on the homepage, Index and proposal screens, keeping their header controls consistent. Above 1920px, `--nm-unit` scales the remaining fixed service typography, controls, spacing and popup text against the 1920px composition. A 2560px viewport uses 4/3 of those dimensions and preserves wrapping. The game also uses this unit; its logical canvas and physics remain independent of the displayed size. Do not use page zoom or transform scaling for layout.

The phone menu has a real 44px hit box, so the header's paint containment cannot clip its target. Its close icon is positioned from the control's center. Phone visitors can open the same daily location facts through a compact globe. Both headers use identical spacing. Keyboard activation of the location button focuses its Maps link; Escape returns focus to the button. Keep the body-mounted panel associated through `aria-controls` and its title.

Phone hero captions sit 30px plus `env(safe-area-inset-bottom)` above the bottom, with at least 20px side gutters. Keep the base clearance even when Safari reports a zero inset; it protects text from rounded screen corners without changing the site's viewport configuration.

`nm-sites-touch.js` adds separate Preview buttons for coarse pointers and narrow screens. Site links still navigate directly. Preview images load only on first expansion and are retained; returning to desktop closes inline previews and restores the existing cursor preview. Keep each button outside its corresponding anchor and preserve `aria-expanded` / `aria-controls`.

Archive images have responsive source sets using actual pixel widths: small `nm-thumb` files, 768px-wide `nm-index` files, and `nm-work` originals. The intermediate size avoids downloading 1600px originals for a 195px tile on a 3× phone. Source sizes track the exact 2/3/4/5-column fractions. Only the first tile has high fetch priority; other images load lazily. Run `python3 tools/build-index-images.py` with Pillow after changing gallery originals; use `--check` to validate every candidate’s pixel width and decoding. Lightbox sizing uses the dynamic viewport height so controls and images stay visible after rotation.

If a full-size lightbox request fails, it falls back once to the thumbnail. If both fail, a short status replaces the image while next/previous/close remain available. Paging resets the failure state, so one failed asset cannot strand the viewer.

The footer scene updates its stored progress on ScrollTrigger refresh as well as scroll. The home bridge coalesces window and main-layout resize events into a single refresh per frame, with cleanup. This is required when rotation changes the service layout and footer position while already at the bottom. Cloud sprites scale with viewport height relative to the 1080px desktop reference, so landscape phones do not become an overexposed blob.

On coarse pointers, window height-only changes from browser toolbars do not trigger a full scroll-range refresh. Width changes and ResizeObserver notifications for real content/hero geometry still refresh, including rotation. Preserve this distinction in both the home bridge and `nm-home-scroll.js`.

The Index cloud waits for its texture before drawing during rotation. Its animation runs only near the footer in a visible tab; changing the reduced-motion preference redraws one still frame and stops the loop.
