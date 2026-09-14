"""Generate the no-JavaScript home view from the same authored content."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
import re,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
def authored(name):return json.loads(re.search(r'var HTML = (".*?");',(ROOT/'js'/name).read_text())[1])
class Content(HTMLParser):
    def __init__(self):super().__init__();self.text=[];self.images=[];self.links=[];self.capture=None;self.site=None
    def handle_starttag(self,tag,attrs):
        d=dict(attrs);cls=d.get('class','')
        if tag=='img' and d.get('alt'):self.images.append(d)
        if tag=='a' and cls=='nm-site':self.site=d['href']
        if cls in ('nm-svc-title','nm-svc-copy','nm-site-name'):
            self.capture=[tag,cls,[]]
    def handle_data(self,data):
        if self.capture:self.capture[2].append(data)
    def handle_endtag(self,tag):
        if self.capture and tag==self.capture[0]:
            _,cls,data=self.capture;value=''.join(data)
            if cls=='nm-site-name':self.links.append((self.site,value))
            else:self.text.append(value)
            self.capture=None
brands=Content();brands.feed(authored('nm-brands.js'))
services=''.join('<li><h3>'+escape(brands.text[i])+'</h3><p>'+escape(brands.text[i+1])+'</p></li>' for i in range(0,len(brands.text),2))
images=[];seen=set()
for img in brands.images:
    if not img['src'].startswith(('/media/nm-', '/media/services/')):continue
    if img['src'] in seen:continue
    seen.add(img['src'])
    attrs={k:img[k] for k in ('src','srcset','alt','width','height') if k in img}
    attrs['sizes']='(max-width:600px) 50vw, 33.333vw'
    attrs.update(loading='lazy',decoding='async')
    images.append('<a href="/index/"><img '+' '.join(k+'="'+escape(v,quote=True)+'"' for k,v in attrs.items())+'></a>')
    if len(images)==6:break
assert len(images)==6, 'Expected six service images for selected work'
sites=''.join('<li><a href="'+escape(url,quote=True)+'" target="_blank" rel="noopener noreferrer">'+escape(name)+' ↗</a></li>' for url,name in brands.links)
css_version=hashlib.sha256((ROOT/'css/nm-nojs.css').read_bytes()).hexdigest()[:10]
html='''<noscript id="nm-home-fallback">
<link rel="stylesheet" href="/css/nm-nojs.css?v='''+css_version+'''">
<div class="nm-nojs">
<header><a class="nm-nojs-brand" href="/">Nico Maggioli</a><nav aria-label="Main navigation"><a href="/index/">Index</a><a href="/about/">About</a><a href="mailto:nicomaggioli@gmail.com">Contact</a></nav></header>
<main><h1>Nico Maggioli — design &amp; manufacturing</h1><p class="nm-nojs-lead">I turn ideas into brands and products, shaping how they look, how they work, and how they’re made.</p><p>Based in Boston. Available worldwide.</p>
<section id="work" aria-labelledby="nm-nojs-work"><h2 id="nm-nojs-work">Selected work</h2><div class="nm-nojs-work">'''+''.join(images)+'''</div><a href="/index/">View all work ↗</a></section>
<section id="nm-services" aria-labelledby="nm-nojs-services"><h2 id="nm-nojs-services">Services</h2><ul class="nm-nojs-services">'''+services+'''</ul></section>
<section aria-labelledby="nm-nojs-sites"><h2 id="nm-nojs-sites">Live sites I’ve built</h2><ul class="nm-nojs-sites">'''+sites+'''</ul></section></main>
<footer id="contact"><h2>Where visions come true.</h2><a href="mailto:nicomaggioli@gmail.com">Work with me ↗</a><p>© Nico Maggioli 2026</p></footer>
</div></noscript>'''
p=ROOT/'index.html';s=p.read_text()
s=re.sub(r'<noscript id="nm-home-fallback">.*?</noscript>\n?','',s,flags=re.S)
before,close,after=s.rpartition('</body>')
assert close, 'Missing document body'
s=before+html+'\n'+close+after
s=s.replace('href="/textures/nm-mark-sdf.png" fetchpriority="high"','href="/textures/nm-mark-sdf.png" crossorigin="anonymous" fetchpriority="high"')
p.write_text(s)
print('Built accessible no-JavaScript homepage from current services and work.')
