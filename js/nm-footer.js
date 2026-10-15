/* Static-page footer: the email copy action. Under Night Sky (the site's only design) the footer's NM
   is a constellation drawn by js/nm-sky.js; the WebGL point cloud this file used to draw there (it
   returned before drawing under Night Sky) is in git history before "Night Sky: drop the dead footer
   cloud code on Index and About". */
(function () {
  'use strict';
  var host = document.querySelector('[data-nm-footer]');
  if (!host) return;
  var email = host.querySelector('.nm-footer-email'), copyTimer;
  email.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText('nicomaggioli@gmail.com');
      email.classList.add('is-copied');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { email.classList.remove('is-copied'); }, 1800);
    } catch (_) { location.href = 'mailto:nicomaggioli@gmail.com'; }
  });
})();
