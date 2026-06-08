/* Shared site footer: colophon-style masthead + cursor-reactive metaball blob.
   Self-contained — injects styles, SVG goo filter, markup, animation.
   Wire in with: <script src="footer.js" defer></script> */
(function () {
    if (document.querySelector('.site-footer')) return;

    var MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
    var SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    var css = [
        '.site-footer{position:relative;width:100%;background:#060606;overflow:hidden;font-family:' + SANS + ';border-top:1px solid rgba(255,255,255,.08);color:#fff}',
        '.site-footer-blob{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;filter:url(#footer-goo);-webkit-filter:url(#footer-goo);pointer-events:none;opacity:.95}',
        '.site-footer-inner{position:relative;z-index:1;width:100%;padding:120px 30px 36px;display:flex;flex-direction:column;gap:88px}',

        '.site-footer-mark{display:flex;flex-direction:column;gap:18px;max-width:780px}',
        '.site-footer-eye{font-family:' + MONO + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.35);display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}',
        '.site-footer-name-stack{position:relative;display:inline-block}',
        '.site-footer-name{font-size:clamp(56px,11vw,148px);font-weight:600;letter-spacing:-.045em;line-height:.92;margin:0 0 -.22em;padding:0 0 .22em;font-feature-settings:"ss01";background:linear-gradient(135deg,#FF8C28 0%,#FF7820 50%,#FF6418 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}',
        '.site-footer-name-mask{position:absolute;top:0;left:0;right:0;background:none;-webkit-text-fill-color:#fff;color:#fff;pointer-events:none;-webkit-mask-image:url(#footer-blob-mask);mask-image:url(#footer-blob-mask)}',
        '.site-footer-tag{font-size:clamp(16px,1.4vw,19px);line-height:1.45;color:rgba(255,255,255,.62);max-width:520px;margin-top:8px}',

        '.site-footer-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:48px;border-top:1px solid rgba(255,255,255,.08);padding-top:42px}',
        '.site-footer-col h4{font-family:' + MONO + ';font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin:0 0 18px;font-weight:500}',
        '.site-footer-col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}',
        '.site-footer-col a,.site-footer-col li{font-size:16px;color:rgba(255,255,255,.86);text-decoration:none;letter-spacing:-.005em;display:inline-flex;align-items:baseline;gap:8px;transition:color .18s ease}',
        '.site-footer-col a .arr{font-family:' + MONO + ';font-size:13px;color:rgba(255,255,255,.32);transition:transform .22s ease,color .18s ease;display:inline-block}',
        '.site-footer-col a:hover{color:#fff}',
        '.site-footer-col a:hover .arr{color:#fff;transform:translate(3px,-3px)}',
        '.site-footer-col li.dim{color:rgba(255,255,255,.5)}',
        '.site-footer-pills{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px}',
        '.site-footer-pills a{display:inline-flex;align-items:center;gap:9px;padding:11px 18px;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#fff;text-decoration:none;font-size:13.5px;font-weight:600;letter-spacing:-.005em;background:rgba(8,8,8,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:transform .18s ease,background .22s ease,border-color .22s ease,color .22s ease}',
        '.site-footer-pills a:hover{background:linear-gradient(135deg,#FF8C28 0%,#FF7820 50%,#FF6418 100%);color:#000;border-color:#FF6418;transform:translateY(-2px)}',
        '.site-footer-pills svg{width:16px;height:16px;display:block}',

        '.site-footer-rule{display:flex;justify-content:space-between;align-items:baseline;gap:24px;padding-top:28px;border-top:1px solid rgba(255,255,255,.08);font-family:' + MONO + ';font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.4);flex-wrap:wrap}',
        '.site-footer-rule .right{color:rgba(255,255,255,.55)}',

        '@media (max-width:780px){.site-footer-inner{padding:80px 18px 28px;gap:60px}.site-footer-cols{grid-template-columns:1fr 1fr;gap:36px 28px}.site-footer-mark{gap:14px}.site-footer-blob{display:none}.site-footer-name-mask{display:none}}',
        '@media (max-width:480px){.site-footer-cols{grid-template-columns:1fr;gap:32px}}'
    ].join('');

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    if (!document.getElementById('footer-goo')) {
        var svgWrap = document.createElement('div');
        svgWrap.setAttribute('aria-hidden', 'true');
        svgWrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        var fCircles = '';
        for (var fi = 0; fi < 10; fi++) {
            fCircles += '<circle class="fbm" cx="0" cy="0" r="0" fill="url(#footer-blob-grad)"/>';
        }
        svgWrap.innerHTML =
            '<svg width="0" height="0"><defs>' +
                '<filter id="footer-goo">' +
                    '<feGaussianBlur in="SourceGraphic" stdDeviation="14"/>' +
                    '<feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -12"/>' +
                '</filter>' +
                '<radialGradient id="footer-blob-grad">' +
                    '<stop offset="0%"   stop-color="white" stop-opacity="1"/>' +
                    '<stop offset="55%"  stop-color="white" stop-opacity="0.85"/>' +
                    '<stop offset="100%" stop-color="white" stop-opacity="0"/>' +
                '</radialGradient>' +
                '<mask id="footer-blob-mask">' +
                    '<g filter="url(#footer-goo)">' + fCircles + '</g>' +
                '</mask>' +
            '</defs></svg>';
        document.body.appendChild(svgWrap);
    }

    var IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>';
    var LI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="7" y1="10" x2="7" y2="17"/><circle cx="7" cy="6.6" r="1.1" fill="currentColor" stroke="none"/><path d="M11 17v-4a2.5 2.5 0 0 1 5 0v4"/><line x1="11" y1="10" x2="11" y2="17"/></svg>';
    var ML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7L22 6"/></svg>';

    var year = new Date().getFullYear();
    var footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML =
        '<canvas class="site-footer-blob" aria-hidden="true"></canvas>' +
        '<div class="site-footer-inner">' +
            '<div class="site-footer-mark">' +
                '<div class="site-footer-eye"><span>NM // Footer</span></div>' +
                '<div class="site-footer-name-stack">' +
                    '<h2 class="site-footer-name">Nico<br>Maggioli</h2>' +
                    '<h2 class="site-footer-name site-footer-name-mask" aria-hidden="true">Nico<br>Maggioli</h2>' +
                '</div>' +
                '<p class="site-footer-tag">Brand &amp; product developer. Strategy, identity, and manufacturing in one head. The idea you start with<br>is the idea that ships.</p>' +
            '</div>' +
            '<div class="site-footer-cols">' +
                '<div class="site-footer-col">' +
                    '<h4>Channels</h4>' +
                    '<nav class="site-footer-pills">' +
                        '<a href="https://www.instagram.com/nico.maggioli/" target="_blank" rel="noopener noreferrer">' + IG + 'Instagram</a>' +
                        '<a href="https://www.linkedin.com/in/nicomaggioli" target="_blank" rel="noopener noreferrer">' + LI + 'LinkedIn</a>' +
                        '<a href="mailto:theairavi@gmail.com">' + ML + 'Email</a>' +
                    '</nav>' +
                '</div>' +
                '<div class="site-footer-col">' +
                    '<h4>Studio</h4>' +
                    '<ul>' +
                        '<li>Boston, MA</li>' +
                        '<li>Factories: IT · CN · IN · PK · US</li>' +
                        '<li class="dim">Booking 2026 projects</li>' +
                    '</ul>' +
                '</div>' +
                '<div class="site-footer-col">' +
                    '<h4>Index</h4>' +
                    '<ul>' +
                        '<li><a href="#home">Home <span class="arr">→</span></a></li>' +
                        '<li><a href="#about">About <span class="arr">→</span></a></li>' +
                        '<li><a href="#index">Work <span class="arr">→</span></a></li>' +
                        '<li><a href="#contact">Contact <span class="arr">→</span></a></li>' +
                    '</ul>' +
                '</div>' +
            '</div>' +
            '<div class="site-footer-rule">' +
                '<span>© ' + year + ' / Nico Maggioli</span>' +
                '<span class="right">Make it real. Make it make sense.</span>' +
            '</div>' +
        '</div>';
    document.body.appendChild(footer);

    startBlob(footer);

    function startBlob(host) {
        var c = host.querySelector('.site-footer-blob');
        var ctx = c.getContext('2d');
        var DPR = Math.min(window.devicePixelRatio || 1, 2);
        var W = 0, H = 0;

        function resize() {
            var r = host.getBoundingClientRect();
            c.width = Math.max(1, Math.floor(r.width * DPR));
            c.height = Math.max(1, Math.floor(r.height * DPR));
            c.style.width = r.width + 'px';
            c.style.height = r.height + 'px';
            W = c.width; H = c.height;
        }
        resize();
        addEventListener('resize', resize);

        var nameMask = host.querySelector('.site-footer-name-mask');
        var maskCircles = document.querySelectorAll('#footer-blob-mask .fbm');
        var mOffX = 0, mOffY = 0;
        function measureMask() {
            if (!nameMask) return;
            var mr = nameMask.getBoundingClientRect();
            var hr = host.getBoundingClientRect();
            mOffX = mr.left - hr.left;
            mOffY = mr.top - hr.top;
        }
        measureMask();
        addEventListener('resize', measureMask);

        var cursor = { x: W * 0.5, y: H * 0.7, active: false };
        host.addEventListener('pointermove', function (e) {
            var r = host.getBoundingClientRect();
            cursor.x = (e.clientX - r.left) * DPR;
            cursor.y = (e.clientY - r.top) * DPR;
            cursor.active = true;
        });
        host.addEventListener('pointerleave', function () { cursor.active = false; });

        var leader = { x: W * 0.5, y: H * 0.7, r: 170 * DPR };
        var sats = Array.from({ length: 9 }, function () {
            return {
                x: Math.random() * W, y: Math.random() * H,
                vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
                r: (70 + Math.random() * 85) * DPR,
                phase: Math.random() * Math.PI * 2
            };
        });

        function blob(b, alpha) {
            var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            g.addColorStop(0, 'rgba(255,140,40,' + alpha + ')');
            g.addColorStop(0.55, 'rgba(255,120,28,' + (alpha * 0.85) + ')');
            g.addColorStop(1, 'rgba(255,100,18,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        }

        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var t = 0;
        function tick() {
            ctx.clearRect(0, 0, W, H);
            t += 0.011;
            var tx = cursor.active ? cursor.x : W * 0.5 + Math.sin(t * 0.4) * W * 0.34;
            var ty = cursor.active ? cursor.y : H * 0.65 + Math.cos(t * 0.55) * H * 0.22;
            leader.x += (tx - leader.x) * (cursor.active ? 0.13 : 0.04);
            leader.y += (ty - leader.y) * (cursor.active ? 0.13 : 0.04);
            for (var i = 0; i < sats.length; i++) {
                var s = sats[i];
                var dx = leader.x - s.x, dy = leader.y - s.y;
                var d = Math.hypot(dx, dy) || 1, pull = 0.0011;
                s.vx += dx * pull + (-dy / d) * 0.22 * Math.sin(t + s.phase);
                s.vy += dy * pull + (dx / d) * 0.22 * Math.sin(t + s.phase);
                s.vx *= 0.93; s.vy *= 0.93;
                s.x += s.vx; s.y += s.vy;
                if (s.x < s.r * 0.3) { s.x = s.r * 0.3; s.vx *= -0.6; }
                if (s.x > W - s.r * 0.3) { s.x = W - s.r * 0.3; s.vx *= -0.6; }
                if (s.y < s.r * 0.3) { s.y = s.r * 0.3; s.vy *= -0.6; }
                if (s.y > H - s.r * 0.3) { s.y = H - s.r * 0.3; s.vy *= -0.6; }
                blob(s, 1);
            }
            blob(leader, 1);

            if (maskCircles.length) {
                var setC = function (cc, b) {
                    cc.setAttribute('cx', (b.x / DPR) - mOffX);
                    cc.setAttribute('cy', (b.y / DPR) - mOffY);
                    cc.setAttribute('r',  b.r / DPR);
                };
                setC(maskCircles[0], leader);
                for (var k = 0; k < sats.length; k++) setC(maskCircles[k + 1], sats[k]);
            }

            if (!reduce) requestAnimationFrame(tick);
        }
        tick();
    }
})();
