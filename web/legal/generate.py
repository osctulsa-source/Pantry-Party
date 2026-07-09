"""Render docs/legal/*.md into the static legal site at web/legal/site/."""
import re
from pathlib import Path

import markdown

ROOT = Path("C:/Users/JCS/Pantry-Party")
OUT = ROOT / "web/legal/site"

SUBS = [
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
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
  <a class="brand" href="/">Pantry&nbsp;Party</a>
  <nav><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></nav>
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
body { margin:0; font:17px/1.65 Georgia, 'Times New Roman', serif; color:var(--ink); background:var(--paper); }
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

INDEX_MD = """# Pantry Party — Legal

Pantry Party is a shared-pantry app that helps your household waste less food.

- [Privacy Policy](/privacy/)
- [Terms of Service](/terms/)

Questions? Email [jcsenka013@gmail.com](mailto:jcsenka013@gmail.com).
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
    return markdown.markdown(text, extensions=["tables", "sane_lists"])


def page(title: str, body_html: str, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(PAGE.format(title=title, body=body_html), encoding="utf-8")
    print("wrote", out.relative_to(ROOT))


page("Privacy Policy", render((ROOT / "docs/legal/PRIVACY.md").read_text(encoding="utf-8")), OUT / "privacy/index.html")
page("Terms of Service", render((ROOT / "docs/legal/TERMS.md").read_text(encoding="utf-8")), OUT / "terms/index.html")
page("Legal", markdown.markdown(INDEX_MD), OUT / "index.html")
(OUT / "style.css").write_text(CSS, encoding="utf-8")
print("wrote", (OUT / "style.css").relative_to(ROOT))

leftover = re.findall(r"\[[A-Z][A-Z /—-]+\]", (OUT / "privacy/index.html").read_text(encoding="utf-8") + (OUT / "terms/index.html").read_text(encoding="utf-8"))
print("leftover placeholders:", leftover or "none")
