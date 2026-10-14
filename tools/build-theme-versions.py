#!/usr/bin/env python3
"""Refresh the Night Sky content versions (first 10 hex of SHA-256, the site's ?v= convention).

In order: the Space Run door that js/nm-sky.js loads on Index (RUN_SRC, js/nm-run.js), the
VERSIONS (scripts) and DATA (star data, media/sky/*.json) maps in js/nm-theme.js, then the ?v= of
js/nm-theme.js and css/theme-stars.css in the three pages. Run after changing any of them;
tests/theme.test.cjs fails while a version is stale.
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ['index.html', 'about/index.html', 'index/index.html']


def version(path):
    return hashlib.sha256((ROOT / path.lstrip('/')).read_bytes()).hexdigest()[:10]


def main():
    # the door script nm-sky.js loads (before nm-sky.js's own version is taken)
    sky = ROOT / 'js/nm-sky.js'
    text, n = re.subn(r"'/js/nm-run\.js\?v=[0-9a-f]{10}'", f"'/js/nm-run.js?v={version('/js/nm-run.js')}'", sky.read_text())
    assert n == 1, f'expected one versioned /js/nm-run.js in js/nm-sky.js, found {n}'
    sky.write_text(text)

    loader = ROOT / 'js/nm-theme.js'
    text = loader.read_text()
    text, count = re.subn(r"'(/js/[\w.-]+\.js)': '[0-9a-f]{10}'",
                          lambda m: f"'{m[1]}': '{version(m[1])}'", text)
    assert count, 'no VERSIONS entries found in js/nm-theme.js'
    text, data = re.subn(r"'(/media/sky/[\w.-]+\.json)': '[0-9a-f]{10}'",
                         lambda m: f"'{m[1]}': '{version(m[1])}'", text)
    assert data, 'no DATA entries found in js/nm-theme.js'
    loader.write_text(text)
    for page in PAGES:
        path = ROOT / page
        html = path.read_text()
        for asset in ('/js/nm-theme.js', '/css/theme-stars.css'):
            html, n = re.subn(re.escape(asset) + r'\?v=[0-9a-z]+', f'{asset}?v={version(asset)}', html)
            assert n == 1, f'{page}: expected one {asset} reference, found {n}'
        path.write_text(html)
    print(f'Night Sky versions refreshed: the door in js/nm-sky.js, {count} scripts and {data} data files '
          f'in js/nm-theme.js, {len(PAGES)} pages.')


if __name__ == '__main__':
    main()
