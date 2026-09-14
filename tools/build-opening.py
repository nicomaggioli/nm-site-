"""Inline critical opening setup without adding render-blocking requests."""
from pathlib import Path
import hashlib,re
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text()
s=re.sub(r'<style id="nm-opening-style">.*?</style>\n?','',s,flags=re.S)
s=re.sub(r'<script id="nm-opening-boot">.*?</script>\n?','',s,flags=re.S)
s=re.sub(r'<script src="/js/nm-opening\.js[^\"]*" defer(?:="")?></script>\n?','',s)
css=(ROOT/'css/nm-opening.css').read_text().strip()
boot=(ROOT/'js/nm-opening-boot.js').read_text().strip()
version=hashlib.sha256((ROOT/'js/nm-opening.js').read_bytes()).hexdigest()[:10]
critical='<style id="nm-opening-style">'+css+'</style><script id="nm-opening-boot">'+boot+'</script>'
# The existing first script restores a reload to the top. Preserve its order.
s=s.replace('</script>', '</script>'+critical, 1)
needle=re.search(r'<script src="/js/nm-sync\.js[^\"]*"></script>',s)
assert needle, 'Missing initialization bridge'
s=s[:needle.end()]+'<script src="/js/nm-opening.js?v='+version+'" defer></script>'+s[needle.end():]
p.write_text(s)
print('Built critical opening setup and deferred controller.')
