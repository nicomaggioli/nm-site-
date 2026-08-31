/* The header corner used to be Boston weather. It is now a coordinate that
   changes once a day -- wonders, ruins, places nobody has actually found, and a
   few that are not on this planet. Hovering tells you where it points; clicking
   opens it.

   The day index is derived from the local calendar date, not from elapsed
   milliseconds, so everyone looking on the same day sees the same place and it
   flips at the visitor's own midnight rather than at some arbitrary hour. */
(function () {
  var P = [["Great Pyramid of Giza",29.9792,31.1342,"","The only one of the seven ancient wonders still standing. It held the record for the tallest structure on Earth for roughly 3,800 years."],["Hanging Gardens of Babylon",32.5355,44.4275,"","The only ancient wonder whose location has never been proven. No Babylonian text mentions it; some scholars think the Greeks were describing Nineveh, 500km north."],["Temple of Artemis, Ephesus",37.9497,27.3639,"","Rebuilt three times. One was burned down in 356 BC by a man who did it purely so that history would remember his name. It worked."],["Statue of Zeus at Olympia",37.638,21.63,"","Twelve metres of ivory and gold. Archaeologists found the sculptor's workshop still standing nearby, and in it his drinking cup, with his name scratched into the base."],["Mausoleum at Halicarnassus",37.0379,27.4241,"","Built for a ruler by his sister, who was also his wife. Every grand tomb since has been called a mausoleum after him."],["Colossus of Rhodes",36.451,28.2278,"","About 33 metres — roughly the Statue of Liberty without her plinth. It stood for 54 years before an earthquake dropped it, and the ruins were left lying there for another 800."],["Lighthouse of Alexandria",31.2139,29.8856,"","One of the tallest buildings on Earth for centuries. Blocks from it were found on the seabed in 1994, and some had already been reused in a fort still standing on the site."],["The Great Wall of China",40.3587,116.0059,"","Not one wall but many, built by successive dynasties over about 2,000 years. It is not visible from space with the naked eye — that claim predates spaceflight entirely."],["Petra",30.3285,35.4444,"","Carved straight into the rock face and fed by a hydraulic system that moved water through a desert canyon. Only around 15% of it has been excavated."],["Christ the Redeemer",-22.9519,-43.2105,"","Struck by lightning several times a year. The archdiocese keeps a private stock of the original soapstone on hand for repairs."],["Machu Picchu",-13.1631,-72.545,"","Built without mortar. The stones are cut so precisely that a blade will not fit between them — which is also why it survives earthquakes: the blocks shift and resettle."],["Chichén Itzá",20.6843,-88.5678,"","Clap once at the foot of the main pyramid and the echo returns as a chirp, close to the call of the quetzal — the bird the Maya held sacred."],["The Colosseum",41.8902,12.4922,"","Fifty thousand people could clear it in minutes through 80 numbered exits. Modern stadiums still use the same principle."],["Taj Mahal",27.1751,78.0421,"","The four minarets lean very slightly outward, so that if they ever fall, they fall away from the tomb."],["Atlantis, allegedly",21.1244,-11.4016,"","The Richat Structure in Mauritania: 40km of concentric rings in the Sahara. It matches Plato's description closely enough to keep the theory alive. Geologists say it is an eroded dome."],["El Dorado, allegedly",4.9786,-73.7767,"","Lake Guatavita, Colombia. The legend was never a city — it was a ritual. A new chief was covered in gold dust, rowed to the middle, and washed clean in the water."],["Shangri-La, allegedly",27.8253,99.7069,"","Invented for a novel in 1933. In 2001 the Chinese county of Zhongdian legally renamed itself Shangri-La in order to claim the tourism."],["The Lost City of Z",-12.55,-53.1,"","Percy Fawcett disappeared looking for it in 1925. Lidar surveys have since found large earthwork settlements across the Amazon — he may have been less wrong than everyone assumed."],["The Bermuda Triangle",25.0,-71.0,"","Insurers do not rate it as higher risk. Lloyd's of London charges the same premium to cross it as any comparable stretch of ocean."],["Area 51",37.235,-115.8111,"","The CIA did not officially acknowledge that it existed until 2013. The declassified file confirms the base and says the work was U-2 spy planes."],["Point Nemo",-48.8767,-123.3933,"","The furthest point in the ocean from any land. The nearest humans are usually the crew of the ISS, 400km overhead. Space agencies deliberately crash retired spacecraft here."],["Challenger Deep",11.3733,142.5917,"","Almost 11km down, at the bottom of the Mariana Trench. For decades fewer people had been here than had walked on the Moon; the crewed dives since 2019 finally passed that."],["The summit of Everest",27.9881,86.925,"","The rock at the very top is marine limestone — old seabed, pushed 8.8km into the air by India colliding with Asia. It is still rising a few millimetres a year."],["Socotra",12.4634,53.8237,"","About a third of its plant species exist nowhere else on Earth, including the dragon's blood tree, which bleeds red resin when cut."],["The Danakil Depression",14.2417,40.3,"","A hundred metres below sea level, averaging 35°C year round, with acid pools full of microbes that NASA studies as an analogue for life off Earth."],["Salar de Uyuni",-20.1338,-67.4891,"","The largest salt flat on Earth, and so level it is used to calibrate satellite altimeters. After rain a film of water turns the whole thing into a mirror."],["The Giant's Causeway",55.2408,-6.5116,"","Around 40,000 basalt columns, most of them hexagonal, formed as a lava flow cooled and contracted into a crack pattern."],["The Great Blue Hole",17.3159,-87.5348,"","A cave system that flooded when sea levels rose after the last ice age. The stalactites inside formed while it was still dry land."],["Mount Roraima",5.1431,-60.7619,"","A two-billion-year-old tabletop mountain with 400m cliffs on every side, where Venezuela, Brazil and Guyana meet. It gave Conan Doyle the idea for The Lost World."],["Zhangjiajie",29.3158,110.4349,"","The sandstone pillars that the floating mountains in Avatar were modelled on. One of them was officially renamed after the film came out."],["The Marble Caves, Patagonia",-46.65,-72.65,"","Carved by six thousand years of waves into solid marble. The blue comes from glacial silt in the lake bouncing light off the walls."],["Antelope Canyon",36.8619,-111.3743,"","Cut by flash floods rather than a river. The walls are shaped by water that is only there a handful of days a year."],["The aurora over Svalbard",78.2232,15.6267,"","The only inhabited place where the aurora can be seen at midday. During polar night the sun does not rise for four months."],["Stonehenge",51.1789,-1.8262,"","The bluestones were brought from the Preseli Hills in Wales, about 250km away, around 3000 BC — by people with no wheels and no draft animals."],["The moai of Rapa Nui",-27.1127,-109.3497,"","Most of them have bodies. Excavation showed the famous heads are buried up to the shoulders in centuries of sediment."],["The Nazca Lines",-14.739,-75.13,"","Some are 370m across and only legible from the air. They survive because it almost never rains there and the ground barely moves."],["Angkor Wat",13.4125,103.867,"","The largest religious structure ever built, with more stone in it than the Great Pyramid. It was never actually lost — Westerners simply arrived in the 1800s and said so."],["The Sagrada Família",41.4036,2.1744,"","Under construction since 1882. Gaudí is buried in the crypt of the building he knew he would never see finished."],["Olympus Mons",18.65,226.2,"Mars","The tallest volcano in the solar system at about 22km — roughly two and a half Everests. It is so wide that its slopes fall away past the horizon; standing on it, you could not tell you were on a mountain."],["Valles Marineris",-13.9,-59.2,"Mars","A canyon system 4,000km long. Laid over Earth it would stretch from one side of the United States to the other."],["Tranquility Base",0.6741,23.473,"the Moon","Armstrong's and Aldrin's bootprints are still there and will be for millions of years. No wind, no water, nothing to erase them."],["Tycho Crater",-43.31,-11.36,"the Moon","The bright rays that streak across the face of the full Moon all radiate from here. The impact that made it happened while dinosaurs were still walking around."],["The Great Red Spot",-22.0,-128.0,"Jupiter","A storm that has been running for at least 190 years and is wide enough to swallow the Earth. It has been steadily shrinking since we started measuring it."],["The tiger stripes of Enceladus",-75.0,-60.0,"Saturn's moon","Cracks at the south pole venting water into space from an ocean beneath the ice. Cassini flew straight through the plume and found organic molecules in it."]];
  var el = null, cur = -1;

  function dayIndex() {
    var d = new Date();
    /* UTC-normalised so DST changes cannot skip or repeat a day */
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  function fmt(v, pos, neg) {
    return Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? pos : neg);
  }
  function rendered(n) {
    for (var p = n; p; p = p.parentElement)
      if (p.nodeType === 1 && getComputedStyle(p).display === 'none') return false;
    return true;
  }
  function header() {
    /* the homepage header is Tailwind-classed and React-rendered; the archive's
       is the hand-written .nm-hdr. One widget, both bars. */
    var h = document.querySelectorAll('header[class*="z-50"], header.nm-hdr');
    for (var i = 0; i < h.length; i++) if (rendered(h[i])) return h[i];
    return null;
  }
  function paint() {
    if (!el) return;
    var i = ((dayIndex() % P.length) + P.length) % P.length, p = P[i];
    var name = p[0], lat = p[1], lon = p[2], body = p[3], fact = p[4];
    var coords = fmt(lat, 'N', 'S') + '  ' + fmt(lon, 'E', 'W');
    var label = body ? name + ', ' + body : name;
    if (i !== cur) {
      el.innerHTML =
        '<span class="nm-c-face">' +
          '<span class="nm-c-num"></span>' +
          '<span class="nm-c-name"></span>' +
        '</span>';
      el.querySelector('.nm-c-num').textContent  = coords;
      el.querySelector('.nm-c-name').textContent = label;
      el.setAttribute('aria-label', label + ' — ' + coords);
      el.setAttribute('aria-expanded', 'false');

      /* the panel is a sibling, not a child: the widget is uppercase and
         letterspaced, and prose has to escape that */
      var pan = document.createElement('div');
      pan.className = 'nm-c-panel';
      pan.innerHTML =
        '<div class="nm-c-p-name"></div>' +
        '<div class="nm-c-p-co"></div>' +
        '<p class="nm-c-p-fact"></p>' +
        '<a class="nm-c-p-go" target="_blank" rel="noreferrer">Open in maps ↗</a>';
      pan.querySelector('.nm-c-p-name').textContent = name;
      pan.querySelector('.nm-c-p-co').textContent   = body ? coords + '  ·  ' + body : coords;
      pan.querySelector('.nm-c-p-fact').textContent = fact;
      /* off-world coordinates mean nothing to a map, so send those to a search */
      pan.querySelector('.nm-c-p-go').href = body
        ? 'https://www.google.com/search?q=' + encodeURIComponent(name + ' ' + body)
        : 'https://www.google.com/maps?q=' + lat + ',' + lon;
      /* On <body>, NOT inside the header. The header carries backdrop-filter on
         two pseudo-elements plus isolation:isolate, which makes it a composited
         layer that re-samples everything behind it on every scroll. A panel
         living inside that layer gets re-rasterised along with it -- which is
         why opening it after scrolling the length of the page and back tore and
         flickered. Out here it is its own layer and the filter cannot reach it. */
      var oldPan = document.querySelector('.nm-c-panel');
      if (oldPan) oldPan.remove();
      document.body.appendChild(pan);
      cur = i;
    }
    revealWithHeader();
  }

  /* The build reveals the wordmark and the nav together at ~1.5s by writing an
     inline opacity onto them. This widget mounts and shows itself at ~230ms, so
     the coordinates sat alone in an otherwise empty bar for over a second.
     Wait for the wordmark to land, then arrive with it. */
  function revealWithHeader() {
    if (!el || el.classList.contains('is-in')) return;
    var h = header();
    var wm = h && h.querySelector('a[href="/"], .wordmark');
    if (!wm) { el.classList.add('is-in'); return; }
    var show = function () {
      if (parseFloat(getComputedStyle(wm).opacity) < 1) return false;
      el.classList.add('is-in');
      return true;
    };
    if (show()) return;
    var iv = setInterval(function () { if (show()) clearInterval(iv); }, 60);
    /* never strand it if the build's reveal never fires */
    setTimeout(function () { clearInterval(iv); if (el) el.classList.add('is-in'); }, 6000);
  }

  function panel() { return document.querySelector('.nm-c-panel'); }

  /* A fixed panel has no header box to measure against, and the header's height
     changes with the wordmark capsule across breakpoints -- so anchor it when it
     opens. Once per open, not per frame. */
  function place() {
    var pan = panel(), h = header();
    if (!pan || !h) return;
    pan.style.top = Math.round(h.getBoundingClientRect().bottom + 14) + 'px';
  }
  function close() {
    var pan = panel();
    if (pan) pan.classList.remove('is-open');
    if (el) el.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    var pan = panel();
    if (!pan) return;
    var open = !pan.classList.contains('is-open');
    if (open) place();
    pan.classList.toggle('is-open', open);
    el.setAttribute('aria-expanded', String(open));
  }
  function mount() {
    var h = header();
    if (!h) return;
    /* Document-wide, NOT h.querySelector. React swaps the homepage header
       wholesale, and rendered() can disagree about which header is live for a
       frame or two during that swap. Looking only inside the header we just
       picked meant "not found" whenever we picked a different one -- so this
       built a SECOND button instead of finding the first. Two buttons in the
       same corner is exactly the observed damage: one showing the coordinates
       and one showing the place name, superimposed; or the empty one on top,
       because a node adopted from the other header never had its guts painted
       (cur still matched the day index, so paint() skipped the write). */
    var found = document.getElementById('nm-coord');
    if (!found) {
      found = document.createElement('button');
      found.id = 'nm-coord';
      found.type = 'button';
      found.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
      h.appendChild(found);
      cur = -1;                       // fresh node: force a repaint of its guts
    } else if (found.parentNode !== h) {
      /* it exists but React re-parented it, or the live header changed: MOVE
         the one we have. Never create a second. */
      h.appendChild(found);
    }
    /* Belt and braces: if a duplicate ever does appear, keep the one we own. */
    var all = document.querySelectorAll('#nm-coord');
    for (var i = 0; i < all.length; i++) if (all[i] !== found) all[i].remove();
    el = found;
    if (!el.querySelector('.nm-c-num')) cur = -1;   // adopted empty shell
    paint();
  }
  mount();
  /* click anywhere else, or Escape, closes it. The panel itself is excluded so
     that selecting the text inside does not dismiss it mid-drag. */
  document.addEventListener('click', function (e) {
    var pan = panel();
    if (!pan || !pan.classList.contains('is-open')) return;
    if (pan.contains(e.target) || (el && el.contains(e.target))) return;
    close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', function () {
    var pan = panel();
    if (pan && pan.classList.contains('is-open')) place();
  }, { passive: true });
  /* roll over for anyone who leaves the tab open past midnight */
  setInterval(paint, 5 * 60 * 1000);
  /* Shared with every other nm-* widget — see js/nm-sync.js. This used to be
     its own document-wide observer, and mount() appends to the header while
     paint() swaps a panel on <body>, so it re-triggered itself and the other
     four. __nmSync also re-runs it on DOMContentLoaded and load. */
  if (window.__nmSync) window.__nmSync(mount);
  else { document.addEventListener('DOMContentLoaded', mount); window.addEventListener('load', mount); }
})();
