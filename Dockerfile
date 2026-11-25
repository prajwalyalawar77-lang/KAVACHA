FROM python:3.11-slim

# Tesseract is needed for OCR; the other libraries are needed by OpenCV/PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

# Render gives the port in $PORT
CMD gunicorn wsgi:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 2 --timeout 120