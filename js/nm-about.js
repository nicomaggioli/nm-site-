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

  apply();
  /* re-applied after every React re-render -- see js/nm-sync.js */
  if (window.__nmSync) window.__nmSync(apply);
  else {
    document.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('load', apply);
  }
})();
