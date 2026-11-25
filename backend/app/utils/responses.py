from flask import jsonify


def ok(data=None, status: int = 200, meta: dict | None = None):
    payload = {"success": True, "data": data}
    if meta is not None:
        payload["meta"] = meta
    return jsonify(payload), status


def created(data=None, meta: dict | None = None):
    return ok(data, 201, meta)


def err(message: str, status: int = 400, code: str = "bad_request", details=None):
    body = {"success": False, "error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return jsonify(body), status


def pagination_meta(total: int, page: int, per_page: int) -> dict:
    pages = (total + per_page - 1) // per_page if per_page else 0
    return {"total": total, "page": page, "per_page": per_page, "pages": pages}
