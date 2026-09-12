"""Validate this static export without a package installation."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re

ROOT = Path(__file__).resolve().parents[1]
class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.paths=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        for key in ('src','srcset','poster','data-src','data-mobile-src','data-shot'):
            value=attrs.get(key,'')
            if key=='srcset':
                self.paths += [candidate.strip().split()[0] for candidate in value.split(',') if candidate.strip().startswith('/')]
            elif value.startswith('/'):self.paths.append(value)
        if tag=='link' and attrs.get('href','').startswith('/'):
            self.paths.append(attrs['href'])

paths=[]
for name in ('index.html','index/index.html'):
    parser=Assets();parser.feed((ROOT/name).read_text());paths+=parser.paths
for name in ('nm-home-content.js','nm-brands.js'):
    source=(ROOT/'js'/name).read_text()
    content=json.loads(re.search(r'var HTML = (".*?");',source)[1])
    parser=Assets();parser.feed(content);paths+=parser.paths
for name in ('nm-run.js','nm-run-game.mjs','nm-run-motion.mjs'):
    paths+=re.findall(r'''[\"'](/(?:media|js|css)/[^\"']+)[\"']''',(ROOT/'js'/name).read_text())
    paths+=['/js/'+path[2:] for path in re.findall(r'''from\s+[\"'](\./[^\"']+)[\"']''',(ROOT/'js'/name).read_text())]
for css in (ROOT/'css').glob('*.css'):
    paths+=re.findall(r'url\([\'\"]?(/[^)\'\"]+)',css.read_text())
# Every archive thumbnail must have its full-size lightbox counterpart.
paths += [p.replace('/media/nm-thumb/','/media/nm-work/') for p in paths if p.startswith('/media/nm-thumb/')]
missing=sorted({p for p in paths if not (ROOT/unquote(urlsplit(p).path).lstrip('/')).is_file()})
assert not missing, 'Missing assets: '+repr(missing)

home=(ROOT/'index.html').read_text()
for block in re.findall(r'<script>(.*?)</script>',home,re.S):
    if block.startswith('self.__next_f.push(') and 'homeWorldwideTitle' in block:
        record=json.loads(block[len('self.__next_f.push('):-1])[1]
        assert record.endswith('\n'), 'Flight records require their newline delimiter'
        data=json.loads(record.split(':',1)[1])
        server_header=re.search(r'<header.*?</header>',home,re.S)[0]
        assert 'href="/index/"' in server_header, 'Index must render before hydration'
        mobile_menu=re.search(r'id="mobile-menu".*?</div>',home,re.S)[0]
        assert 'href="/index/"' in mobile_menu, 'Both exported menus must match the shared navigation payload'
        nav=data[0][3]['navigation']['headerNavigation']
        assert [item['url'] for item in nav] == ['#work','/index/','#about','#contact']
        assert 'opacity:0' not in server_header, 'Header must be visible on first paint'
        copy=data[0][3]['homepage']['homeWorldwideTitle']
        assert copy in home, 'Server and client About copy must match'
        assert "I</span><span> </span><span>turn" in copy
        break
else:raise AssertionError('Missing Flight homepage data')
assert 'project-list-panel' not in home.split('self.__next_f.push')[0]
assert 'data-nm-grid-anchor' in home
assert 'data-nm-mask-gate' in home, 'Only the new homepage opts into the mask readiness gate'
assert 'HYDRATION_DETAIL' not in ''.join(p.read_text() for p in (ROOT/'_next/static/chunks').glob('*.js'))
print(f'PASS: {len(set(paths))} local asset references; About HTML/Flight consistency; no debug instrumentation.')
