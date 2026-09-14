#!/usr/bin/env python3
"""Build Nico's two-page resume from the recovered old portfolio.

Requires reportlab and fonttools[woff] (including brotli).
Run: python3 tools/build-resume.py

Content source: git d7bf9a89a5b5ad503ef02080bf22bee9d11b4a7b:index.html,
lines 2751-2881 (2026-07-24). Name and title: lines 2692-2693.
All role dates, descriptions, education, skills and honors are retained.
"Present" remains the original source wording, not a new chronology claim.
The site fonts are converted to static TTFs in a temporary directory and
embedded in the PDF; no generated font artifacts enter the repository.
"""

from pathlib import Path
from tempfile import TemporaryDirectory
from xml.sax.saxutils import escape

from fontTools.ttLib import TTFont as FontToolsFont
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "media/resume/nico-maggioli-resume.pdf"
SOURCE_COMMIT = "d7bf9a89a5b5ad503ef02080bf22bee9d11b4a7b"

EXPERIENCE = [
    {
        "organization": "Sprout Studios",
        "role": "Visual Designer",
        "location": "Boston, MA",
        "dates": "June 2025 to Present",
        "description": "Visual design, identity, and motion work for Staples, Kohler, Whirlpool, and others. Branded systems and campaign assets across formats.",
    },
    {
        "organization": "NM",
        "role": "Freelancer",
        "location": "Boston, MA",
        "dates": "May 2022 to Present",
        "description": "50+ clients across brand, packaging, and product. Strategy, identity, and manufacturing for small brands and independent founders.",
    },
    {
        "organization": "Ravisauce",
        "role": "Founder & Lead Designer",
        "location": "Boston, MA",
        "dates": "April 2015 to Present",
        "description": "Founded and built a fingerboard and skatewear brand from product through brand and distribution. Customers in 17 countries, sold through retail and online.",
    },
    {
        "organization": "Zipped Magazine",
        "role": "Art Director",
        "location": "Syracuse, NY",
        "dates": "Aug 2023 to May 2024",
        "description": "Led a team of four in weekly editorial production, directing social, poster, and design assets for a culture-focused semester publication.",
    },
]

EDUCATION = [
    {
        "organization": "Syracuse University",
        "school": "College of Visual and Performing Arts",
        "qualification": "BFA, Communications Design · Magna Cum Laude · May 2024",
    },
    {"organization": "Boston College High School", "qualification": "May 2020"},
]

CREATIVE = ["Strategy", "Positioning", "Branding", "Packaging", "Product Development", "Manufacturing", "Editorial", "3D Design"]
TECHNICAL = ["Photoshop", "Illustrator", "InDesign", "Figma", "Framer", "Blender", "Claude Code", "Bambu Lab", "FL Studio"]

LEADERSHIP = [
    "Syracuse University Summer College Ambassador, 2019",
    "Young Leaders Conference, Sheffield, England, 2019",
    "YMCA Camp Counselor CIT, Camp Coniston, Croydon NH, 2011 to 2016",
]

HONORS = [
    ("Paul Leibovitz Award", "Syracuse University, 2024. Presented to a senior demonstrating cutting-edge interactive design and emerging technology use."),
    ("Impact Award", "Babson College, 2018. Recognized for brand networking leadership and building community engagement around Ravisauce."),
    ("Craftsmanship Recognition", "Fingerboard TV, 2017. Featured internationally for craftsmanship in handmade fingerboard design."),
]

WIDTH, HEIGHT = letter
MARGIN = 44
CONTENT = WIDTH - 2 * MARGIN
BLACK = HexColor("#141414")
GREY = HexColor("#585858")
LINE = HexColor("#d3d3d3")
ORANGE = HexColor("#ff7820")


def register_fonts(temp):
    for family, source, weight in [
        ("Geist", "geist-sans-var.woff2", 400),
        ("GeistMedium", "geist-sans-var.woff2", 500),
        ("GeistBold", "geist-sans-var.woff2", 600),
        ("GeistMono", "geist-mono-var.woff2", 400),
    ]:
        font = FontToolsFont(ROOT / "fonts" / source)
        font = instantiateVariableFont(font, {"wght": weight}, inplace=True)
        font.flavor = None
        # Static instances need distinct PostScript names. Otherwise ReportLab
        # can reuse the first instance's face for every registered weight.
        for record in font["name"].names:
            if record.nameID in (1, 4, 6):
                record.string = f"{family}-Resume".encode(record.getEncoding())
        target = Path(temp) / f"{family}.ttf"
        font.save(target)
        pdfmetrics.registerFont(TTFont(family, str(target)))


def draw_text(canvas, text, x, top, size=11, font="Geist", color=BLACK):
    canvas.setFillColor(color)
    canvas.setFont(font, size)
    canvas.drawString(x, HEIGHT - top - size, text)


def paragraph(canvas, text, x, top, width=CONTENT, size=11, leading=15, color=BLACK, font="Geist"):
    style = ParagraphStyle("resume", fontName=font, fontSize=size, leading=leading, textColor=color)
    p = Paragraph(escape(text), style)
    _, height = p.wrap(width, HEIGHT)
    if top + height > HEIGHT - 50:
        raise ValueError(f"Content overlaps footer: {text}")
    p.drawOn(canvas, x, HEIGHT - top - height)
    return top + height


def section(canvas, title, top, number):
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.65)
    canvas.line(MARGIN, HEIGHT - top, WIDTH - MARGIN, HEIGHT - top)
    canvas.setFillColor(ORANGE)
    canvas.rect(MARGIN, HEIGHT - top - 17, 4, 4, fill=1, stroke=0)
    draw_text(canvas, title.upper(), MARGIN + 13, top + 8, 9, "GeistMono")
    canvas.setFont("GeistMono", 8)
    canvas.setFillColor(GREY)
    canvas.drawRightString(WIDTH - MARGIN, HEIGHT - top - 17, number)
    return top + 36


def footer(canvas, page):
    top = HEIGHT - 42
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.65)
    canvas.line(MARGIN, HEIGHT - top, WIDTH - MARGIN, HEIGHT - top)
    draw_text(canvas, "nicomaggioli.com", MARGIN, top + 9, 8, "GeistMono", GREY)
    canvas.linkURL("https://nicomaggioli.com", (MARGIN, 14, MARGIN + 100, 33), relative=0)
    email_x = MARGIN + 130
    email = "nicomaggioli@gmail.com"
    draw_text(canvas, email, email_x, top + 9, 8, "GeistMono", GREY)
    email_width = pdfmetrics.stringWidth(email, "GeistMono", 8)
    canvas.linkURL("mailto:" + email, (email_x, 14, email_x + email_width, 33), relative=0)
    canvas.setFont("GeistMono", 8)
    canvas.setFillColor(GREY)
    canvas.drawRightString(WIDTH - MARGIN, 23, f"0{page} / 02")


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="nico-resume-fonts-") as temp:
        register_fonts(temp)
        canvas = Canvas(str(OUTPUT), pagesize=letter, pageCompression=1, invariant=1)
        canvas.setTitle("Nico Maggioli | Resume")
        canvas.setAuthor("Nico Maggioli")
        canvas.setSubject(f"Resume reformatted from nicomaggioli.com portfolio; source commit {SOURCE_COMMIT}")
        canvas.setCreator("tools/build-resume.py")

        draw_text(canvas, "RESUME", MARGIN, 35, 8.5, "GeistMono", GREY)
        draw_text(canvas, "Nico Maggioli", MARGIN - 2, 56, 43, "GeistBold")
        canvas.setFillColor(ORANGE)
        canvas.circle(WIDTH - MARGIN - 7, HEIGHT - 83, 7, fill=1, stroke=0)
        draw_text(canvas, "Brand Designer & Product Developer", MARGIN, 111, 13, "GeistMedium")
        draw_text(canvas, "Boston, MA", MARGIN, 134, 9.5, "GeistMono", GREY)
        top = section(canvas, "Experience", 168, "01")

        for entry in EXPERIENCE:
            draw_text(canvas, entry["organization"], MARGIN, top, 15, "GeistBold")
            canvas.setFillColor(GREY)
            canvas.setFont("GeistMono", 8.5)
            canvas.drawRightString(WIDTH - MARGIN, HEIGHT - top - 13, entry["dates"])
            draw_text(canvas, entry["role"] + "  /  " + entry["location"], MARGIN, top + 22, 10, "GeistMedium", GREY)
            bottom = paragraph(canvas, entry["description"], MARGIN, top + 42, size=10.5, leading=14.2)
            top = bottom + 21

        top = section(canvas, "Education", top + 1, "02")
        draw_text(canvas, EDUCATION[0]["organization"], MARGIN, top, 12, "GeistBold")
        draw_text(canvas, EDUCATION[0]["school"], MARGIN, top + 19, 10, "Geist", GREY)
        draw_text(canvas, EDUCATION[0]["qualification"], MARGIN, top + 36, 10, "Geist")
        draw_text(canvas, EDUCATION[1]["organization"], MARGIN, top + 62, 12, "GeistBold")
        draw_text(canvas, EDUCATION[1]["qualification"], MARGIN, top + 81, 10, "Geist", GREY)
        if top + 95 > HEIGHT - 50:
            raise ValueError("Education overlaps footer")
        footer(canvas, 1)
        canvas.showPage()

        draw_text(canvas, "NICO MAGGIOLI", MARGIN, 35, 8.5, "GeistMono", GREY)
        draw_text(canvas, "Practice & recognition", MARGIN - 1, 64, 30, "GeistBold")
        top = section(canvas, "Expertise", 124, "03")
        column_width = (CONTENT - 38) / 2
        right = MARGIN + column_width + 38
        draw_text(canvas, "Creative", MARGIN, top, 13, "GeistBold")
        draw_text(canvas, "Technical", right, top, 13, "GeistBold")
        left_bottom = paragraph(canvas, " · ".join(item.replace(" ", "\u00a0") for item in CREATIVE), MARGIN, top + 25, column_width, 11, 18)
        right_bottom = paragraph(canvas, " · ".join(item.replace(" ", "\u00a0") for item in TECHNICAL), right, top + 25, column_width, 11, 18)
        top = section(canvas, "Leadership", max(left_bottom, right_bottom) + 32, "04")
        for item in LEADERSHIP:
            top = paragraph(canvas, item, MARGIN, top, size=11, leading=16) + 13
        top = section(canvas, "Honors & awards", top + 17, "05")
        for title, description in HONORS:
            draw_text(canvas, title, MARGIN, top, 13, "GeistBold")
            top = paragraph(canvas, description, MARGIN, top + 23, size=11, leading=15.5) + 25
        footer(canvas, 2)
        canvas.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
