FROM python:3.11-slim
RUN apt-get update && apt-get install -y tesseract-ocr libgl1 libglib2.0-0
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD gunicorn wsgi:app --bind 0.0.0.0:${PORT:-10000} --timeout 120