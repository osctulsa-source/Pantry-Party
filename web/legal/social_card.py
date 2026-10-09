"""Generate a reproducible 1200x630 typographic portfolio sharing card."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def generate_social_card(destination: Path) -> None:
    image = Image.new("RGB", (1200, 630), "#faf7f0")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 22, 630), fill="#2e5d3a")
    draw.rounded_rectangle((78, 65, 398, 109), radius=22, fill="#e3ebdf")
    draw.text((99, 77), "IPHONE · TESTFLIGHT BETA", font=ImageFont.load_default(size=20), fill="#2e5d3a")
    draw.text((76, 149), "Pantry Party", font=ImageFont.load_default(size=88), fill="#2e5d3a")
    draw.text((80, 277), "A shared pantry.", font=ImageFont.load_default(size=48), fill="#2b2320")
    draw.text((80, 340), "Ready when you're offline.", font=ImageFont.load_default(size=48), fill="#2b2320")
    draw.line((80, 456, 1120, 456), fill="#c76b43", width=3)
    draw.text((80, 494), "React Native · TypeScript · NestJS · PostgreSQL", font=ImageFont.load_default(size=28), fill="#63574d")
    draw.text((80, 549), "Created by JC Senka", font=ImageFont.load_default(size=26), fill="#2e5d3a")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)
