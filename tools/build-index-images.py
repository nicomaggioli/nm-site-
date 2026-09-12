"""Build responsive gallery variants from existing originals. Requires Pillow.

Run after adding/changing Index photos. --check verifies descriptors and image
decoding without writing files. Original media and crops are preserved.
"""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'index/index.html'
SIZES = '(min-width:1600px) 20vw, (min-width:1024px) 25vw, (min-width:600px) 33.333vw, 50vw'


class Gallery(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.images = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'img' and attrs.get('src', '').startswith('/media/nm-thumb/'):
            self.images.append(attrs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    html = HTML.read_text()
    images = Gallery(html).images
    if args.check:
        count = 0
        for attrs in images:
            assert attrs['sizes'] == SIZES, attrs['src']
            for candidate in attrs['srcset'].split(','):
                src, width = candidate.split()
                with Image.open(ROOT / src.lstrip('/')) as image:
                    image.load()
                    assert image.width == int(width[:-1]), (src, width, image.width)
                count += 1
        print(f'PASS: {len(images)} photos, {count} decoded variants with accurate source widths.')
        return

    medium = ROOT / 'media/nm-index'
    medium.mkdir(exist_ok=True)
    source_sets = {}
    for attrs in images:
        src = attrs['src']
        name = Path(src).name
        with Image.open(ROOT / src.lstrip('/')) as thumbnail:
            candidates = [f'{src} {thumbnail.width}w']
        with Image.open(ROOT / 'media/nm-work' / name) as original:
            if original.width > 768:
                height = round(original.height * 768 / original.width)
                original.resize((768, height), Image.Resampling.LANCZOS).save(
                    medium / name, quality=80, method=6)
                candidates.append(f'/media/nm-index/{name} 768w')
            candidates.append(f'/media/nm-work/{name} {original.width}w')
        source_sets[src] = ', '.join(candidates)

    def replace(match):
        tag = match[0]
        src = re.search(r' src="([^"]+)"', tag)[1]
        tag = re.sub(r' srcset="[^"]*"', f' srcset="{source_sets[src]}"', tag)
        return re.sub(r' sizes="[^"]*"', f' sizes="{SIZES}"', tag)

    HTML.write_text(re.sub(r'<img [^>]*src="/media/nm-thumb/[^>]+>', replace, html))
    print(f'Updated responsive sources for {len(images)} gallery photos.')


if __name__ == '__main__':
    main()
