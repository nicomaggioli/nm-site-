"""Check public crawl metadata and Next hydration agree without network access."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import json,re,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://nicomaggioli.com'
ROUTES={'/':'index.html','/index/':'index/index.html','/about/':'about/index.html'}
class Head(HTMLParser):
    def __init__(self):super().__init__();self.tags=[];self.title='';self.in_title=False;self.schema=None;self.in_schema=False
    def handle_starttag(self,t,a):
        d=dict(a);self.tags.append((t,d))
        if t=='title':self.in_title=True
        if t=='script' and d.get('type')=='application/ld+json':self.in_schema=True
    def handle_data(self,s):
        if self.in_title:self.title+=s
        if self.in_schema:self.schema=json.loads(s)
    def handle_endtag(self,t):
        if t=='title':self.in_title=False
        if t=='script':self.in_schema=False
    def meta(self,key):return [d['content'] for t,d in self.tags if t=='meta' and (d.get('name')==key or d.get('property')==key)]

titles=set();descriptions=set()
for route,filename in ROUTES.items():
    text=(ROOT/filename).read_text();head=Head();head.feed(text.split('</head>')[0])
    assert len([1 for t,d in head.tags if t=='title'])==1,route
    titles.add(head.title)
    canonical=[d['href'] for t,d in head.tags if t=='link' and d.get('rel')=='canonical']
    assert canonical==[ORIGIN+route],(route,canonical)
    desc=head.meta('description');assert len(desc)==1 and 80<len(desc[0])<200,(route,desc)
    descriptions.update(desc)
    assert head.meta('og:title')==head.meta('twitter:title')==[head.title]
    assert head.meta('og:description')==head.meta('twitter:description')==desc
    assert head.meta('og:url')==canonical
    assert head.meta('twitter:card')==['summary_large_image']
    assert head.meta('og:image')==head.meta('twitter:image')
    image=head.meta('og:image')[0];assert image.startswith(ORIGIN+'/')
    assert (ROOT/urlsplit(image).path.lstrip('/')).is_file(),image
    assert head.meta('og:image:alt')==head.meta('twitter:image:alt') and head.meta('og:image:alt')[0]
    assert 'noindex' not in ','.join(head.meta('robots'))
    graph=head.schema;assert graph['@context']=='https://schema.org'
    nodes={x['@id']:x for x in graph['@graph']}
    assert nodes[ORIGIN+'/#person']['name']=='Nico Maggioli'
    assert 'image' not in nodes[ORIGIN+'/#person'],'A product photo must not be labelled a person portrait'
    page=nodes[ORIGIN+route+'#webpage'];assert page['url']==canonical[0]
    if route=='/about/':
        assert page['@type']=='ProfilePage' and page['mainEntity']['@id']==ORIGIN+'/#person'
        assert 'download=' not in text and 'résumé' not in text
    if route=='/':
        assert len(page['mainEntity'])==6
        assert 'id="nm-home-fallback"' in text
        records={}
        for b in re.findall(r'<script>(.*?)</script>',text,re.S):
            if not b.startswith('self.__next_f.push('):continue
            p=json.loads(b[len('self.__next_f.push('):-1])
            if len(p)<2 or not isinstance(p[1],str) or ':' not in p[1]:continue
            k,s=p[1].split(':',1)
            if k in ('f','7','2'):records[k]=json.loads(s)
        data=records['f'];assert [x[3]['children'] for x in data if x[1]=='title']==[head.title]
        assert [x[3]['href'] for x in data if x[1]=='link' and x[3].get('rel')=='canonical']==canonical
        assert [x[3]['content'] for x in data if x[1]=='meta' and x[3].get('property')=='og:image']==[image]
        home=records['7'][0][3]['homepage'];assert home['seo']['title']==head.title and home['seo']['description']==desc[0]
        assert not home['homeMosaicMedias'] and not home['homeProjectItems']
        assert not records['2'][3]['children'][3]['children'][3]['projects']
assert len(titles)==len(descriptions)==3,'Each public page needs unique metadata'
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9','i':'http://www.google.com/schemas/sitemap-image/1.1'}
sitemap=ET.parse(ROOT/'sitemap.xml').getroot()
assert {x.text for x in sitemap.findall('s:url/s:loc',ns)}=={ORIGIN+r for r in ROUTES}
images=sitemap.findall('s:url/i:image/i:loc',ns)
assert len(images)>50,'Gallery originals should be discoverable in the sitemap'
for image in images:
    assert image.text.startswith(ORIGIN+'/media/')
    assert (ROOT/urlsplit(image.text).path.lstrip('/')).is_file(),image.text
for filename in ('404.html','clients.html','clients/index.html','clients/admin.html'):
    head=Head();head.feed((ROOT/filename).read_text().split('</head>')[0])
    assert 'noindex' in ','.join(head.meta('robots')),filename
print(f'PASS:3 unique canonicals, complete share cards, consistent hydration metadata, valid linked JSON-LD, {len(images)} image sitemap entries, private/error noindex.')
