# Night Sky: star data and featured-star facts

Companion to `docs/night-sky.md`. It records where the stars in `media/sky/{home,about,index}.json`
come from, how those files were built, and the sources behind each featured star's distance and
fact. Every fact was checked against the sources listed with it (fetched 30 September 2026).

## Catalogue

- **Yale Bright Star Catalogue, 5th revised edition** (preliminary version). D. Hoffleit and
  W. H. Warren Jr., Astronomical Data Center, NSSDC/ADC, 1991 (bibcodes 1964BS....C......0H,
  1991bsc..book.....H). It lists 9,110 objects, of which 9,096 are stars.
- Copy used: CDS catalogue V/50, `https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz` (ASCII,
  197-byte records) with the byte layout from `https://cdsarc.cds.unistra.fr/ftp/V/50/ReadMe`.
  Downloaded 2026-09-30. SHA-256 of `catalog.gz`:
  `3dc44b1e90be8fbe5bcc7656032560f51275f985c7e3f783c9028e1838ec7bed`.
  The same catalogue is also distributed by Harvard CfA (`http://tdc-www.harvard.edu/catalogs/bsc5.html`)
  and NASA HEASARC.
- Fields used: J2000 RA (bytes 76–83) and Dec (84–90), V magnitude (103–107), B−V (110–114).
  The 14 entries with no position (novae and non-stellar objects kept for numbering) are skipped.
- **Terms of use.** The catalogue has no formal licence. CDS's rules
  (`https://cds.unistra.fr/vizier-org/licences_vizier.html`) say VizieR data are free to use in
  a scientific context with the original authors cited, and that commercial use depends on where
  the data came from. BSC5 was compiled at Yale and NASA's Astronomical Data Center. It has been
  freely redistributed for decades by CDS, Harvard and HEASARC. We use only factual measurements
  (positions, magnitudes and colours) and credit the catalogue in each JSON file's `source` field.
  The usual acknowledgement is: "This research has made use of the VizieR catalogue access tool,
  CDS, Strasbourg, France (DOI: 10.26093/cds/vizier)."

## How the sky files were built

- `stars`: every catalogue star with V ≤ 6.0 within the page's region plus a 20° margin. The
  region is the area that the viewport sweeps over the full page scroll, for any aspect ratio up
  to 4:3. Concretely, a star is included when it lies within 48.9° (47.8° on the index page) + 20°
  of a point on the view centre's scroll path. Both readings of `scrollPan` are covered: t from 0
  to 1, or centred from −0.5 to +0.5. Entries are `[ra_hours, dec_deg, V, B−V]`, rounded to four
  decimals for RA and Dec, and sorted brightest first (ties broken by HR number). Where B−V is
  missing, it is set to 0.6. Some stars, such as Polaris, really have B−V = 0.60.
- Counts: **home 1,983** stars (7 with V ≤ 1, 24 with V ≤ 2), **about 1,778** (4 / 10),
  **index 1,618** (3 / 14). File sizes are 71 KB, 65 KB and 59 KB, with one star per line.
- BSC lists some close pairs as separate entries, and both are kept: Mizar A (HR 5054) and Mizar B
  (HR 5055, V 3.95, 14″ apart), and Albireo A (HR 7417) and Albireo B (HR 7418, V 5.11, 35″ apart).
  At these fields they fall on the same pixel. **Alcor** (HR 5062, V 4.01) is 12′ from Mizar,
  about 4 CSS px apart at the index framing on a 1600 px wide window. If star cores stay tiny,
  Alcor appears as its own faint dot right beside Mizar, which is what Mizar's fact invites the
  viewer to look for.

### `view` conventions assumed when choosing the framing

- Stereographic projection about (`ra`, `dec`), with north up and **east to the left**, as the sky
  looks from the ground.
- `fov` is the angle across the viewport's long side, so the middle of the long edge is `fov/2`
  from the centre. In projected units, half the long side = 2·tan(fov/4).
- `roll` is 0 on every page, so the sign convention does not matter yet.
- At scroll fraction t (0 to 1), the centre is at (`ra` + t·`scrollPan[0]`, `dec` + t·`scrollPan[1]`).
  A positive RA pan moves the stars westward (to the right), the way the sky turns as the night
  goes on.

| page | view | what it frames |
|---|---|---|
| home | RA 5.35h, Dec +2°, fov 80, pan [+0.7h, −4°] | Orion near the centre with the belt and Betelgeuse/Rigel; Aldebaran and the Hyades upper right; Sirius lower left; Procyon at the left edge. Orion drifts right as you scroll and Sirius climbs. |
| about | RA 19.3h, Dec +29.5°, fov 80, pan [+0.8h, −5°] | The Summer Triangle the way it stands at its evening transit: Deneb upper left, Vega upper right, Altair at the bottom, and Albireo at the foot of the Northern Cross. |
| index | RA 12.2h, Dec +72.5°, fov 78, pan [+1.2h, 0] | Polaris at the top with the Little Dipper; the Big Dipper below, bowl open toward Polaris and pointers aimed at it; Thuban between them. The RA pan turns the field around the pole. |

Featured-star coverage (share of scroll positions where the star is inside the viewport with a
6% inset; linear / centred reading of `scrollPan`):

- 1600×1000, 1440×900 and 1024×1366: every featured star is in view at every scroll position.
- 1920×1080: every featured star is in view for at least 84% / 50% of the scroll.
- 390×844 phone: every featured star appears. The extremes are Sirius (63% / 14%) and Aldebaran
  (56% / 100%) on home, and Vega (92% / 100%) and Deneb (100% / 74%) on about.
- 21:9 ultrawide (2560×1080): the short side covers only about 35°, so Deneb, Altair, Polaris,
  Mizar and Sirius (centred reading) do not fit. If wide screens matter, the engine should make sure the short side covers at
  least about 48°.

Previews made with the same projection are in the scratchpad (not in the repo); see the summary
of this run.

## Featured stars

Coordinates, V and B−V come from the BSC entries named here. The `coords` strings are rounded to
the nearest second of RA and second of arc.

### home

**Sirius**, α Canis Majoris (HR 2491). RA 06h 45m 09s · Dec −16° 42′ 58″, V −1.46, B−V 0.00.
Distance: 8.6 light-years.
Fact: "The brightest star in the night sky. A white dwarf, Sirius B, circles it every 50 years."
- https://en.wikipedia.org/wiki/Sirius: brightest star in the night sky; 2.64 pc (8.6 ly); the
  pair orbits every 50 years; Sirius B is a white dwarf.
- https://www.esa.int/Science_Exploration/Space_Science/Weighing_the_Dog_Star_s_companion: "the
  brightest star in the sky"; Sirius B is a white dwarf; 8.6 light-years.
- https://ui.adsabs.harvard.edu/abs/2017ApJ...840...70B/abstract (Bond et al. 2017): orbital
  period 50.13 years.

**Betelgeuse**, α Orionis (HR 2061). RA 05h 55m 10s · Dec +07° 24′ 25″, V 0.50, B−V 1.85.
Distance: about 550–700 light-years. Published values range from about 500 ly (Hipparcos 2007)
and 548 ly (Joyce et al. 2020) to 724 ly (Harper et al. 2017); ESA/Hubble uses 725 ly.
Fact: "In 2019–20 it faded to about a third of its usual brightness, dimmed by a cloud of dust it
had cast off."
- https://esahubble.org/news/heic2014/: the dimming began in October 2019; "by mid-February 2020
  ... had dropped by more than a factor of three"; a dust cloud formed from plasma thrown out of
  the surface; "about 725 light-years away".
- https://en.wikipedia.org/wiki/Betelgeuse: record minimum of +1.614, "a factor of approximately
  3"; the dust came from a surface mass ejection; distance estimates of 500, 548 and 724 ly.
- https://iopscience.iop.org/article/10.3847/1538-4357/abb8db (Joyce et al. 2020): 168 pc.
- https://iopscience.iop.org/article/10.3847/1538-4357/ac7853 (Dupree et al. 2022): the surface
  mass ejection.

**Rigel**, β Orionis (HR 1713). RA 05h 14m 32s · Dec −08° 12′ 06″, V 0.12, B−V −0.03.
Distance: about 860 light-years. Hipparcos 2007 gives 863 ly; other estimates run to about
1,010 ly (Gaia DR3, for Rigel B) and 1,170 ly.
Fact: "A blue supergiant. Though labelled beta, it is almost always brighter than Betelgeuse,
Orion’s alpha."
- https://en.wikipedia.org/wiki/Rigel: "Rigel is a blue supergiant"; it "is almost always
  brighter than α Orionis (Betelgeuse)"; gives the distance estimates.
- https://www.skyatnightmagazine.com/advice/star-rigel: "the blue-supergiant Rigel"; "Although
  designated beta, at mag. +0.1 Rigel is brighter than Betelgeuse"; 863 light-years.

**Aldebaran**, α Tauri (HR 1457). RA 04h 35m 55s · Dec +16° 30′ 33″, V 0.85, B−V 1.54.
Distance: 67 light-years. Hipparcos 2007 gives 66.6 ly and NASA quotes 68 ly.
Fact: "Pioneer 10 is coasting in its general direction and should pass it in about two million
years."
- https://science.nasa.gov/mission/pioneer-10: "generally heading in the direction of the red star
  Aldebaran"; "expected to pass by Aldebaran in about two million years".
- https://en.wikipedia.org/wiki/Aldebaran: about 67 light-years; Pioneer 10's "trajectory is
  taking it in the general direction of Aldebaran".

### about

**Vega**, α Lyrae (HR 7001). RA 18h 36m 56s · Dec +38° 47′ 01″, V 0.03, B−V 0.00.
Distance: 25 light-years.
Fact: "In July 1850, at Harvard, it became the first star other than the Sun to be photographed."
- https://en.wikipedia.org/wiki/Vega: "the first star (other than the Sun) to be photographed",
  by Bond and Whipple at Harvard College Observatory; 25 light-years.
- https://www.astronomy.com/today-in-the-history-of-astronomy/july-16-1850-bond-and-whipple-photograph-vega/:
  the night of 16–17 July 1850, with Harvard's 15-inch refractor.

**Deneb**, α Cygni (HR 7924). RA 20h 41m 26s · Dec +45° 16′ 49″, V 1.25, B−V 0.09.
Distance: about 1,400–2,600 light-years. Hipparcos gives 1,410 ly, and Schiller & Przybilla 2008
give 2,620 ly. EarthSky calls about 1,500 ly the most widely accepted value.
Fact: "Its name is Arabic for “tail”: it marks the swan’s tail. Few stars the eye can see are as
luminous."
- https://earthsky.org/brightest-stars/deneb-among-the-farthest-stars-to-be-seen/: "at the tail of
  the Swan (the star name 'deneb' always means 'tail')"; "one of the most luminous stars ... that
  we can see with the eye"; distance from about 1,500 to 2,600 ly.
- https://en.wikipedia.org/wiki/Deneb: from the Arabic word for "tail"; "rivals Rigel ... as the
  most luminous first-magnitude star"; distance estimates from 1,400 to 2,600 ly.

**Altair**, α Aquilae (HR 7557). RA 19h 50m 47s · Dec +08° 52′ 06″, V 0.77, B−V 0.22.
Distance: 16.7 light-years.
Fact: "It spins once in under eight hours, so fast that it is over 20% wider at the equator than
pole to pole."
- https://en.wikipedia.org/wiki/Altair: 16.7 ly; "a rotational period of under eight hours"; "Its
  equatorial diameter is over 20 percent greater than its polar diameter"; Monnier et al. imaged
  the surface with CHARA in 2006–07.
- https://phys.org/news/2007-05-university-michigan-astronomers-capture-image.html (University of
  Michigan): it spins at 638,000 mph at the equator, and this "flatten[s] it into an oval".

**Albireo**, β Cygni (HR 7417, β¹ Cyg, the bright gold component). RA 19h 30m 43s ·
Dec +27° 57′ 35″, V 3.08, B−V 1.13. Distance: about 400 light-years. Hipparcos gives 434 ly for
A and 401 ly for B; Gaia gives about 330–390 ly for both.
Fact: "One star to the eye; a small telescope splits it into a gold star and a fainter blue one."
- https://earthsky.org/brightest-stars/albireo-finest-double-star/: through a small telescope it
  resolves into "one a lovely gold and the other a dimmer blue"; binoculars rarely split it; about
  400 light-years.
- https://en.wikipedia.org/wiki/Albireo: the components are 35″ apart; gives the distances; "It is
  not known whether" A and B are a physical binary. The fact avoids calling them a pair.

### index

**Polaris**, α Ursae Minoris (HR 424). RA 02h 31m 49s · Dec +89° 15′ 51″, V 2.02, B−V 0.60.
Distance: about 430 light-years. EarthSky gives 434 ly and Hipparcos 432 ly, while Gaia DR3 for
Polaris B gives 446.5 ly. Turner et al. argue for about 323 ly, and an HST parallax of Polaris B
(Bond et al. 2018, 6.26 mas) implies about 520 ly.
Fact: "The North Star, and a Cepheid variable: it pulses gently in brightness about every four
days."
- https://phys.org/news/2023-09-polaris-closest-brightest-cepheid-variable.html: "a classic
  Cepheid variable"; "a consistent pulse period of about four days".
- https://earthsky.org/brightest-stars/polaris-the-present-day-north-star/: a Cepheid variable;
  434 light-years.
- https://en.wikipedia.org/wiki/Polaris: a period of roughly 4 days; amplitude below 0.05 mag
  since the 1960s (hence "gently"); 0.66° from the pole in 2018; gives the distance estimates.
- https://arxiv.org/abs/1712.08139: the HST parallax of Polaris B.

**Mizar**, ζ Ursae Majoris (HR 5054, Mizar A). RA 13h 23m 56s · Dec +54° 55′ 31″, V 2.27,
B−V 0.02. Distance: 83 light-years (Hipparcos; Alcor is about the same distance).
Fact: "Look for faint Alcor right beside it: seeing both was a traditional test of good
eyesight."
- https://en.wikipedia.org/wiki/Mizar: "Mizar and Alcor ... are a good test of minimal vision";
  about 83 light-years.
- https://earthsky.org/tonight/ancient-eye-test-relied-on-two-stars-in-big-dipper/: the ancient
  eye test, with the Roman-archer legend.

**Dubhe**, α Ursae Majoris (HR 4301). RA 11h 03m 44s · Dec +61° 45′ 03″, V 1.79, B−V 1.07.
Distance: 123 light-years.
Fact: "One of the Pointers: a line from Merak through Dubhe, extended about five times, leads to
Polaris."
- https://earthsky.org/brightest-stars/polaris-the-present-day-north-star/: "draw a line from
  Merak through Dubhe, and go about five times the Merak/Dubhe distance to Polaris."
- https://earthsky.org/tonight/use-the-pointers-to-find-polaris/: Dubhe and Merak are "The
  Pointers".
- https://en.wikipedia.org/wiki/Alpha_Ursae_Majoris: about 123 light-years; the northern of the
  two pointers.

**Thuban**, α Draconis (HR 5291). RA 14h 04m 23s · Dec +64° 22′ 33″, V 3.65, B−V −0.05.
Distance: 300 light-years.
Fact: "It was the pole star when the ancient Egyptians were building their pyramids."
- https://earthsky.org/brightest-stars/thuban-past-north-star/: "the Pole Star some 5,000 years
  ago, when the Egyptians were building the pyramids".
- https://en.wikipedia.org/wiki/Thuban: the naked-eye star closest to the pole from 3942 BC to
  1793 BC, a span that covers the whole pyramid-building era; closest to the pole in 2830 BC;
  300 light-years.

## Candidate facts not used

- The claim that Vega was "the pole star ~12,000 years ago" is loose. Wikipedia says that around
  12,000 BCE the pole was about 5° from Vega, so the 1850 photograph was used instead.
- "The Great Pyramid's descending passage pointed at Thuban" is a popular claim but disputed, so
  it was left out. The fact keeps only the pole-star timing.
- "Mizar was the first double star photographed (1857)" was not confirmed in the sources checked,
  so it was not used.
- Exact Thuban dates were not used because sources differ (2787 BCE on EarthSky, 2830 BC on
  Wikipedia).
