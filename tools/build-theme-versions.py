#!/usr/bin/env python3
"""Refresh the Night Sky content versions (first 10 hex of SHA-256, the site's ?v= convention).

Rewrites the VERSIONS map in js/nm-theme.js from the files it loads, then the ?v= of
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
    loader = ROOT / 'js/nm-theme.js'
    text = loader.read_text()
    text, count = re.subn(r"'(/js/[\w.-]+\.js)': '[0-9a-f]{10}'",
                          lambda m: f"'{m[1]}': '{version(m[1])}'", text)
    assert count, 'no VERSIONS entries found in js/nm-theme.js'
    loader.write_text(text)
    for page in PAGES:
        path = ROOT / page
        html = path.read_text()
        for asset in ('/js/nm-theme.js', '/css/theme-stars.css'):
            html, n = re.subn(re.escape(asset) + r'\?v=[0-9a-z]+', f'{asset}?v={version(asset)}', html)
            assert n == 1, f'{page}: expected one {asset} reference, found {n}'
        path.write_text(html)
    print(f'Night Sky versions refreshed: {count} scripts in js/nm-theme.js, {len(PAGES)} pages.')


if __name__ == '__main__':
    main()
