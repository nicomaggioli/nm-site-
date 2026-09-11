/* Copy is rendered consistently by the HTML and Flight payload. Only the
   visually hidden document heading is supplied by this extension. */
(window.__nmReady || function (fn) { fn(); })(function () {
  if (document.querySelector('h1')) return;
  var main = document.querySelector('main');
  if (!main) return;
  var heading = document.createElement('h1');
  heading.textContent = 'Nico Maggioli — brand design, product design and manufacturing';
  heading.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0';
  main.prepend(heading);
});
