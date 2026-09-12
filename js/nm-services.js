/* One preview on desktop; independently expandable service panels on phones. */
(window.__nmReady || function (fn) { fn(); })(function () {
  var section = document.getElementById('nm-services');
  if (!section || section.dataset.enhanced) return;
  section.dataset.enhanced = 'true';

  var items = Array.from(section.querySelectorAll('.nm-svc-item'));
  var buttons = items.map(function (item) { return item.querySelector('button'); });
  var panels = items.map(function (item) { return item.querySelector('.nm-svc-panel'); });
  var desktop = matchMedia('(min-width:901px)');
  var expanded = new Set([0]);
  var selected = 0;
  var near = false;
  var pointerX = null, pointerY = null;

  function load(panel) {
    var img = panel.querySelector('img');
    if (img) img.loading = 'eager';
  }

  function render() {
    items.forEach(function (item, index) {
      var open = desktop.matches ? index === selected : expanded.has(index);
      item.classList.toggle('is-open', open);
      buttons[index].setAttribute('aria-expanded', String(open));
      panels[index].setAttribute('aria-hidden', String(!open));
      if (open && near) load(panels[index]);
    });
  }

  function select(index) {
    if (selected === index) return;
    selected = index;
    load(panels[index]);
    render();
  }

  buttons.forEach(function (button, index) {
    button.addEventListener('pointermove', function (event) {
      if (!desktop.matches || event.pointerType !== 'mouse') return;
      // Expanding copy can move another heading beneath a stationary cursor.
      // Only actual pointer movement should choose another service.
      if (event.clientX === pointerX && event.clientY === pointerY) return;
      pointerX = event.clientX; pointerY = event.clientY;
      select(index);
    });
    button.addEventListener('focus', function () {
      if (desktop.matches) select(index);
    });
    button.addEventListener('click', function () {
      if (desktop.matches) {
        select(index);
      } else {
        selected = index;
        if (expanded.has(index)) expanded.delete(index);
        else expanded.add(index);
        load(panels[index]);
        render();
      }
    });
    button.addEventListener('keydown', function (event) {
      var target;
      if (event.key === 'ArrowDown') target = (index + 1) % buttons.length;
      else if (event.key === 'ArrowUp') target = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target].focus();
    });
  });

  // Warm the six responsive images only as this section approaches.
  // Phone visitors load the panels they open, rather than the whole showcase.
  function warm() {
    near = true;
    if (desktop.matches) panels.forEach(load);
    else expanded.forEach(function (index) { load(panels[index]); });
  }
  desktop.addEventListener('change', function () {
    if (!desktop.matches) expanded = new Set([selected]);
    render();
    if (near) warm();
  });
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        warm();
        observer.disconnect();
      }
    }, {rootMargin:'900px 0px'});
    observer.observe(section);
  }
  render();
});
