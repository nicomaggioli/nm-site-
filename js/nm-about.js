/* ── the about copy ───────────────────────────────────────────────────────
   The statement in #about is React-rendered from the RSC flight payload, and
   the payload cannot be edited by hand -- text has to match byte for byte in
   both the streamed HTML and the payload or hydration tears the tree down,
   and this copy is three times longer than what it replaces, so there is no
   equal-length substitution available. Rewriting it at runtime sidesteps the
   payload entirely.

   The build splits the line into one <span> per word with a <span> </span>
   between each, which is what its justification and any per-word animation
   hang off, so this rebuilds that exact shape rather than dropping in a flat
   string.

   Idempotent by comparing text rather than by tagging the node: React
   replaces this subtree on re-render, and a data- flag would be lost with it
   while the old copy came back. Comparing content means a replaced node is
   rewritten and an untouched one is left alone. */
(function () {
  /* Straight apostrophe, not a curly one -- the rest of the site's copy uses
     straight ("I don't", "it's", "I've") and a lone typographic quote here
     would sit differently in Geist. */
  var TEXT =
    "I make what I can't find. Positioning, identity, packaging, web. " +
    'Make it real and make it make sense.';

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function apply() {
    var about = document.getElementById('about');
    if (!about) return;
    var p = about.querySelector('.text-heading-xl p');
    if (!p) return;
    if (norm(p.textContent) === TEXT) return;      /* already ours */

    var words = TEXT.split(' '), html = '', i;
    for (i = 0; i < words.length; i++) {
      html += '<span>' + esc(words[i]) + '</span>';
      if (i < words.length - 1) html += '<span> </span>';
    }
    p.innerHTML = html;
  }

  /* The page had no <h1> at all, and its three section titles are styled by
     class rather than marked up as headings, so a screen-reader rotor showed
     an empty heading list for the whole site. The titles are now <h2> (class
     styling, so nothing moved); this supplies the <h1> they sit under.

     Visually hidden, because the design's own top-level statement is the
     wordmark and the masked NM logo -- there is no place for a visible page
     title without changing the design. */
  function heading() {
    if (document.querySelector('h1')) return;
    var m = document.querySelector('main');
    if (!m) return;
    var h = document.createElement('h1');
    h.textContent = 'Nico Maggioli — brand design, product design and manufacturing';
    h.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;' +
                      'padding:0;overflow:hidden;clip:rect(0 0 0 0);' +
                      'clip-path:inset(50%);white-space:nowrap;border:0';
    m.insertBefore(h, m.firstChild);
  }

  function run() { apply(); heading(); }

  run();
  /* re-applied after every React re-render -- see js/nm-sync.js */
  if (window.__nmSync) window.__nmSync(run);
  else {
    document.addEventListener('DOMContentLoaded', run);
    window.addEventListener('load', run);
  }
})();
