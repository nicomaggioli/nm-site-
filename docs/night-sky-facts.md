# Night Sky: star data and featured-star facts

Companion to `docs/night-sky.md`. It records where the stars in `media/sky/{home,about,index}.json`
come from, how those files were built, and the sources behind each featured star's distance and
fact. Every fact was checked against the sources listed with it (fetched 30 September 2026), then
re-checked by an independent adversarial pass the same day (see "Fact-check log" below).

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

The decimal `ra`, `dec`, `vmag` and `bv` in each featured entry are the BSC values, so the hover
target sits exactly on the drawn star. The `coords` strings were checked against SIMBAD (ICRS,
epoch J2000, rounded to the nearest second of RA and second of arc); BSC truncates Dec to whole
arcseconds, which is why Dubhe's string now reads 04″ where BSC has 03″. SIMBAD query used
(`https://simbad.cds.unistra.fr/simbad/sim-script`, format `%COO(s;A D;ICRS;J2000) | %PLX(V E B)`),
per-star pages at `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=<id>` (ids `alf CMa`,
`alf Ori`, `bet Ori`, `alf Tau`, `alf Lyr`, `alf Cyg`, `alf Aql`, `bet01 Cyg`, `alf UMi`,
`zet01 UMa`, `alf UMa`, `alf Dra`). Light-years = 3.26156 / parallax in arcsec.

Distance rule: a single figure where one modern measurement is precise and undisputed; "about" a
figure where the best value carries a few per cent of uncertainty; a range where respected
estimates disagree by more than about 10%.

### home

**Sirius**, α Canis Majoris (HR 2491). SIMBAD 06 45 08.92 −16 42 58.0, so
"RA 06h 45m 09s · Dec −16° 42′ 58″". V −1.46, B−V 0.00.
Distance: 8.6 light-years (Hipparcos 2007, 379.21 ± 1.58 mas = 8.60 ly).
Fact (unchanged): "The brightest star in the night sky. A white dwarf, Sirius B, circles it every
50 years."
- https://arxiv.org/abs/1703.10625 (Bond et al. 2017, ApJ 840, 70): Sirius B "the brightest and
  nearest white dwarf", orbital period 50.13 years.
- https://www.esa.int/Science_Exploration/Space_Science/Weighing_the_Dog_Star_s_companion: "the
  brightest star in the sky"; Sirius B a white dwarf; 8.6 light-years.
- Check: strictly both stars orbit their common centre of mass; "circles it" is the usual plain
  phrasing and the period is right.

**Betelgeuse**, α Orionis (HR 2061). SIMBAD 05 55 10.31 +07 24 25.4 → "RA 05h 55m 10s · Dec
+07° 24′ 25″". V 0.50 (BSC; GCVS range 0.0–1.6), B−V 1.85.
Distance: **about 500–700 light-years** (was "about 550–700"). Hipparcos 2007 gives 500 ± 65 ly,
Joyce et al. 2020 548 ly, Harper et al. 2008 643 ly and Harper et al. 2017 724 ly (ESA/Hubble
rounds to 725); a 2022 study went as low as about 410 ly. The old range left out the Hipparcos
value that much of the literature still quotes.
Fact (changed): "In 2019–20 it faded to about a third of its usual brightness, veiled mostly by dust
from gas it threw off." Was "…dimmed by a cloud of dust it had cast off." The star threw off gas,
which then condensed into dust when a patch of the surface cooled; the cooler surface also played a
part, hence "mostly", and "from gas it threw off" instead of "dust it had cast off".
- https://esahubble.org/news/heic2014/: dimming began October 2019; "By mid-February 2020, the
  brightness … had dropped by more than a factor of three"; dust formed from ejected plasma that
  cooled; "about 725 light-years away".
- https://www.eso.org/public/news/eso2109/ (Montargès et al. 2021, Nature): "the star ejected a
  large gas bubble … When a patch of the surface cooled down shortly after, that temperature
  decrease was enough for the gas to condense into solid dust"; the dimming "was caused by a dusty
  veil".
- https://www.cfa.harvard.edu/news/mystery-solved-dust-cloud-led-betelgeuses-great-dimming: "lost
  more than two-thirds of its brightness in late 2019 and early 2020".
- https://arxiv.org/abs/2208.01676 (Dupree et al. 2022): surface mass ejection, then dust.
- https://en.wikipedia.org/wiki/Betelgeuse: "dropped by a factor of approximately 3, from magnitude
  0.5 to 1.7"; record minimum +1.614; the distance estimates above.
- Arithmetic: 0.5 → 1.61 is 1.1 mag, a factor of 2.8; ESA quotes more than 3. "About a third" holds.

**Rigel**, β Orionis (HR 1713). SIMBAD 05 14 32.27 −08 12 05.9 → "RA 05h 14m 32s · Dec −08° 12′
06″". V 0.12, B−V −0.03.
Distance: **about 850–1,000 light-years** (was "about 860"). Hipparcos 2007: 3.78 ± 0.34 mas,
863 ly (±9%; Wikipedia's infobox gives 848 ± 65). Its reflection nebula IC 2118 gives 949 ± 7 ly,
Gaia DR3 for Rigel B 1,010 ± 20 ly (flagged as possibly unreliable next to so bright a star), and a
spectroscopic estimate (Przybilla et al.) 1,170 ± 130 ly. A single "about 860" implied more
certainty than exists.
Fact (unchanged): "A blue supergiant. Though labelled beta, it is almost always brighter than
Betelgeuse, Orion’s alpha."
- https://en.wikipedia.org/wiki/Rigel: B8 Ia "blue supergiant"; Bayer named it β in 1603 though it
  is "almost always brighter than α Orionis (Betelgeuse)"; V 0.05–0.18.
- GCVS (VizieR B/gcvs): Rigel ACYG 0.17–0.22; Betelgeuse SRC 0.0–1.6. Betelgeuse outshines Rigel
  only near its rare peaks (it reached about 0.0 visual in April 2023), so "almost always" is right
  and "always" would not be.

**Aldebaran**, α Tauri (HR 1457). SIMBAD 04 35 55.24 +16 30 33.5 → "RA 04h 35m 55s · Dec +16° 30′
33″". V 0.85, B−V 1.54.
Distance: 67 light-years (Hipparcos 2007: 48.94 ± 0.77 mas = 66.6 ± 1.0 ly; NASA rounds to 65–68).
Fact (changed): "Pioneer 10 is coasting its way, but Aldebaran recedes over four times faster, so the
probe will never arrive." Was "Pioneer 10 is coasting in its general direction and should pass it
in about two million years." The old line repeats a NASA web-page claim that does not survive
arithmetic:
- Aldebaran moves away from the Sun at +54.3 km/s (radial velocity: Wikipedia +54.26 ± 0.03;
  SIMBAD/Gaia DR2 +54.40), plus about 19 km/s across the sky (proper motion 199 mas/yr at 20.4 pc).
- Pioneer 10 moves at 11.85 km/s (2.50 AU a year) relative to the Sun, toward RA 5.56h,
  Dec +26.2° (JPL Horizons, target −23, heliocentric ICRF vectors for 2026-09-30), 16.5° from
  Aldebaran on the sky.
- 54.3 / 11.85 = 4.6, so "over four times faster". Integrating both straight-line motions, the
  probe–star distance is smallest now (66.6 ly) and grows to about 220 ly after one million years
  and 380 ly after two. Even Aldebaran's *present* position would be passed about 19 ly wide, after
  1.6 million years.
- https://science.nasa.gov/mission/pioneer-10/: "generally heading in the direction of the red star
  Aldebaran"; "expected to pass by Aldebaran in about two million years" (the claim refuted here).
- https://en.wikipedia.org/wiki/Pioneer_10: words it carefully as "more than two million years to
  reach Aldebaran's present location"; heading for Taurus.
- https://ssd.jpl.nasa.gov/horizons/ (Pioneer 10, id −23): the state vector used above.

### about

**Vega**, α Lyrae (HR 7001). SIMBAD 18 36 56.34 +38 47 01.3 → "RA 18h 36m 56s · Dec +38° 47′
01″". V 0.03, B−V 0.00.
Distance: 25 light-years (Hipparcos 2007: 130.23 ± 0.36 mas = 25.04 ly).
Fact (unchanged): "In July 1850, at Harvard, it became the first star other than the Sun to be
photographed."
- https://hco.cfa.harvard.edu/about/ (Harvard College Observatory): "On the night of July 16-17,
  1850 Whipple and Bond made the first daguerreotype of a star (Vega)", with the 15-inch Great
  Refractor.
- https://www.astronomy.com/today-in-the-history-of-astronomy/july-16-1850-bond-and-whipple-photograph-vega/:
  same night and telescope; "the first photograph ever taken of a star (besides the Sun)".
- https://en.wikipedia.org/wiki/Vega: dates it 17 July 1850 (the early-morning half of the same
  night), William Bond and John Adams Whipple. Month, year and place agree everywhere.

**Deneb**, α Cygni (HR 7924). SIMBAD 20 41 25.92 +45 16 49.2 → "RA 20h 41m 26s · Dec +45° 16′
49″". V 1.25, B−V 0.09.
Distance: about 1,400–2,600 light-years. Hipparcos 2007 2.31 ± 0.32 mas = 1,410 ± 196 ly;
Schiller & Przybilla 2008 (Cygnus OB7 membership) 2,615 ± 215 ly.
Fact (unchanged): "Its name is Arabic for “tail”: it marks the swan’s tail. Few stars the eye can
see are as luminous."
- https://en.wikipedia.org/wiki/Deneb: "the Arabic word for 'tail', from the phrase ذنب الدجاجة
  Dhanab al-Dajājah, or 'tail of the hen'"; luminosity 55,000 L☉ at the near distance and
  196,000 L☉ at the far one; "rivals Rigel … as the most luminous first-magnitude star".
- https://earthsky.org/brightest-stars/deneb-among-the-farthest-stars-to-be-seen/: tail of the Swan;
  one of the most luminous stars visible to the eye.
- Check: "few" is deliberately soft. It holds at either distance (55,000–196,000 L☉): most
  naked-eye stars are under a thousand L☉, and only supergiants and the hottest O and B stars
  reach Deneb's range.

**Altair**, α Aquilae (HR 7557). SIMBAD 19 50 47.00 +08 52 05.96 → "RA 19h 50m 47s · Dec +08° 52′
06″". V 0.77, B−V 0.22.
Distance: 16.7 light-years (Hipparcos 2007: 194.95 ± 0.57 mas = 16.73 ly).
Fact (changed): "It spins in less than half a day, so fast that it is over 20% wider at the equator
than pole to pole." Was "It spins once in under eight hours, …". The period depends on the model:
- https://arxiv.org/abs/1912.03138 (Bouchaud et al. 2020, A&A 633, A78): 7 h 46 m, equatorial
  velocity about 314 km/s, R_eq 2.008 R☉, flattening 0.220 (R_eq/R_pole = 1.28). This is the
  source of Wikipedia's "under eight hours".
- https://arxiv.org/abs/0706.0867 (Monnier et al. 2007, Science 317, 342), Table 1: R_eq 2.029 and
  R_pole 1.634 R☉ (ratio 1.24), v sin i 240 km/s at inclination 57.2°, i.e. 286 km/s and a period
  of 8.6 h (9.0 h for their fixed-β model). The University of Michigan release
  (https://phys.org/news/2007-05-university-michigan-astronomers-capture-image.html) quotes the
  286 km/s (638,000 mph).
- https://arxiv.org/abs/astro-ph/0509236 (Peterson et al. 2006): 0.90 of break-up; secondary
  summaries quote about 0.4 day.
- https://www.irap.omp.eu/en/2020/01/finally-a-realistic-model-for-altair-a-star-with-extreme-rotation/:
  "its polar radius is 20% smaller than its equatorial radius".
- "Under eight hours" holds only for the 2020 model; "less than half a day" holds for all of them.
  "Over 20% wider" holds for all (1.22–1.28).

**Albireo**, β Cygni (HR 7417, β¹ Cyg, the bright gold component). SIMBAD 19 30 43.28 +27 57 34.8
→ "RA 19h 30m 43s · Dec +27° 57′ 35″". V 3.08, B−V 1.13.
Distance: about 400 light-years (kept). For A, Hipparcos gives 434 ± 20 ly and Gaia DR3
8.98 ± 0.45 mas = 363 ± 18 ly; for B, Hipparcos 401 ± 13 ly and Gaia DR3 8.19 ± 0.08 mas = 398 ± 4
ly. "About 400" is within about 10% of every value.
Fact (unchanged): "One star to the eye; a small telescope splits it into a gold star and a fainter
blue one."
- https://en.wikipedia.org/wiki/Albireo: A amber, V 3.1; B blue, V 5.1; 35″ apart; single to the
  naked eye, resolved by "even a low-magnification telescope"; not known whether a physical binary
  (the fact avoids calling them a pair).
- https://earthsky.org/brightest-stars/albireo-finest-double-star/: "one a lovely gold and the
  other a dimmer blue".
- SIMBAD positions of A and B: 34.6″ apart.

### index

**Polaris**, α Ursae Minoris (HR 424). SIMBAD 02 31 49.09 +89 15 50.8 → "RA 02h 31m 49s · Dec +89°
15′ 51″". V 2.02, B−V 0.60.
Distance: **about 445 light-years** (was "about 430"). Evans et al. 2024 adopt the Gaia DR3
distance of Polaris B, 136.90 ± 0.34 pc = 446.5 ± 1.1 ly, on the grounds (Bond et al. 2018) that
A and B are gravitationally bound. Hipparcos 2007 gave 433 ± 6 ly. Outliers remain (Turner et al. about 323 ly;
an HST parallax of B, Bond et al. 2018, about 520 ly).
Fact (unchanged): "The North Star, and a Cepheid variable: it pulses gently in brightness about every
four days."
- GCVS (VizieR B/gcvs): type DCEPS, period 3.9696 d.
- https://arxiv.org/abs/2407.09641 (Evans et al. 2024, ApJ 971, 190): "the nearest and brightest
  classical Cepheid", "with a small amplitude", pulsating in the first overtone.
- https://en.wikipedia.org/wiki/Polaris: amplitude fell below 0.05 mag after 1966 (hence "gently");
  0.66° from the pole in 2018.

**Mizar**, ζ Ursae Majoris (HR 5054, Mizar A). SIMBAD (ζ¹ UMa) 13 23 55.54 +54 55 31.3 → "RA 13h
23m 56s · Dec +54° 55′ 31″". V 2.27, B−V 0.02.
Distance: **about 83 light-years** ("about" added). Hipparcos 2007: 39.36 mas = 82.9 ly; Gaia DR3
gives 40.21 ± 0.46 mas (81.1 ly) for A and 40.28 mas for B; Alcor 39.91 mas (81.7 ly).
Fact (changed): "Look for faint Alcor right beside it: telling the two apart was a traditional test
of eyesight." Was "…seeing both was a traditional test of good eyesight." Arabic tradition calls
it a test of the sharpest eyes, but modern work finds it a test of normal vision ("a good test of
minimal vision"), so "good" overstated it.
- https://en.wikipedia.org/wiki/Mizar_and_Alcor: "often quoted as a test of eyesight", confirmed by
  modern experiment; "a good test of minimal vision"; "The Arabs and the ancient Persians used
  distinguishing Mizar and Alcor as a test of vision"; Alcor about 12′ away.
- https://earthsky.org/tonight/ancient-eye-test-relied-on-two-stars-in-big-dipper/: the ancient eye
  test.
- SIMBAD positions: Mizar A to Alcor 11.8′.

**Dubhe**, α Ursae Majoris (HR 4301). SIMBAD 11 03 43.67 +61 45 03.72 → "RA 11h 03m 44s · Dec +61°
45′ **04″**" (was 03″; BSC's +61 45 03 is truncated, not rounded). V 1.79, B−V 1.07.
Distance: **about 123 light-years** ("about" added; Hipparcos 2007: 26.54 ± 0.48 mas = 122.9 ±
2.2 ly).
Fact (changed wording): "One of the Pointers: extend the line from Merak through Dubhe about five times
its length to reach Polaris." Was "…a line from Merak through Dubhe, extended about five times,
leads to Polaris." The old wording did not say five times *what*.
- https://earthsky.org/brightest-stars/polaris-the-present-day-north-star/: "draw a line from Merak
  through Dubhe, and go about five times the Merak/Dubhe distance to Polaris."
- https://earthsky.org/tonight/use-the-pointers-to-find-polaris/: Dubhe and Merak are the Pointers.
- Computed from SIMBAD positions: Merak–Dubhe 5.37°, Dubhe–Polaris 28.71°, ratio 5.34; the
  extended line passes 1.9° from Polaris.

**Thuban**, α Draconis (HR 5291). SIMBAD 14 04 23.36 +64 22 33.1 → "RA 14h 04m 23s · Dec +64° 22′
33″". V 3.65, B−V −0.05.
Distance: **about 280 light-years** (was "300"). Thuban is an eclipsing binary with a 51-day orbit,
which upsets single-star parallaxes: Hipparcos 2007 gives 10.76 ± 0.17 mas (303 ly), Gaia DR2
12.18 mas (268 ly), Gaia DR3 12.52 mas (261 ly). The orbit itself gives a dynamical parallax of
11.48 ± 0.13 mas, 87.07 ± 1.03 pc = 284 ± 3 ly (Pavlovski et al. 2022), the most reliable value.
Fact (changed): "It was the pole star about 4,500 years ago, when the Egyptians built the pyramids
at Giza." Was "It was the pole star when the ancient Egyptians were building their pyramids." Thuban
was the naked-eye star nearest the pole from 3942 to 1793 BC, but royal pyramids were still being
built after that (late Middle Kingdom, and Ahmose I's at Abydos around 1525 BC), so "their pyramids"
in general overreached. The Giza pyramids (Fourth Dynasty, around 2550 BCE for Khufu's) fall well
inside Thuban's span, about 280 years after its closest approach, when it was still within about
2° of the pole.
- https://en.wikipedia.org/wiki/Thuban: nearest naked-eye star to the pole 3942–1793 BC; closest in
  2830 BC, under 10′ away; 303 ± 5 ly (Hipparcos).
- https://earthsky.org/brightest-stars/thuban-past-north-star/: "the Pole Star some 5,000 years ago,
  when the Egyptians were building the pyramids"; nearest the pole in 2787 BCE.
- https://giza.fas.harvard.edu/gizaintro/ (Harvard, Digital Giza): the Great Pyramid "Built by King
  Khufu … in the Fourth Dynasty … (around 2550 BCE)".
- https://arxiv.org/abs/2111.03887 (Pavlovski et al. 2022, A&A 658, A92): the dynamical parallax.
- https://en.wikipedia.org/wiki/Pyramid_of_Ahmose: Ahmose I (c. 1550–1525 BCE) built "the last
  royal pyramid to be built in Egypt", after Thuban's span ended.
- Rough precession check (general precession in longitude about a fixed ecliptic, proper motion
  ignored; it puts the closest approach near 2880 BC, close to the published 2830): the pole was
  about 1.5–2° from Thuban in 2550 BCE and about 6° away by 1800 BCE.

## Fact-check log (30 September 2026)

An independent pass re-derived every designation, coordinate string, distance and claim, trying
to refute each one. Results:

| star | designation | coords | distance | fact |
|---|---|---|---|---|
| Sirius | ok | ok | ok | ok |
| Betelgeuse | ok | ok | widened to 500–700 | cause made precise ("veiled mostly by dust from gas it threw off") |
| Rigel | ok | ok | 860 → 850–1,000 | ok |
| Aldebaran | ok | ok | ok | **wrong**: the probe never reaches or passes it; rewritten |
| Vega | ok | ok | ok | ok (16–17 July 1850, Harvard 15-inch) |
| Deneb | ok | ok | ok | ok |
| Altair | ok | ok | ok | period was model-specific; now "less than half a day" |
| Albireo | ok | ok | ok (kept "about 400") | ok |
| Polaris | ok | ok | 430 → 445 (Gaia DR3 via Polaris B) | ok (3.97 d) |
| Mizar | ok | ok | "about" added | "good eyesight" → "eyesight" |
| Dubhe | ok | Dec 03″ → 04″ | "about" added | "five times its length" |
| Thuban | ok | ok | 300 → about 280 (dynamical parallax) | narrowed to the Giza pyramids, about 4,500 years ago |

## Candidate facts not used

- The claim that Vega was "the pole star ~12,000 years ago" is loose. Wikipedia says that around
  12,000 BCE the pole was about 5° from Vega, so the 1850 photograph was used instead.
- "The Great Pyramid's descending passage pointed at Thuban" is a popular claim but disputed, so
  it was left out. The fact keeps only the pole-star timing.
- "Mizar was the first double star photographed (1857)" was not confirmed in the sources checked,
  so it was not used.
- Exact Thuban dates were not used because sources differ (2787 BCE on EarthSky, 2830 BC on
  Wikipedia).
- Aldebaran "looks like part of the Hyades but is less than half as far away" (Hyades about 150 ly)
  is true and was the fallback if the corrected Pioneer 10 line had not fitted.
- Altair "spins at 286 km/s" / "314 km/s" was not used: the equatorial speed is as model-dependent
  as the period.
- Deneb "the most distant of the 30 brightest stars" was not used: it depends on which distances
  are adopted for Deneb and Alnilam.
