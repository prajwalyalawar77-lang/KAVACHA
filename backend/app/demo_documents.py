"""Synthetic demo documents for seeding and UI walkthroughs.

Everything here is generated locally with ReportLab/PyMuPDF/Pillow from
fictional businesses. No real personal or corporate data is used. The tampered
variant is an edited rendering of the clean invoice so the fraud demo is
genuine: its text layer really does disagree with its arithmetic.
"""

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

VENDOR = {
    "name": "Bharat Industrial Supplies Pvt Ltd",
    "gstin": "29ABCDE1234F1ZW",
    "pan": "ABCDE1234F",
    "address": "14, Peenya Industrial Area, Bengaluru 560058",
    "email": "accounts@bharatindustrial.example",
    "phone": "9845012345",
    "bank": "HDFC Bank",
    "account": "50100234567890",
    "ifsc": "HDFC0001234",
}

BUYER = {
    "name": "Sunrise Manufacturing Pvt Ltd",
    "gstin": "29AAKCS1234K1Z3",
    "address": "88, Bommasandra Industrial Area, Bengaluru 560099",
}

FONT_CANDIDATES = (
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def inr(value: float) -> str:
    """Indian digit grouping: 118000 -> 1,18,000."""
    whole = f"{int(round(value))}"
    negative = whole.startswith("-")
    whole = whole.lstrip("-")
    if len(whole) <= 3:
        grouped = whole
    else:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        grouped = ",".join(parts + [tail])
    return f"-{grouped}" if negative else grouped


class _Doc:
    def __init__(self):
        self.buffer = io.BytesIO()
        self.c = canvas.Canvas(self.buffer, pagesize=A4)
        self.width, self.height = A4
        self.left = 50

    def text(self, x, y, value, size=10, bold=False, right=None):
        self.c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        if right is None:
            self.c.drawString(x, y, value)
        else:
            self.c.drawRightString(right, y, value)

    def rule(self, y, width=0.7):
        self.c.setLineWidth(width)
        self.c.line(self.left, y, self.width - self.left, y)

    def save(self) -> bytes:
        self.c.showPage()
        self.c.save()
        return self.buffer.getvalue()


def invoice_pdf(invoice_number="INV-2026-0088", invoice_date="05-11-2026",
                po_number="PO-2026-0088", taxable=100000, cgst_rate=9, sgst_rate=9,
                vendor=VENDOR, buyer=BUYER) -> bytes:
    cgst = round(taxable * cgst_rate / 100, 2)
    sgst = round(taxable * sgst_rate / 100, 2)
    total = round(taxable + cgst + sgst, 2)
    doc = _Doc()
    d = doc
    d.text(d.left, 800, "TAX INVOICE", 17, bold=True)
    d.text(0, 800, "Original for Recipient", 9, right=d.width - d.left)
    d.text(d.left, 772, vendor["name"], 12, bold=True)
    d.text(d.left, 758, vendor["address"], 9)
    d.text(d.left, 745, f"GSTIN: {vendor['gstin']}", 9)
    d.text(d.left, 732, f"Email: {vendor['email']}   Phone: {vendor['phone']}", 9)
    d.text(0, 758, f"Invoice No: {invoice_number}", 10, bold=True, right=d.width - d.left)
    d.text(0, 745, f"Invoice Date: {invoice_date}", 9, right=d.width - d.left)
    d.text(0, 732, f"PO Number: {po_number}", 9, right=d.width - d.left)
    d.text(0, 719, "Place of Supply: 29-Karnataka", 9, right=d.width - d.left)
    d.rule(712)

    d.text(d.left, 694, "Sold By:", 9, bold=True)
    d.text(d.left + 56, 694, vendor["name"], 9)
    d.text(d.left, 680, "Billed To:", 9, bold=True)
    d.text(d.left + 56, 680, buyer["name"], 9)
    d.text(d.left + 56, 667, buyer["address"], 9)
    d.text(d.left + 56, 654, f"GSTIN: {buyer['gstin']}", 9)
    d.rule(644)

    header_y = 626
    d.text(d.left, header_y, "Description", 9, bold=True)
    d.text(300, header_y, "HSN", 9, bold=True)
    d.text(352, header_y, "Qty", 9, bold=True)
    d.text(410, header_y, "Rate", 9, bold=True)
    d.text(0, header_y, "Amount", 9, bold=True, right=d.width - d.left)
    d.rule(header_y - 5, 0.4)
    d.text(d.left, header_y - 22, "Industrial Gearbox Assembly", 9)
    d.text(300, header_y - 22, "8483", 9)
    d.text(352, header_y - 22, "10", 9)
    d.text(410, header_y - 22, inr(taxable / 10), 9)
    d.text(0, header_y - 22, inr(taxable), 9, right=d.width - d.left)
    d.rule(header_y - 32, 0.4)

    y = 540
    d.text(330, y, f"Taxable Value: {inr(taxable)}", 9)
    d.text(330, y - 15, f"CGST @ {cgst_rate}%: {inr(cgst)}", 9)
    d.text(330, y - 30, f"SGST @ {sgst_rate}%: {inr(sgst)}", 9)
    d.text(330, y - 48, f"Total Tax: {inr(cgst + sgst)}", 9, bold=True)
    d.rule(y - 55, 0.4)
    d.text(330, y - 72, f"Grand Total: {inr(total)}", 11, bold=True)
    d.rule(y - 80)

    d.text(d.left, 420, "Bank Details", 10, bold=True)
    d.text(d.left, 406, f"Bank: {vendor['bank']}", 9)
    d.text(d.left, 393, f"A/C No: {vendor['account']}", 9)
    d.text(d.left, 380, f"IFSC: {vendor['ifsc']}", 9)
    d.text(d.left, 352, "Declaration: This is a computer-generated invoice and does not require a signature.", 8)
    d.text(d.left, 90, "All disputes are subject to Bengaluru jurisdiction. This is a synthetic demo document.", 8)
    return d.save()


def gst_certificate_pdf(valid_upto="10-12-2026", vendor=VENDOR) -> bytes:
    d = _Doc()
    d.text(d.left, 800, "GST REGISTRATION CERTIFICATE", 15, bold=True)
    d.text(d.left, 782, "Form GST REG-06", 9)
    d.text(0, 800, "Synthetic demo", 9, right=d.width - d.left)
    d.rule(772)
    rows = [
        ("Registration Number (GSTIN)", vendor["gstin"]),
        ("Legal Name", vendor["name"]),
        ("Trade Name", "Bharat Industrial Supplies"),
        ("Supplier", vendor["name"]),
        ("Constitution of Business", "Private Limited Company"),
        ("Address of Principal Place of Business", vendor["address"]),
        ("Date of Liability", "01-04-2021"),
        ("Valid Upto", valid_upto),
        ("Type of Registration", "Regular"),
    ]
    y = 740
    for label, value in rows:
        d.text(d.left, y, f"{label}: {value}", 9, bold=label in ("Registration Number (GSTIN)", "Valid Upto"))
        y -= 22
    d.rule(y + 8, 0.4)
    d.text(d.left, y - 20, "This certificate is issued with reference to the registration application filed by the taxpayer.", 9)
    d.text(d.left, y - 36, "Verify the current status on the official GST portal. This demo copy is not a government document.", 9)
    return d.save()


def purchase_order_pdf(po_number="PO-2026-0088", po_date="01-11-2026",
                       vendor=VENDOR, buyer=BUYER, amount=118000) -> bytes:
    d = _Doc()
    d.text(d.left, 800, "PURCHASE ORDER (CONFIRMED)", 17, bold=True)
    d.text(d.left, 772, f"Buyer: {buyer['name']}", 12, bold=True)
    d.text(d.left, 758, buyer["address"], 9)
    d.text(d.left, 745, f"GSTIN: {buyer['gstin']}", 9)
    d.text(0, 758, f"PO Number: {po_number}", 10, bold=True, right=d.width - d.left)
    d.text(0, 745, f"PO Date: {po_date}", 9, right=d.width - d.left)
    d.rule(738)
    d.text(d.left, 714, "Vendor:", 9, bold=True)
    d.text(d.left + 52, 714, vendor["name"], 9)
    d.text(d.left + 52, 701, vendor["address"], 9)
    d.text(d.left + 52, 688, f"GSTIN: {vendor['gstin']}", 9)
    d.rule(680)
    d.text(d.left, 660, "Description", 9, bold=True)
    d.text(360, 660, "Qty", 9, bold=True)
    d.text(420, 660, "Unit Rate", 9, bold=True)
    d.text(0, 660, "Amount", 9, bold=True, right=d.width - d.left)
    d.rule(655, 0.4)
    d.text(d.left, 637, "Industrial Gearbox Assembly (HSN 8483)", 9)
    d.text(360, 637, "10", 9)
    d.text(420, 637, inr(amount / 10), 9)
    d.text(0, 637, inr(amount), 9, right=d.width - d.left)
    d.rule(627, 0.4)
    d.text(330, 600, f"Total: {inr(amount)}", 11, bold=True)
    d.text(d.left, 560, "Payment Terms: 30 days from invoice date. Delivery: Peenya warehouse, Bengaluru.", 9)
    d.text(d.left, 546, "Authorised Signatory: R. Iyer (Procurement Head)", 9)
    d.text(d.left, 90, "This is a synthetic demo purchase order generated for the KAVACHA demonstration.", 8)
    return d.save()


def offer_letter_pdf(candidate="Priya Sharma") -> bytes:
    d = _Doc()
    d.text(d.left, 800, "OFFER OF APPOINTMENT", 16, bold=True)
    d.text(d.left, 776, "Global Career Solutions LLP", 12, bold=True)
    d.text(d.left, 762, "Contact: hr.globalcareers@gmail.com  |  WhatsApp 9876543210", 9)
    d.text(d.left, 748, "Portal: https://bit.ly/global-careers-apply", 9)
    d.rule(740)
    d.text(d.left, 716, f"Dear {candidate},", 10)
    body = [
        "Congratulations! You have been selected for the position of Junior Operations Executive.",
        "Salary offered: Rs 32,000 per month plus incentives. Immediate joining required.",
        "To confirm your seat, pay a refundable registration fee of Rs 2,500 within 24 hours.",
        "Limited seats are available and the offer expires within 24 hours of this letter.",
        "Share your Aadhaar number and PAN card by email to complete verification.",
        "For any queries contact our HR team only on WhatsApp 9876543210.",
    ]
    y = 688
    for line in body:
        d.text(d.left, y, line, 10)
        y -= 22
    d.text(d.left, 520, "Aadhaar: 5123 4567 8903   PAN: ABCDE1234F", 10)
    d.text(d.left, 496, "Account No: 1234567890123  IFSC: HDFC0001234  UPI: hr.globalcareers@okhdfcbank", 10)
    d.text(d.left, 470, "Registration fee: Rs 2,500 (non-refundable after 48 hours).", 10)
    d.text(d.left, 440, "Regards,", 10)
    d.text(d.left, 424, "Global Career Solutions LLP (Recruitment Team)", 10, bold=True)
    d.text(d.left, 90, "This is a synthetic demo offer letter created to demonstrate public-safety checks.", 8)
    return d.save()


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except Exception:
                continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def tamper_invoice(pdf_bytes: bytes, original="1,18,000", replacement="2,18,000") -> bytes:
    """Render page 1, paint over the grand total and draw a different number.

    Returns PNG bytes so the upload takes the OCR path; the forgery is a real
    pixel edit, not a fabricated finding.
    """
    import fitz

    scale = 2
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        page = doc.load_page(0)
        rects = page.search_for(original)
        if not rects:
            raise RuntimeError(f"Could not locate '{original}' on the demo invoice page.")
        rect = rects[-1]
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")

    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = [int(v * scale) for v in (rect.x0, rect.y0, rect.x1, rect.y1)]
    draw.rectangle([x0 - 2, y0 - 3, x1 + 2, y1 + 3], fill="white")
    size = max(10, int((y1 - y0) * 0.9))
    font = _load_font(size)
    draw.text((x0, (y0 + y1) / 2), replacement, fill=(15, 15, 15), font=font, anchor="lm")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
