"""Render the landing page and docs/legal/*.md into the static site at web/legal/site/."""
import re
import json
import os
from html import escape
from urllib.parse import quote, urlparse

from social_card import generate_social_card
import shutil
from datetime import date
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/legal/site"
SCREENSHOTS = ROOT / "web/legal/screenshots"
FOOD_PHOTOS = ["9000133", "9000096", "9000049", "9000022"]
CONTACT = "jcsenka013@gmail.com"
SITE_URL = os.environ.get("PANTRY_SITE_URL", "https://legal-production-9e0c.up.railway.app").rstrip("/")
if urlparse(SITE_URL).scheme != "https" or not urlparse(SITE_URL).netloc:
    raise ValueError("PANTRY_SITE_URL must be an absolute HTTPS URL")
MEDIA = ROOT / "web/legal/media"
REPO_URL = "https://github.com/osctulsa-source/Pantry-Party"

SUBS = [
    ("#2-️-food-safety-disclaimer-please-read", "#2-foodsafety-disclaimer-please-read"),
    # Joint forms first so we don't leave orphaned commas.
    ("`[COMPANY / LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`", "the Pantry Party team"),
    ("`[COMPANY / LEGAL ENTITY NAME]`", "the Pantry Party team"),
    ("`[APP NAME]`", "Pantry Party"),
    ("[APP NAME]", "Pantry Party"),
    ("`[EFFECTIVE DATE]`", "July 9, 2026"),
    ("`[SUPPORT CONTACT EMAIL]`", "jcsenka013@gmail.com"),
    ("`[PRIVACY CONTACT EMAIL]`", "jcsenka013@gmail.com"),
    ("`[13 / 16 / 18 — confirm]`", "13"),
    ("`[13 / 16 — confirm]`", "13"),
    ("`[AMOUNT, e.g. US$50]`", "US$50"),
    ("`[12]`", "12"),
    ("`[RETENTION PERIOD]`", "30-day"),
    ("`[confirm region for\nyour final configuration]`", ""),
    (
        "`[Describe how a user disables diagnostics, if exposed in‑app;\notherwise state the default.]`",
        "Diagnostics are minimized by default and never include the contents of your pantry or your identity.",
    ),
    ("[Privacy Policy](./PRIVACY.md)", "[Privacy Policy](/privacy/)"),
    ("[Terms of Service](./TERMS.md)", "[Terms of Service](/terms/)"),
]

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Pantry Party</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{title} — Pantry Party">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/assets/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pantry Party: a shared pantry, ready when you are offline. Created by JC Senka.">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
  <a class="brand" href="/">Pantry&nbsp;Party</a>
  <nav><a href="/#support">Support</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></nav>
</header>
<main>
{body}
</main>
<footer>
  <p>Pantry Party · <a href="mailto:jcsenka013@gmail.com">jcsenka013@gmail.com</a></p>
</footer>
</body>
</html>
"""

CSS = """
:root { --ink:#2b2320; --paper:#faf7f0; --accent:#C76B43; --green:#2E5D3A; --muted:#7a6f66; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#ece5da; --paper:#191512; --accent:#d98a63; --green:#7fb08a; --muted:#9c9188; }
}
* { box-sizing: border-box; }
body { overflow-wrap:break-word; margin:0; font:17px/1.65 Georgia, 'Times New Roman', serif; color:var(--ink); background:var(--paper); }
header, footer { font-family: -apple-system, 'Segoe UI', sans-serif; }
header { display:flex; justify-content:space-between; align-items:center; padding:1rem 1.25rem; border-bottom:1px solid color-mix(in srgb, var(--ink) 14%, transparent); }
.brand { font-weight:700; color:var(--accent); text-decoration:none; font-size:1.05rem; letter-spacing:.01em; }
nav a { color:var(--muted); text-decoration:none; margin-left:1.1rem; font-size:.95rem; }
nav a:hover { color:var(--accent); }
main { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size:1.9rem; line-height:1.25; color:var(--green); }
h2 { font-size:1.25rem; margin-top:2.2rem; color:var(--green); }
a { color:var(--accent); }
table { border-collapse:collapse; width:100%; font-size:.92rem; display:block; overflow-x:auto; }
th, td { border:1px solid color-mix(in srgb, var(--ink) 18%, transparent); padding:.5rem .6rem; text-align:left; vertical-align:top; }
blockquote { margin:1rem 0; padding:.6rem 1rem; border-left:3px solid var(--accent); background:color-mix(in srgb, var(--accent) 7%, transparent); }
footer { max-width:44rem; margin:0 auto; padding:1.5rem 1.25rem 3rem; color:var(--muted); font-size:.9rem; border-top:1px solid color-mix(in srgb, var(--ink) 14%, transparent); }
footer a { color:var(--muted); }
strong { color:var(--ink); }
hr { border:none; border-top:1px solid color-mix(in srgb, var(--ink) 14%, transparent); margin:2rem 0; }
"""

LANDING_CSS = """
body.landing { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; line-height:1.55; }
.landing h1, .landing h2, .landing h3 { font-family: Georgia, 'Times New Roman', serif; color:var(--green); }
.landing main { max-width:64rem; padding:0 1.25rem 4rem; }
.landing section { padding:3.5rem 0 0; }
.landing footer { max-width:64rem; }
.landing nav a { white-space:nowrap; }
@media (max-width: 30rem) { .landing nav .wide-only { display:none; } }
.hero { display:grid; grid-template-columns: 1fr; gap:2rem; align-items:center; padding-top:3rem; }
@media (min-width: 48rem) { .hero { grid-template-columns: 1.15fr 1fr; padding-top:4.5rem; } }
.hero-icon { width:72px; height:72px; border-radius:18px; display:block; margin-bottom:1.25rem; }
.hero h1 { font-size:clamp(2.2rem, 5vw, 3.2rem); line-height:1.1; margin:0 0 1rem; }
.lede { font-size:1.2rem; color:var(--muted); margin:0 0 1.75rem; max-width:32rem; }
.badge { display:inline-block; font-size:.8rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--green); background:color-mix(in srgb, var(--green) 12%, transparent); padding:.3rem .65rem; border-radius:999px; margin-bottom:1rem; }
.ctas { display:flex; flex-wrap:wrap; gap:.75rem; }
.btn { display:inline-block; padding:.8rem 1.3rem; border-radius:12px; font-weight:600; text-decoration:none; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:hover { filter:brightness(1.06); }
.btn-ghost { border:1.5px solid color-mix(in srgb, var(--ink) 22%, transparent); color:var(--ink); }
.btn-ghost:hover { border-color:var(--accent); color:var(--accent); }
.mosaic { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; }
.mosaic img { width:100%; height:auto; aspect-ratio:1; object-fit:cover; border-radius:16px; display:block; }
.section-title { font-size:1.9rem; margin:0 0 .5rem; }
.section-lede { color:var(--muted); margin:0 0 2rem; max-width:40rem; }
.features { display:grid; grid-template-columns:repeat(auto-fit, minmax(15rem, 1fr)); gap:1rem; }
.card { padding:1.35rem; border-radius:16px; background:color-mix(in srgb, var(--ink) 4%, transparent); border:1px solid color-mix(in srgb, var(--ink) 8%, transparent); }
.card h3 { font-size:1.15rem; margin:0 0 .4rem; }
.card p { margin:0; color:var(--muted); }
.shots { display:flex; gap:1rem; overflow-x:auto; padding-bottom:.5rem; scroll-snap-type:x mandatory; }
.shots figure { margin:0; flex:0 0 auto; max-width:85vw; }
.shots figcaption { max-width:20rem; font-size:.9rem; color:var(--muted); margin-top:.75rem; }
.shots img { max-width:100%; object-fit:contain; height:32rem; max-height:70vh; border-radius:24px; scroll-snap-align:start; box-shadow:0 8px 30px color-mix(in srgb, var(--ink) 18%, transparent); }
.built { list-style:none; padding:0; display:grid; grid-template-columns:1fr; gap:1.25rem 2rem; }
@media (min-width: 48rem) { .built { grid-template-columns:1fr 1fr; } }
.built li { padding-left:1rem; border-left:3px solid var(--accent); }
.built strong { display:block; }
.built span { color:var(--muted); }
.support { padding:1.75rem; border-radius:16px; background:color-mix(in srgb, var(--green) 8%, transparent); }
.support p { margin:.4rem 0; }
.byline { font-size:.95rem; color:var(--muted); margin:1.2rem 0 0; }
.walkthrough { width:100%; max-height:75vh; border-radius:16px; background:#191512; }
a:focus-visible { outline:3px solid var(--green); outline-offset:4px; }
"""

LANDING = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pantry Party — the shared pantry for your household</title>
<meta name="description" content="Pantry Party keeps your household's pantry in sync: scan groceries in, watch expiry dates, cook what you have, and shop what you're missing.">
<meta property="og:title" content="Pantry Party">
<meta property="og:description" content="The shared pantry for your household. Waste less food, cook what you have.">
<link rel="canonical" href="{site}/">
<meta property="og:type" content="website">
<meta property="og:url" content="{site}/">
<meta property="og:image" content="{site}/assets/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Pantry Party: a shared pantry, ready when you are offline. Created by JC Senka.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/icon.png">
<link rel="stylesheet" href="/style.css">
</head>
<body class="landing">
<header>
  <a class="brand" href="/">Pantry&nbsp;Party</a>
  <nav><a class="wide-only" href="#features">Features</a><a class="wide-only" href="/engineering/">Engineering</a><a href="#support">Support</a></nav>
</header>
<main>
<section class="hero">
  <div>
    <img class="hero-icon" src="/assets/icon.png" alt="">
    <span class="badge">iPhone beta on TestFlight</span>
    <h1>The shared pantry for your household.</h1>
    <p class="lede">Scan groceries in, see what's expiring, cook what you already have, and shop what you're missing, together. It keeps working offline.</p>
    <div class="ctas">
      <a class="btn btn-primary" href="mailto:{contact}?subject=Pantry%20Party%20beta">Request beta access</a>
      <a class="btn btn-ghost" href="/engineering/">Read the case study</a>
    </div>
    <p class="byline">Created by <a href="https://www.linkedin.com/in/jcsenka/">JC Senka</a> · <a href="{repo}">View source</a></p>
  </div>
  <div class="mosaic">
{mosaic}
  </div>
</section>
{shots}
{video}
<section id="features">
  <h2 class="section-title">Less waste, less guessing</h2>
  <p class="section-lede">Everyone in the household sees the same fridge, freezer, and cupboard, and changes sync to every phone.</p>
  <div class="features">
    <div class="card"><h3>Add groceries in seconds</h3><p>Scan a barcode, point the camera at a receipt, or pick a screenshot of an online order. Text is read on your phone.</p></div>
    <div class="card"><h3>Know what's expiring</h3><p>Track best-before dates and fill levels, and get a heads-up before food goes bad.</p></div>
    <div class="card"><h3>Cook what you have</h3><p>Nearly 300 original recipes ranked by what's already in your pantry, with swaps for missing ingredients.</p></div>
    <div class="card"><h3>Shop as a team</h3><p>One shared list. Check items off at the store and everyone's list updates.</p></div>
    <div class="card"><h3>Works offline</h3><p>Pantry changes save on your phone first and sync when you're back online.</p></div>
    <div class="card"><h3>Private by design</h3><p>No ads and no data sales. Delete your account and its data from inside the app at any time.</p></div>
  </div>
</section>

<section id="built">
  <h2 class="section-title">How it's built</h2>
  <p class="section-lede">A TypeScript monorepo: React Native and Expo on the phone, NestJS and Postgres behind it.</p>
  <ul class="built">
    <li><strong>Local-first sync</strong><span>Reads and writes hit on-device SQLite; PowerSync streams household-scoped changes from Postgres.</span></li>
    <li><strong>On-device OCR</strong><span>Receipts and order screenshots are parsed on the phone into an editable review list.</span></li>
    <li><strong>Tenancy enforced twice</strong><span>Sync rules scope reads; an authenticated upload API checks household membership on every write.</span></li>
    <li><strong>Tested against real Postgres</strong><span>Unit suites plus integration tests for concurrency races, account deletion, and access control.</span></li>
  </ul>
  <p><a href="/engineering/">Explore the architecture, regression tests, and tradeoffs →</a></p>
</section>

<section id="support">
  <div class="support">
    <h2 class="section-title">Support</h2>
    <p>The iPhone app is in a working TestFlight beta. Creator JC Senka has used it successfully for a couple of months as of October 8, 2026. Beta access is by request.</p>
    <p>Questions, bugs, or beta access: <a href="mailto:{contact}">{contact}</a></p>
    <p><a href="/privacy/">Privacy Policy</a> · <a href="/terms/">Terms of Service</a></p>
  </div>
</section>
</main>
<footer>
  <p>© {year} Pantry Party · <a href="mailto:{contact}">{contact}</a></p>
</footer>
</body>
</html>
"""


def render(src_md: str) -> str:
    text = src_md
    # Drop the leading DRAFT banner blockquote (first "> ..." run of lines).
    text = re.sub(r"^> \*\*DRAFT[^\n]*\n(?:> ?[^\n]*\n)*", "", text, count=1, flags=re.M)
    for old, new in SUBS:
        text = text.replace(old, new)
    # Remove any remaining backticked bracket notes (counsel instructions),
    # including multi-line ones. Markdown links are not backtick-wrapped.
    text = re.sub(r"`\[[^`]*?\]`", "", text, flags=re.S)
    return markdown.markdown(text, extensions=["tables", "sane_lists", "toc"])


def page(title: str, body_html: str, out: Path, description: str = "Pantry Party support and legal information.") -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(PAGE.format(title=escape(title), body=body_html, description=escape(description, quote=True), url=escape(SITE_URL + "/" + str(out.parent.relative_to(OUT)) + "/", quote=True), site=escape(SITE_URL, quote=True)), encoding="utf-8")
    print("wrote", out.relative_to(ROOT))


page("Privacy Policy", render((ROOT / "docs/legal/PRIVACY.md").read_text(encoding="utf-8")), OUT / "privacy/index.html")
page("Terms of Service", render((ROOT / "docs/legal/TERMS.md").read_text(encoding="utf-8")), OUT / "terms/index.html")
def landing() -> None:
    assets = OUT / "assets"
    if assets.exists():
        shutil.rmtree(assets)
    (assets / "food").mkdir(parents=True)
    shutil.copyfile(ROOT / "apps/mobile/assets/icon.png", assets / "icon.png")
    generate_social_card(assets / "social-card.png")
    mosaic = []
    for photo in FOOD_PHOTOS:
        shutil.copyfile(ROOT / f"apps/mobile/assets/recipe-images/{photo}.jpg", assets / "food" / f"{photo}.jpg")
        mosaic.append(f'    <img src="/assets/food/{photo}.jpg" alt="" loading="lazy" width="400" height="400">')

    shots = ""
    screenshots = sorted(p for p in SCREENSHOTS.glob("*") if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    captions_path = SCREENSHOTS / "captions.json"
    captions = json.loads(captions_path.read_text()) if captions_path.exists() else {}
    readme_imgs = []
    if screenshots:
        (assets / "screens").mkdir()
        imgs = []
        for shot in screenshots:
            shutil.copyfile(shot, assets / "screens" / shot.name)
            alt = escape(captions.get(shot.name, "Pantry Party: " + shot.stem.replace("-", " ")), quote=True)
            filename = quote(shot.name)
            imgs.append(f'    <figure><img src="/assets/screens/{filename}" alt="{alt}" loading="lazy"><figcaption>{alt}</figcaption></figure>')
            readme_imgs.append(f'  <img src="web/legal/screenshots/{filename}" width="23%" alt="{alt}">')
        shots = '<section aria-labelledby="screens-title"><h2 class="section-title" id="screens-title">Inside the app</h2>\n  <div class="shots">\n' + "\n".join(imgs) + "\n  </div>\n</section>"
    gallery = '<p>\n' + "\n".join(readme_imgs) + '\n</p>' if readme_imgs else '<!-- Real app screenshots are added here by web/legal/generate.py when supplied. -->'
    readme = ROOT / "README.md"
    readme.write_text(re.sub(r"(?<=<!-- portfolio-screenshots:start -->).*?(?=<!-- portfolio-screenshots:end -->)", lambda _: "\n" + gallery + "\n", readme.read_text(), flags=re.S))

    video = ""
    if (MEDIA / "walkthrough.mp4").exists() and (MEDIA / "walkthrough.vtt").exists():
        (assets / "media").mkdir()
        for filename in ("walkthrough.mp4", "walkthrough.vtt"):
            shutil.copyfile(MEDIA / filename, assets / "media" / filename)
        video = '<section aria-labelledby="demo-title"><h2 class="section-title" id="demo-title">A short walkthrough</h2><video class="walkthrough" controls playsinline preload="metadata" aria-label="Pantry Party app walkthrough"><source src="/assets/media/walkthrough.mp4" type="video/mp4"><track kind="captions" src="/assets/media/walkthrough.vtt" srclang="en" label="English" default><a href="/assets/media/walkthrough.mp4">Download the walkthrough</a></video></section>'

    out = OUT / "index.html"
    out.write_text(
        LANDING.format(
            contact=CONTACT,
            repo=REPO_URL,
            year=date.today().year,
            mosaic="\n".join(mosaic),
            shots=shots,
            video=video,
            site=escape(SITE_URL, quote=True),
        ),
        encoding="utf-8",
    )
    print("wrote", out.relative_to(ROOT), f"({len(screenshots)} screenshots)")


landing()
page("Engineering case study", markdown.markdown((ROOT / "docs/portfolio/CASE-STUDY.md").read_text(), extensions=["tables", "sane_lists", "toc"]), OUT / "engineering/index.html", "How JC Senka built an offline-first pantry app: local SQLite, household sync, on-device OCR, and concurrency regression tests.")
(OUT / "style.css").write_text(CSS + LANDING_CSS, encoding="utf-8")
print("wrote", (OUT / "style.css").relative_to(ROOT))

leftover = re.findall(r"\[[A-Z][A-Z /—-]+\]", (OUT / "privacy/index.html").read_text(encoding="utf-8") + (OUT / "terms/index.html").read_text(encoding="utf-8"))
print("leftover placeholders:", leftover or "none")
