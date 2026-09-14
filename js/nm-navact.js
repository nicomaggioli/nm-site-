(window.__nmReady || function (fn) { fn(); })(function () {
  // Contact still uses the exported button. Old cached homepages can also
  // render About as a button; current HTML and hydration data use a real link.
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('header[data-nm-header] nav ul li button');
    if (!button) return;
    var label = (button.textContent || '').trim().toLowerCase();
    if (label !== 'contact' && label !== 'about') return;
    event.preventDefault();
    event.stopPropagation();
    window.location.href = label === 'about' ? '/about/' : 'mailto:nicomaggioli@gmail.com';
  }, true);
});
