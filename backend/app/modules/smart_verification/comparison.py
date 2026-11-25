"""Cross-document intelligence and version comparison."""

import itertools

import cv2
import numpy as np
from PIL import Image

from app.extensions import db
from app.models import DocumentVersion
from app.services.file_service import document_preview, save_pil_artifact
from app.utils.files import hamming
from app.utils.text import name_similarity, normalize_invoice_number, text_similarity

FIELD_LABELS = {
    "vendor_name": "Vendor / issuer",
    "buyer_name": "Buyer",
    "gstin": "GSTIN",
    "invoice_number": "Invoice number",
    "invoice_date": "Invoice date",
    "po_number": "PO number",
    "bank_account": "Bank account",
    "ifsc": "IFSC",
    "total": "Total amount",
}
NAME_FIELDS = {"vendor_name", "buyer_name"}


class ComparisonError(Exception):
    def __init__(self, message, status=400, code="comparison_error"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _fields(document) -> dict:
    if not document.ocr_result or not document.ocr_result.fields_json:
        raise ComparisonError(f"'{document.original_filename}' has not been analysed yet.", 422, "not_analysed")
    return document.ocr_result.fields_json


def _text(document) -> str:
    return document.ocr_result.text if document.ocr_result else ""


def _field_value(fields: dict, key: str):
    if key == "total":
        return (fields.get("amounts") or {}).get("total")
    return fields.get(key)


def _compare_field(key, left_val, right_val):
    label = FIELD_LABELS[key]
    if left_val in (None, "") and right_val in (None, ""):
        return {"field": key, "label": label, "left": left_val, "right": right_val,
                "match": "missing", "note": "Not detected in either document."}
    if left_val in (None, "") or right_val in (None, ""):
        return {"field": key, "label": label, "left": left_val, "right": right_val,
                "match": "missing", "note": "Detected in only one document."}
    if key == "total":
        try:
            delta = abs(float(left_val) - float(right_val))
            tolerance = max(1.0, float(right_val) * 0.01)
            match = delta <= tolerance
            return {"field": key, "label": label, "left": left_val, "right": right_val,
                    "match": "exact" if match else "mismatch",
                    "similarity": round(1 - min(1.0, delta / max(1.0, float(right_val))), 3),
                    "note": f"Difference {delta:.2f}; tolerance {tolerance:.2f}."}
        except (TypeError, ValueError):
            pass
    if key in NAME_FIELDS:
        similarity = name_similarity(left_val, right_val)
        return {"field": key, "label": label, "left": left_val, "right": right_val,
                "match": "exact" if similarity >= 0.85 else ("similar" if similarity >= 0.55 else "mismatch"),
                "similarity": similarity, "note": f"Fuzzy name similarity {similarity:.2f}."}
    if key == "invoice_number":
        left_norm = normalize_invoice_number(left_val)
        right_norm = normalize_invoice_number(right_val)
        match = left_norm == right_norm
        return {"field": key, "label": label, "left": left_val, "right": right_val,
                "match": "exact" if match else "mismatch",
                "note": "Compared after normalising punctuation."}
    left_norm = str(left_val).strip().upper()
    right_norm = str(right_val).strip().upper()
    return {"field": key, "label": label, "left": left_val, "right": right_val,
            "match": "exact" if left_norm == right_norm else "mismatch"}


def _line_diff(left_text: str, right_text: str, limit: int = 300):
    import difflib

    left_lines = (left_text or "").splitlines()
    right_lines = (right_text or "").splitlines()
    matcher = difflib.SequenceMatcher(None, left_lines, right_lines, autojunk=False)
    rows = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(min(i2 - i1, j2 - j1)):
                rows.append({"type": "equal", "left": left_lines[i1 + offset],
                             "right": right_lines[j1 + offset], "left_line": i1 + offset + 1,
                             "right_line": j1 + offset + 1})
        elif tag == "replace":
            for offset in range(max(i2 - i1, j2 - j1)):
                rows.append({
                    "type": "replace",
                    "left": left_lines[i1 + offset] if i1 + offset < i2 else None,
                    "right": right_lines[j1 + offset] if j1 + offset < j2 else None,
                    "left_line": i1 + offset + 1 if i1 + offset < i2 else None,
                    "right_line": j1 + offset + 1 if j1 + offset < j2 else None,
                })
        elif tag == "delete":
            for offset in range(i2 - i1):
                rows.append({"type": "delete", "left": left_lines[i1 + offset], "right": None,
                             "left_line": i1 + offset + 1, "right_line": None})
        elif tag == "insert":
            for offset in range(j2 - j1):
                rows.append({"type": "insert", "left": None, "right": right_lines[j1 + offset],
                             "left_line": None, "right_line": j1 + offset + 1})
        if len(rows) >= limit:
            break
    return rows[:limit]


def _visual_diff(left_document, right_document) -> dict:
    try:
        left_image = document_preview(left_document)
        right_image = document_preview(right_document)
    except Exception as exc:
        return {"available": False, "note": f"Preview could not be rendered: {type(exc).__name__}"}
    width = 640
    left_scaled = left_image.resize((width, max(1, int(left_image.height * width / left_image.width))), Image.LANCZOS)
    right_scaled = right_image.resize((width, max(1, int(right_image.height * width / right_image.width))), Image.LANCZOS)
    height = max(left_scaled.height, right_scaled.height)
    canvas_left = Image.new("RGB", (width, height), "white")
    canvas_left.paste(left_scaled, (0, 0))
    canvas_right = Image.new("RGB", (width, height), "white")
    canvas_right.paste(right_scaled, (0, 0))
    left_gray = np.asarray(canvas_left.convert("L"), dtype=np.int16)
    right_gray = np.asarray(canvas_right.convert("L"), dtype=np.int16)
    diff = np.abs(left_gray - right_gray).astype(np.uint8)
    threshold = (diff > 28).astype(np.uint8) * 255
    threshold = cv2.morphologyEx(threshold, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    changed_fraction = float((threshold > 0).mean())
    heat = cv2.applyColorMap(cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8), cv2.COLORMAP_INFERNO)
    blended = cv2.addWeighted(cv2.cvtColor(np.asarray(canvas_right), cv2.COLOR_RGB2BGR), 0.55, heat, 0.45, 0)
    path = save_pil_artifact(left_document.uuid, f"diff_vs_{right_document.id}", Image.fromarray(cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)))
    return {
        "available": True,
        "changed_fraction": round(changed_fraction, 4),
        "identical": changed_fraction < 0.001,
        "image_path": path,
        "page_geometry": {"left": list(left_image.size), "right": list(right_image.size)},
        "note": "Page 1 of each document is resized to a common width. Layout shifts can increase the changed area.",
    }


def compare_pair(left_document, right_document) -> dict:
    left_fields = _fields(left_document)
    right_fields = _fields(right_document)
    left_text = _text(left_document)
    right_text = _text(right_document)
    similarity = text_similarity(left_text, right_text)
    field_results = [
        _compare_field(key, _field_value(left_fields, key), _field_value(right_fields, key))
        for key in FIELD_LABELS
    ]
    metadata_results = []
    if left_document.metadata_record and right_document.metadata_record:
        left_meta = left_document.metadata_record
        right_meta = right_document.metadata_record
        for key, label in (
            ("producer", "Producer"), ("creator", "Creator"), ("creation_date", "Created"),
            ("modification_date", "Modified"), ("page_count", "Pages"), ("has_signature", "Digital signature"),
        ):
            left_value = getattr(left_meta, key)
            right_value = getattr(right_meta, key)
            metadata_results.append({"field": key, "label": label, "left": left_value, "right": right_value,
                                     "same": left_value == right_value})
    dhash_distance = hamming(
        left_document.fingerprint.dhash if left_document.fingerprint else None,
        right_document.fingerprint.dhash if right_document.fingerprint else None,
    )
    visual = _visual_diff(left_document, right_document)
    matched_fields = sum(1 for item in field_results if item["match"] in ("exact", "similar"))
    comparable_fields = sum(1 for item in field_results if item["match"] != "missing")
    field_consistency = matched_fields / comparable_fields if comparable_fields else None
    if similarity >= 0.9:
        change_level = "minor"
    elif similarity >= 0.6:
        change_level = "substantive"
    else:
        change_level = "major"
    result = {
        "left": left_document.to_dict(),
        "right": right_document.to_dict(),
        "text_similarity": similarity,
        "change_level": change_level,
        "field_consistency": round(field_consistency, 3) if field_consistency is not None else None,
        "fields": field_results,
        "metadata": metadata_results,
        "fingerprint": {
            "left_dhash": left_document.fingerprint.dhash if left_document.fingerprint else None,
            "right_dhash": right_document.fingerprint.dhash if right_document.fingerprint else None,
            "hamming_distance": dhash_distance,
        },
        "visual": visual,
        "diff": _line_diff(left_text, right_text),
        "summary": (
            f"Text similarity is {similarity * 100:.1f}% ({change_level} changes). "
            + (f"{matched_fields} of {comparable_fields} comparable fields agree." if comparable_fields else "No comparable fields were detected.")
        ),
        "note": "Comparison is based on OCR text, extracted fields and page-1 rendering. "
                "OCR errors and layout changes can affect results; review the highlighted differences.",
    }
    if left_document.organisation_id and left_document.organisation_id == right_document.organisation_id:
        record = DocumentVersion(
            organisation_id=left_document.organisation_id,
            base_document_id=left_document.id,
            compared_document_id=right_document.id,
            similarity=similarity,
            diff_json={
                "change_level": change_level,
                "field_consistency": result["field_consistency"],
                "fields": field_results,
                "visual_changed_fraction": visual.get("changed_fraction"),
            },
        )
        db.session.add(record)
        db.session.commit()
        result["comparison_id"] = record.id
    return result


def multi_compare(documents) -> dict:
    if len(documents) < 2:
        raise ComparisonError("Select at least two documents to compare.")
    if len(documents) > 6:
        raise ComparisonError("A maximum of six documents can be compared at once.")
    for document in documents:
        _fields(document)
    documents_fields = {doc.id: _fields(doc) for doc in documents}
    matrix = []
    inconsistencies = []
    for left, right in itertools.combinations(documents, 2):
        left_fields = documents_fields[left.id]
        right_fields = documents_fields[right.id]
        fields = [
            _compare_field(key, _field_value(left_fields, key), _field_value(right_fields, key))
            for key in FIELD_LABELS
        ]
        matches = sum(1 for f in fields if f["match"] in ("exact", "similar"))
        comparable = sum(1 for f in fields if f["match"] != "missing")
        score = matches / comparable if comparable else 0
        matrix.append({
            "left": {"id": left.id, "name": left.original_filename},
            "right": {"id": right.id, "name": right.original_filename},
            "consistency": round(score, 3),
            "fields": fields,
        })
    for key, label in FIELD_LABELS.items():
        values = []
        for document in documents:
            value = _field_value(documents_fields[document.id], key)
            if value not in (None, ""):
                values.append({"document_id": document.id, "name": document.original_filename, "value": value})
        if len(values) < 2:
            continue
        if key in NAME_FIELDS:
            distinct = False
            for a, b in itertools.combinations(values, 2):
                if name_similarity(a["value"], b["value"]) < 0.7:
                    distinct = True
                    break
        elif key == "total":
            numeric = [float(v["value"]) for v in values if isinstance(v["value"], (int, float))]
            distinct = bool(numeric) and (max(numeric) - min(numeric)) > max(1.0, max(numeric) * 0.01)
        else:
            normalized = {str(v["value"]).strip().upper() for v in values}
            distinct = len(normalized) > 1
        if distinct:
            inconsistencies.append({"field": key, "label": label, "values": values})
    return {
        "documents": [doc.to_dict() for doc in documents],
        "pairs": matrix,
        "inconsistencies": inconsistencies,
        "note": "Cross-document intelligence compares extracted fields. Missing fields are ignored; "
                "OCR errors can create apparent mismatches — verify against originals.",
    }
