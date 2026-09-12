(window.__nmReady || function (fn) { fn(); })(function () {
  'use strict';
  var touch = matchMedia('(hover:none), (pointer:coarse), (max-width:767.98px)');
  var entries = [];
  document.querySelectorAll('#nm-sites .nm-site[data-shot]').forEach(function (link, index) {
    if (link.parentElement.classList.contains('nm-site-entry')) return;
    var name = link.querySelector('.nm-site-name').textContent.trim();
    var entry = document.createElement('div');
    entry.className = 'nm-site-entry';
    link.before(entry); entry.appendChild(link);
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'nm-site-preview-toggle';
    button.textContent = 'Preview +';
    button.setAttribute('aria-label', 'Preview ' + name);
    button.setAttribute('aria-expanded', 'false');
    var panel = document.createElement('div');
    panel.className = 'nm-site-inline-preview'; panel.id = 'nm-site-preview-' + index;
    panel.hidden = true;
    button.setAttribute('aria-controls', panel.id);
    entry.appendChild(button); entry.appendChild(panel);
    function close() { panel.hidden = true; button.textContent = 'Preview +'; button.setAttribute('aria-expanded', 'false'); }
    button.addEventListener('click', function () {
      if (!touch.matches) return;
      if (!panel.hidden) { close(); return; }
      if (!panel.firstChild) {
        var image = new Image(); image.alt = name + ' website preview';
        image.width = 640; image.height = 400; image.decoding = 'async';
        image.src = link.getAttribute('data-shot'); panel.appendChild(image);
      }
      panel.hidden = false; button.textContent = 'Hide −'; button.setAttribute('aria-expanded', 'true');
    });
    entries.push(close);
  });
  touch.addEventListener('change', function () {
    if (!touch.matches) entries.forEach(function (close) { close(); });
  });
});
