import os
from flask import request, send_from_directory
from app import create_app

app = create_app()

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")


@app.before_request
def serve_frontend():
    path = request.path.lstrip("/")
    if path == "api" or path.startswith("api/"):
        return None
    full_path = os.path.join(FRONTEND_DIR, path)
    if path and os.path.isfile(full_path):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")
