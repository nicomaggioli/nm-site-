"""Keep public metadata, homepage hydration metadata, and image sitemap aligned."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
import json, re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://nicomaggioli.com'
IMAGE = '/media/nm-work/Ravisauce_Sneaker_Collection.webp'
IMAGE_ALT = 'RAVI footwear collection in a range of colors, materials and sole finishes'
PAGES = {
    'index.html': ('/', 'Nico Maggioli | Footwear, Brand & Product Designer',
        'Boston-based multidisciplinary designer specializing in footwear, branding, packaging and overseas manufacturing, from the first sketch to the final launch.'),
    'index/index.html': ('/index/', 'Design Portfolio | Nico Maggioli',
        'Explore Nico Maggioli’s work in footwear, branding, packaging, web design and 3D, from product concepts and samples to finished products and launch visuals.'),
    'about/index.html': ('/about/', 'About Nico Maggioli | Designer & Product Developer',
        'Meet Nico Maggioli, a multidisciplinary designer working across branding, footwear, manufacturing, web and 3D. Explore his process, experience and resume.'),
}

class Tags(HTMLParser):
    def __init__(self):
        super().__init__(); self.images=[]; self.services=[]; self.capture=None
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='img': self.images.append(attrs)
        if attrs.get('class') in ('nm-svc-title','nm-svc-copy'):
            self.capture=(tag, attrs['class'], [])
    def handle_data(self, data):
        if self.capture: self.capture[2].append(data)
    def handle_endtag(self, tag):
        if self.capture and tag==self.capture[0]:
            self.services.append((self.capture[1], ''.join(self.capture[2])))
            self.capture=None

source=(ROOT/'js/nm-brands.js').read_text()
services=Tags(); services.feed(json.loads(re.search(r'var HTML = (".*?");',source)[1]))
services=[{'@type':'Service','name':services.services[i][1], 'description':services.services[i+1][1],
    'provider':{'@id':ORIGIN+'/#person'},'url':ORIGIN+'/#nm-services'} for i in range(0,len(services.services),2)]

def metadata(route,title,description):
    return [
        ('title',{'children':title}),
        ('meta',{'name':'description','content':description}),
        ('link',{'rel':'canonical','href':ORIGIN+route}),
        ('meta',{'name':'robots','content':'index,follow,max-image-preview:large'}),
        ('meta',{'property':'og:type','content':'profile' if route=='/about/' else 'website'}),
        ('meta',{'property':'og:site_name','content':'Nico Maggioli'}),
        ('meta',{'property':'og:locale','content':'en_US'}),
        ('meta',{'property':'og:url','content':ORIGIN+route}),
        ('meta',{'property':'og:title','content':title}),
        ('meta',{'property':'og:description','content':description}),
        ('meta',{'property':'og:image','content':ORIGIN+IMAGE}),
        ('meta',{'property':'og:image:width','content':'1600'}),
        ('meta',{'property':'og:image:height','content':'1600'}),
        ('meta',{'property':'og:image:type','content':'image/webp'}),
        ('meta',{'property':'og:image:alt','content':IMAGE_ALT}),
        ('meta',{'name':'twitter:card','content':'summary_large_image'}),
        ('meta',{'name':'twitter:title','content':title}),
        ('meta',{'name':'twitter:description','content':description}),
        ('meta',{'name':'twitter:image','content':ORIGIN+IMAGE}),
        ('meta',{'name':'twitter:image:alt','content':IMAGE_ALT}),
    ]

def render(entries):
    tags=[]
    for tag,attrs in entries:
        if tag=='title': tags.append('<title>'+escape(attrs['children'])+'</title>'); continue
        tags.append('<'+tag+' '+ ' '.join(k+'="'+escape(v,quote=True)+'"' for k,v in attrs.items())+'>')
    return '\n'.join(tags)

def graph(route,title,description):
    person={'@type':'Person','@id':ORIGIN+'/#person','name':'Nico Maggioli','url':ORIGIN+'/about/',
        'jobTitle':'Multidisciplinary Designer','email':'nicomaggioli@gmail.com',
        'description':'Designer working across branding, footwear, manufacturing, web and 3D.',
        'homeLocation':{'@type':'Place','name':'Boston, Massachusetts'}}
    site={'@type':'WebSite','@id':ORIGIN+'/#website','url':ORIGIN+'/', 'name':'Nico Maggioli',
        'inLanguage':'en-US','publisher':{'@id':person['@id']}}
    page={'@type':{'/':'WebPage','/index/':'CollectionPage','/about/':'ProfilePage'}[route],
        '@id':ORIGIN+route+'#webpage','url':ORIGIN+route,'name':title,'description':description,
        'isPartOf':{'@id':site['@id']},'about':{'@id':person['@id']},'inLanguage':'en-US'}
    if route=='/about/':
        page['mainEntity']={'@id':person['@id']}
        person['alumniOf']={'@type':'CollegeOrUniversity','name':'Syracuse University'}
        person['knowsAbout']=['Brand strategy','Brand identity','Packaging design','Footwear design','Product development','Manufacturing','Web design','3D design']
    if route=='/': page['mainEntity']=services
    return {'@context':'https://schema.org','@graph':[site,person,page]}

def update_flight(block,entries,title,description):
    try:
        payload=json.loads(block[len('self.__next_f.push('):-1])
        record=payload[1]
        key,raw=record.split(':',1); data=json.loads(raw)
    except (ValueError,IndexError,TypeError):return block
    if key=='f':
        retained=[x for x in data if x[1] not in ('meta','title','link') or (x[1]=='link' and x[3].get('rel') in ('icon','apple-touch-icon'))]
        data=[['$',tag,'seo-'+str(i),attrs] for i,(tag,attrs) in enumerate(entries)]+retained
    elif key=='d':
        data=[x for x in data if x[3].get('name')!='theme-color']
        data.append(['$','meta','theme',{'name':'theme-color','content':'#0a0a0a'}])
    elif key=='2':
        # Retired template project drawer is disabled in the shipped component.
        data[3]['children'][3]['children'][3]['projects']=[]
    elif key=='7':
        homepage=data[0][3]['homepage']
        # These feed disabled template components, not the authored portfolio.
        homepage['homeMosaicMedias']=[]
        homepage['homeProjectItems']=[]
        seo=homepage['seo']
        seo.update(title=title,description=description,image={'url':IMAGE,'alt':IMAGE_ALT,'width':1600,'height':1600,'mimeType':'image/webp'},twitterCard='summary_large_image')
    else:return block
    payload[1]=key+':'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    return 'self.__next_f.push('+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+')'

for filename,(route,title,description) in PAGES.items():
    p=ROOT/filename; text=p.read_text(); head,body=text.split('</head>',1)
    head=re.sub(r'<title>.*?</title>','',head,flags=re.S)
    head=re.sub(r'<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+|theme-color)"|property="og:[^"]+")[^>]*>','',head,flags=re.I)
    head=re.sub(r'<link\b[^>]*rel="canonical"[^>]*>','',head,flags=re.I)
    head=re.sub(r'<script type="application/ld\+json" id="nm-schema">.*?</script>','',head,flags=re.S)
    entries=metadata(route,title,description)
    schema=json.dumps(graph(route,title,description),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    # Head metadata is available to simple crawlers and social previews before JS.
    head=head.rstrip()+'\n'+render(entries)+'\n<meta name="theme-color" content="#0a0a0a">\n<script type="application/ld+json" id="nm-schema">'+schema+'</script>\n'
    text=head+'</head>'+body
    if filename=='index.html':
        text=re.sub(r'<script>(self\.__next_f\.push\(.*?\))</script>',lambda m:'<script>'+update_flight(m[1],entries,title,description)+'</script>',text,flags=re.S)
    text='\n'.join(line.rstrip() for line in text.split('\n'))
    text=re.sub(r'\n{3,}', '\n\n', text)
    p.write_text(text)

# Original images remain discoverable without forcing full-resolution downloads.
ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
ET.register_namespace('image','http://www.google.com/schemas/sitemap-image/1.1')
smap='http://www.sitemaps.org/schemas/sitemap/0.9'; imgmap='http://www.google.com/schemas/sitemap-image/1.1'
root=ET.Element('{'+smap+'}urlset')
for filename,(route,_,_) in PAGES.items():
    item=ET.SubElement(root,'{'+smap+'}url');ET.SubElement(item,'{'+smap+'}loc').text=ORIGIN+route
    parser=Tags();parser.feed((ROOT/filename).read_text())
    paths=[x['src'].replace('/nm-thumb/','/nm-work/').replace('/nm-index/','/nm-work/') for x in parser.images if x.get('src','').startswith('/media/nm-')]
    if route=='/':
        authored=json.loads(re.search(r'var HTML = (".*?");',(ROOT/'js/nm-home-content.js').read_text())[1])
        parser=Tags();parser.feed(authored)
        parser.feed(json.loads(re.search(r'var HTML = (".*?");',source)[1]))
        paths=[x['src'] for x in parser.images if x.get('src','').startswith(('/media/nm-', '/media/nmhome/', '/media/services/'))]
        # Prefer gallery originals over small decorative collage copies.
        paths=[p.replace('/nm-ring/','/nm-work/').replace('/nm-thumb/','/nm-work/') for p in paths]
    for path in dict.fromkeys(paths):
        assert (ROOT/path.lstrip('/')).is_file(),path
        entry=ET.SubElement(item,'{'+imgmap+'}image');ET.SubElement(entry,'{'+imgmap+'}loc').text=ORIGIN+path
ET.indent(root,space='  ')
(ROOT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'+ET.tostring(root,encoding='unicode')+'\n')
print('Updated public metadata, matching Flight records, structured data and image sitemap.')
