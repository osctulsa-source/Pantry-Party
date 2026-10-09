"""Check generated portfolio HTML and local asset/link targets without network access."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent / 'site'


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.meta = {}
        self.canonical = None
        self.ids = set()
        self.headings = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        if tag == 'h1':
            self.headings += 1
        if tag == 'meta':
            self.meta[attrs.get('property', attrs.get('name'))] = attrs.get('content')
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        for key in ('href', 'src'):
            if key in attrs:
                self.links.append(attrs[key])


pages = {}
for path in ROOT.rglob('*.html'):
    page = Page()
    page.feed(path.read_text())
    pages[path] = page
    assert page.headings == 1, f'{path}: expected one h1'
    assert page.canonical and page.canonical.startswith('https://'), f'{path}: canonical missing'
    assert page.meta.get('og:image', '').startswith('https://'), f'{path}: absolute sharing image missing'
    assert page.meta.get('og:image:alt'), f'{path}: sharing image alt missing'
    assert page.meta.get('twitter:card') == 'summary_large_image', path

for path, page in pages.items():
    for link in page.links:
        url = urlparse(link)
        if url.scheme or url.netloc:
            continue
        target = ROOT / unquote(url.path.lstrip('/')) if url.path.startswith('/') else path.parent / unquote(url.path)
        if not url.path:
            target = path
        elif target.is_dir():
            target /= 'index.html'
        assert target.exists(), f'{path}: broken local link {link}'
        if url.fragment and target in pages:
            assert unquote(url.fragment) in pages[target].ids, f'{path}: missing anchor {link}'

from PIL import Image
with Image.open(ROOT / 'assets/social-card.png') as image:
    assert image.size == (1200, 630)
print(f'Validated {len(pages)} pages, local links, metadata, and 1200x630 sharing image.')
