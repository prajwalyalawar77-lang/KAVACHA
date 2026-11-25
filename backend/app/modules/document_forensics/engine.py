"""Document forensics engine.

Implements explainable, baseline computer-vision indicators:
  * Error Level Analysis (ELA) recompression residuals outside text regions
  * ORB-based copy-move candidate detection (self-matching with offset clustering)
  * Block-wise noise inconsistency (median absolute deviation outliers)
  * JPEG blockiness / sharpness measurements
  * PDF font/size inconsistency from embedded text spans
  * OCR text-height inconsistency for scanned documents

Every result is an *indicator*, not proof of manipulation. The engine never
declares a document forged; it surfaces regions and evidence for human review.
"""

import io
import math
import time
from collections import Counter

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.services.file_service import save_pil_artifact

ENGINE_VERSION = "forensics-1.0-baseline"
TEXT_MASK_PAD = 6


def _region(x, y, w, h, score, label, reason, sources):
    return {
        "x": float(max(0.0, min(1.0, x))),
        "y": float(max(0.0, min(1.0, y))),
        "w": float(max(0.001, min(1.0, w))),
        "h": float(max(0.001, min(1.0, h))),
        "score": float(max(0.0, min(1.0, score))),
        "label": label,
        "reason": reason,
        "sources": sources,
    }


def _iou(a, b):
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ix = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    iy = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union else 0.0


def _merge_regions(regions, limit=8):
    merged = []
    for region in sorted(regions, key=lambda r: r["score"], reverse=True):
        for existing in merged:
            if _iou(existing, region) > 0.55:
                existing["sources"] = sorted(set(existing["sources"] + region["sources"]))
                existing["score"] = max(existing["score"], region["score"])
                existing["reason"] = existing["reason"] if len(existing["reason"]) >= len(region["reason"]) else region["reason"]
                break
        else:
            merged.append(dict(region, sources=list(region["sources"])))
        if len(merged) >= limit:
            break
    return merged


def load_page_image(path, mime_type, max_side=1600):
    if mime_type == "application/pdf":
        import fitz

        with fitz.open(path) as doc:
            page = doc.load_page(0)
            zoom = 2.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    else:
        image = Image.open(path)
        image = ImageOps.exif_transpose(image).convert("RGB")
    if max(image.size) > max_side:
        ratio = max_side / max(image.size)
        image = image.resize((max(1, int(image.width * ratio)), max(1, int(image.height * ratio))), Image.LANCZOS)
    return image


def _text_mask(shape, words):
    height, width = shape
    mask = np.zeros((height, width), dtype=np.uint8)
    for word in words:
        if word.get("page", 1) != 1:
            continue
        x = int(word.get("x", 0) * width) - TEXT_MASK_PAD
        y = int(word.get("y", 0) * height) - TEXT_MASK_PAD
        w = int(word.get("w", 0) * width) + TEXT_MASK_PAD * 2
        h = int(word.get("h", 0) * height) + TEXT_MASK_PAD * 2
        cv2.rectangle(mask, (max(0, x), max(0, y)), (min(width - 1, x + w), min(height - 1, y + h)), 255, -1)
    return mask


def error_level_analysis(image: Image.Image, words) -> dict:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    recompressed = Image.open(buffer).convert("RGB")
    original = np.asarray(image, dtype=np.int16)
    residual = np.abs(original - np.asarray(recompressed, dtype=np.int16)).max(axis=2)
    scaled = np.clip(residual * 15, 0, 255).astype(np.uint8)
    heat = cv2.applyColorMap(scaled, cv2.COLORMAP_JET)
    canvas = np.asarray(image).copy()
    overlay = cv2.addWeighted(cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), 0.62, heat, 0.38, 0)

    text_mask = _text_mask(residual.shape, words)
    outside = residual.copy()
    outside[text_mask > 0] = 0
    high_mask = ((outside > 30).astype(np.uint8)) * 255
    high_mask = cv2.morphologyEx(high_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    high_mask = cv2.dilate(high_mask, np.ones((3, 3), np.uint8), iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(high_mask, connectivity=8)

    height, width = outside.shape
    page_area = height * width
    regions = []
    for index in range(1, count):
        x, y, w, h, area = stats[index]
        if area < max(250, page_area * 0.0004):
            continue
        if w < 18 or h < 8:
            continue
        if w > width * 0.92 and h < height * 0.04:
            continue
        component_mask = labels == index
        mean_residual = float(outside[component_mask].mean())
        score = min(1.0, 0.25 + (area / page_area) * 10 + mean_residual / 240)
        regions.append(_region(
            x / width, y / height, w / width, h / height, score,
            "Elevated recompression residual",
            "This region shows a higher error-level-analysis residual than its surroundings. "
            "Recompression is also caused by resizing, scanning and normal re-saving.",
            ["ela"],
        ))
    regions.sort(key=lambda r: r["score"], reverse=True)

    return {
        "mean": float(residual.mean()),
        "p99": float(np.percentile(residual, 99)),
        "high_fraction": float((residual > 30).mean()),
        "outside_text_fraction": float((outside > 30).mean()),
        "regions": regions[:3],
        "heatmap": cv2.cvtColor(heat, cv2.COLOR_BGR2RGB),
        "overlay": cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB),
    }


def _local_std(gray: np.ndarray, points, radius=7):
    height, width = gray.shape
    values = []
    for x, y in points:
        x, y = int(x), int(y)
        patch = gray[max(0, y - radius):min(height, y + radius + 1),
                     max(0, x - radius):min(width, x + radius + 1)]
        values.append(float(patch.std()) if patch.size else 0.0)
    return values


def copy_move_analysis(gray: np.ndarray) -> dict:
    max_side = 900
    if max(gray.shape) > max_side:
        ratio = max_side / max(gray.shape)
        small = cv2.resize(gray, (int(gray.shape[1] * ratio), int(gray.shape[0] * ratio)), interpolation=cv2.INTER_AREA)
    else:
        ratio = 1.0
        small = gray
    orb = cv2.ORB_create(nfeatures=2500, fastThreshold=15)
    keypoints, descriptors = orb.detectAndCompute(small, None)
    result = {"pairs": 0, "score": 0.0, "regions": [], "note": None}
    if descriptors is None or len(keypoints) < 60:
        result["note"] = "Insufficient texture/keypoints for copy-move analysis."
        return result

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    knn = matcher.knnMatch(descriptors, descriptors, k=3)
    candidates = []
    min_offset = max(18.0, 0.02 * math.hypot(*small.shape))
    for group in knn:
        if len(group) < 2:
            continue
        best, second = group[0], group[1]
        if best.queryIdx == best.trainIdx or best.distance > 0.72 * max(second.distance, 1e-6):
            continue
        p1 = keypoints[best.queryIdx].pt
        p2 = keypoints[best.trainIdx].pt
        if math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < min_offset:
            continue
        candidates.append((p1, p2, best.distance))

    if not candidates:
        result["note"] = "No duplicated keypoint offsets detected."
        return result

    stds = _local_std(small, [c[0] for c in candidates] + [c[1] for c in candidates])
    textured = [c for c, s1, s2 in zip(candidates, stds[: len(candidates)], stds[len(candidates):]) if s1 > 6 and s2 > 6]
    bins: dict[tuple, list] = {}
    for p1, p2, distance in textured:
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        key = (int(round(dx / 12.0)), int(round(dy / 12.0)))
        bins.setdefault(key, []).append((p1, p2, distance))

    best_bin, best_matches = None, []
    for key, matches in bins.items():
        distinct = len({(round(m[0][0]), round(m[0][1]), round(m[1][0]), round(m[1][1])) for m in matches})
        if distinct >= 8 and len(matches) > len(best_matches):
            best_bin, best_matches = key, matches
    if not best_matches:
        result["note"] = "Keypoint matches did not cluster into a consistent copied offset."
        return result

    height, width = small.shape
    sources = np.array([m[0] for m in best_matches])
    targets = np.array([m[1] for m in best_matches])
    boxes = []
    for points, label in ((sources, "Copy-move candidate (source)"), (targets, "Copy-move candidate (target)")):
        x0, y0 = points.min(axis=0)
        x1, y1 = points.max(axis=0)
        pad = 26
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(width, x1 + pad), min(height, y1 + pad)
        boxes.append((x0, y0, x1, y1, label))

    distinct = len(best_matches)
    score = min(1.0, 0.3 + distinct / 30.0)
    regions = [
        _region(x0 / width, y0 / height, max(1, x1 - x0) / width, max(1, y1 - y0) / height,
                score, label,
                f"{distinct} keypoints share a consistent displacement (dx≈{int(best_bin[0] * 12)}, "
                f"dy≈{int(best_bin[1] * 12)}). Repeated stamps, logos or table templates can also produce this pattern.",
                ["copy_move"])
        for (x0, y0, x1, y1, label) in boxes
    ]
    result.update({"pairs": distinct, "score": float(score), "regions": regions})
    return result


def _noise_blocks(gray: np.ndarray, block=32):
    laplacian = np.abs(cv2.Laplacian(gray.astype(np.float32), cv2.CV_32F))
    height, width = laplacian.shape
    hb, wb = height // block, width // block
    if hb < 3 or wb < 3:
        return None
    trimmed = laplacian[: hb * block, : wb * block]
    grid = trimmed.reshape(hb, block, wb, block).transpose(0, 2, 1, 3).reshape(hb, wb, -1)
    stds = grid.std(axis=2)
    median = float(np.median(stds))
    deviation = np.abs(stds - median)
    mad = float(np.median(deviation)) or 1e-6
    zscores = 0.6745 * deviation / mad
    outlier_mask = (zscores > 3.5).astype(np.uint8)
    return stds, median, mad, zscores, outlier_mask, block


def noise_analysis(gray: np.ndarray) -> dict:
    data = _noise_blocks(gray)
    if data is None:
        return {"outlier_fraction": 0.0, "regions": [], "note": "Page too small for block noise analysis."}
    stds, median, mad, zscores, outlier_mask, block = data
    fraction = float(outlier_mask.mean())
    scaled = (outlier_mask * 255).astype(np.uint8)
    scaled = cv2.morphologyEx(scaled, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(scaled, connectivity=8)
    height, width = gray.shape
    regions = []
    for index in range(1, count):
        bx, by, bw, bh, area = stats[index]
        if area < 2:
            continue
        blocks_in_comp = int(area)
        max_z = float(zscores[labels == index].max()) if np.any(labels == index) else 0.0
        score = min(1.0, 0.2 + blocks_in_comp / 60.0 + max_z / 25.0)
        regions.append(_region(
            (bx * block) / width, (by * block) / height,
            (bw * block) / width, (bh * block) / height,
            score, "Noise-texture inconsistency",
            "The high-frequency noise level in this block differs sharply from the rest of the page "
            "(robust z-score outlier). Scanners, JPEG compression and pasted content can cause this.",
            ["noise"],
        ))
    regions.sort(key=lambda r: r["score"], reverse=True)
    return {
        "outlier_fraction": fraction,
        "median_std": float(median),
        "mad": float(mad),
        "regions": regions[:3],
        "note": None,
    }


def jpeg_blockiness(gray: np.ndarray) -> dict:
    values = gray.astype(np.float32)
    vertical = np.abs(np.diff(values, axis=1))
    boundary_cols = vertical[:, 7::8].mean() if vertical.shape[1] > 8 else 0.0
    interior_cols = np.delete(vertical, np.s_[7::8], axis=1).mean() if vertical.shape[1] > 9 else 0.0
    horizontal = np.abs(np.diff(values, axis=0))
    boundary_rows = horizontal[7::8, :].mean() if horizontal.shape[0] > 8 else 0.0
    interior_rows = np.delete(horizontal, np.s_[7::8], axis=0).mean() if horizontal.shape[0] > 9 else 0.0
    ratio = max(
        float(boundary_cols) / max(float(interior_cols), 1e-6),
        float(boundary_rows) / max(float(interior_rows), 1e-6),
    )
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return {"blockiness": ratio if math.isfinite(ratio) else 0.0, "sharpness": laplacian_var}


def pdf_font_analysis(path) -> dict:
    import fitz

    families: Counter = Counter()
    spans = []
    with fitz.open(path) as doc:
        if doc.page_count == 0:
            return {"available": False, "anomalies": 0, "regions": [], "fonts": [], "sizes": []}
        page = doc.load_page(0)
        rect = page.rect
        width, height = max(1.0, rect.width), max(1.0, rect.height)
        data = page.get_text("dict")
        for block in data.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = (span.get("text") or "").strip()
                    if len(text) < 2:
                        continue
                    size = float(span.get("size") or 0)
                    family = (span.get("font") or "unknown")
                    family = family.split("+", 1)[-1]
                    families[family] += 1
                    bbox = span.get("bbox")
                    spans.append({
                        "text": text[:80],
                        "font": family,
                        "size": size,
                        "bbox": bbox,
                        "x": bbox[0] / width if bbox else 0,
                        "y": bbox[1] / height if bbox else 0,
                        "w": (bbox[2] - bbox[0]) / width if bbox else 0,
                        "h": (bbox[3] - bbox[1]) / height if bbox else 0,
                    })
    if len(spans) < 6:
        return {"available": False, "anomalies": 0, "regions": [], "fonts": [], "sizes": []}
    common_family = families.most_common(1)[0][0]
    sizes = np.array([s["size"] for s in spans if s["size"] > 0])
    median_size = float(np.median(sizes)) if sizes.size else 0.0
    regions = []
    seen_families = Counter()
    for span in spans:
        seen_families[span["font"]] += 1
    for span in spans:
        unique_family = span["font"] != common_family and seen_families[span["font"]] >= 2
        large_deviation = (
            median_size > 0 and span["size"] > 0
            and abs(span["size"] - median_size) / median_size > 0.25
            and len(span["text"]) > 25
        )
        if unique_family or large_deviation:
            reason = []
            if unique_family:
                reason.append(f"font '{span['font']}' differs from the dominant font '{common_family}'")
            if large_deviation:
                reason.append(f"text size {span['size']:.1f}pt deviates from page median {median_size:.1f}pt")
            regions.append(_region(
                span["x"], span["y"], span["w"], span["h"], 0.55,
                "Font or size inconsistency",
                "This text span " + " and ".join(reason) + ". Headings and tables legitimately use other fonts/sizes; verify manually.",
                ["font"],
            ))
    return {
        "available": True,
        "anomalies": len(regions),
        "regions": regions[:3],
        "fonts": [{"family": f, "count": c, "dominant": f == common_family} for f, c in families.most_common(12)],
        "sizes": sorted({round(s["size"], 1) for s in spans if s["size"] > 0})[:12],
        "median_size": median_size,
        "common_family": common_family,
    }


def ocr_font_analysis(words) -> dict:
    page_words = [w for w in words if w.get("page", 1) == 1 and len(w.get("text", "")) >= 2 and w.get("h", 0) > 0]
    if len(page_words) < 20:
        return {"available": False, "anomalies": 0, "regions": [], "method": "ocr_text_lines"}
    lines: dict[str, list] = {}
    for word in page_words:
        lines.setdefault(word.get("line") or word.get("y"), []).append(word)
    if len(lines) < 4:
        return {"available": False, "anomalies": 0, "regions": [], "method": "ocr_text_lines"}
    line_stats = []
    for key, words_in_line in lines.items():
        heights = sorted(w["h"] for w in words_in_line)
        median_h = heights[len(heights) // 2]
        line_stats.append((key, words_in_line, median_h))
    document_median = float(np.median([stat[2] for stat in line_stats]))
    regions = []
    for key, words_in_line, median_h in line_stats:
        if len(words_in_line) < 3 or document_median <= 0:
            continue
        deviation = abs(median_h - document_median) / document_median
        if deviation > 0.3:
            x0 = min(w["x"] for w in words_in_line)
            y0 = min(w["y"] for w in words_in_line)
            x1 = max(w["x"] + w["w"] for w in words_in_line)
            y1 = max(w["y"] + w["h"] for w in words_in_line)
            regions.append(_region(
                x0, y0, max(0.01, x1 - x0), max(0.008, y1 - y0),
                min(1.0, 0.3 + deviation), "Text-height inconsistency",
                f"Line text height differs {deviation * 100:.0f}% from the document median. OCR noise "
                "and different document sections can cause this; baseline indicator only.",
                ["font"],
            ))
    regions.sort(key=lambda r: r["score"], reverse=True)
    return {"available": True, "anomalies": len(regions), "regions": regions[:2], "method": "ocr_text_lines"}


def _indicator(code, label, severity, detail, evidence, sources):
    return {
        "code": code,
        "label": label,
        "severity": severity,
        "detail": detail,
        "evidence": evidence,
        "sources": sources,
        "module": "document_forensics",
    }


def analyze_document(document, ocr_words, save_artifacts=True) -> dict:
    started = time.monotonic()
    path = None
    from app.services.file_service import document_absolute_path

    path = document_absolute_path(document)
    image = load_page_image(path, document.mime_type)
    rgb = np.asarray(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    ela = error_level_analysis(image, ocr_words or [])
    copy_move = copy_move_analysis(gray)
    noise = noise_analysis(gray)
    block = jpeg_blockiness(gray)
    if document.mime_type == "application/pdf":
        font = pdf_font_analysis(path)
    else:
        font = ocr_font_analysis(ocr_words or [])

    indicators = []
    regions = []
    regions.extend(ela["regions"])
    regions.extend(copy_move["regions"])
    regions.extend(noise["regions"])
    regions.extend(font["regions"])

    if ela["outside_text_fraction"] > 0.012:
        severity = "medium" if ela["outside_text_fraction"] > 0.05 else "low"
        indicators.append(_indicator(
            "forensic.ela_localised",
            "Localised recompression anomalies outside text",
            severity,
            f"{ela['outside_text_fraction'] * 100:.1f}% of non-text pixels show elevated ELA residuals. "
            "Scanning, resizing and normal re-saving also cause ELA variation; treat as an indicator.",
            {"outside_text_fraction": round(ela["outside_text_fraction"], 4), "mean": round(ela["mean"], 2)},
            ["ela"],
        ))
    if copy_move["pairs"] >= 8:
        severity = "medium" if copy_move["pairs"] >= 16 else "low"
        indicators.append(_indicator(
            "forensic.copy_move",
            "Copy-move candidate regions detected",
            severity,
            f"{copy_move['pairs']} keypoints match with a consistent displacement. Repeated logos, "
            "stamps, watermarks and table templates can produce the same pattern.",
            {"pairs": copy_move["pairs"], "score": round(copy_move["score"], 3)},
            ["copy_move"],
        ))
    if noise["outlier_fraction"] > 0.02:
        severity = "medium" if noise["outlier_fraction"] > 0.08 else "low"
        indicators.append(_indicator(
            "forensic.noise_inconsistency",
            "Noise-texture inconsistencies across the page",
            severity,
            f"{noise['outlier_fraction'] * 100:.1f}% of 32px blocks are robust outliers in high-frequency noise. "
            "This can indicate compositing, or simply scanner/compression artefacts.",
            {"outlier_fraction": round(noise["outlier_fraction"], 4), "median_std": round(noise["median_std"], 2)},
            ["noise"],
        ))
    if font.get("anomalies"):
        indicators.append(_indicator(
            "forensic.font_inconsistency",
            "Font or text-size inconsistencies",
            "low",
            f"{font['anomalies']} text span(s)/line(s) differ from the dominant typography. "
            + ("Detected from the PDF text layer." if document.mime_type == "application/pdf"
               else "Detected from OCR text heights (baseline heuristic; fonts cannot be identified directly)."),
            {"anomalies": font["anomalies"], "method": font.get("method", "pdf_text_spans")},
            ["font"],
        ))
    if block["blockiness"] > 2.2:
        indicators.append(_indicator(
            "forensic.jpeg_blockiness",
            "Strong JPEG block boundaries",
            "info",
            f"Block-boundary gradient is {block['blockiness']:.2f}× the interior average. This usually reflects "
            "JPEG compression or re-saving rather than tampering.",
            {"blockiness": round(block["blockiness"], 3)},
            ["jpeg"],
        ))
    if block["sharpness"] < 35:
        indicators.append(_indicator(
            "forensic.low_sharpness",
            "Low image sharpness",
            "info",
            "Low Laplacian variance suggests blur or low-resolution scanning. This can reduce OCR "
            "reliability but is not evidence of tampering.",
            {"laplacian_variance": round(block["sharpness"], 2)},
            [],
        ))

    regions = _merge_regions(regions)

    preview_path = heatmap_path = overlay_path = None
    if save_artifacts:
        preview_path = save_pil_artifact(document.uuid, "preview", image)
        heatmap = Image.fromarray(ela["heatmap"])
        overlay = Image.fromarray(ela["overlay"])
        heatmap_path = save_pil_artifact(document.uuid, "ela_heatmap", heatmap)
        overlay_path = save_pil_artifact(document.uuid, "ela_overlay", overlay)

    estimated_quality = None
    raw_quality = None
    try:
        with Image.open(path) as probe:
            raw_quality = probe.info.get("quality")
        if raw_quality:
            estimated_quality = int(raw_quality)
    except Exception:
        pass

    return {
        "engine_version": ENGINE_VERSION,
        "analysis_pages": 1,
        "ela_mean": round(ela["mean"], 3),
        "ela_high_fraction": round(ela["high_fraction"], 4),
        "ela_outside_text_fraction": round(ela["outside_text_fraction"], 4),
        "copy_move_pairs": copy_move["pairs"],
        "copy_move_score": round(copy_move["score"], 3),
        "noise_outlier_fraction": round(noise["outlier_fraction"], 4),
        "blockiness": round(block["blockiness"], 3),
        "blur_score": round(block["sharpness"], 2),
        "estimated_quality": estimated_quality,
        "font_anomalies": font.get("anomalies", 0),
        "font_detail": font,
        "has_signature": bool(document.metadata_record.has_signature) if document.metadata_record else False,
        "signature_count": document.metadata_record.signature_count if document.metadata_record else 0,
        "incremental_updates": document.metadata_record.incremental_updates if document.metadata_record else 0,
        "regions": regions,
        "indicators": indicators,
        "preview_path": preview_path,
        "heatmap_path": heatmap_path,
        "overlay_path": overlay_path,
        "notes": "Baseline visual forensics on page 1 at up to 1600px. Indicators only — never proof of forgery.",
        "duration_ms": int((time.monotonic() - started) * 1000),
        "image_size": {"width": image.width, "height": image.height},
    }
