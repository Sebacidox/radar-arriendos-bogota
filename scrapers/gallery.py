"""Extractor unificado de galerías completas desde fichas individuales de portales."""

from __future__ import annotations

import html
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from config import ADJUSTMENT_MAX_FOTOS
from filters import clean_fotos
from models import EvaluatedListing
from scrapers.base import build_session, fetch_text, random_delay

logger = logging.getLogger("radar-arriendos-bogota")


def extract_next_f_chunks(html_text: str) -> str:
    """Decodifica los fragmentos JSON embebidos en self.__next_f.push(...) de Next.js."""
    decoder = json.JSONDecoder()
    chunks: list[str] = []
    marker = "self.__next_f.push("
    pos = 0
    while True:
        idx = html_text.find(marker, pos)
        if idx == -1:
            break
        arr_start = html_text.find("[", idx + len(marker))
        if arr_start == -1:
            break
        try:
            parsed, end_idx = decoder.raw_decode(html_text, arr_start)
            if isinstance(parsed, list) and len(parsed) >= 2 and isinstance(parsed[1], str):
                chunks.append(parsed[1])
            pos = end_idx
        except json.JSONDecodeError:
            pos = idx + len(marker)
    return "\n".join(chunks)


def _extract_next_data_json(html_text: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def _infer_portal_from_url(url: str) -> str:
    low = url.lower()
    if "fincaraiz.com" in low:
        return "Fincaraíz"
    if "metrocuadrado.com" in low:
        return "Metrocuadrado"
    if "ciencuadras.com" in low:
        return "Ciencuadras"
    if "properati.com" in low:
        return "Properati"
    return ""


def extract_fincaraiz_gallery(html_text: str) -> list[str]:
    """Extrae todas las fotos de la galería desde una ficha individual de Fincaraíz."""
    data = _extract_next_data_json(html_text)
    if not data:
        return []
    page_props = data.get("props", {}).get("pageProps", {})
    prop_obj = page_props.get("data") or page_props.get("property") or {}
    if not isinstance(prop_obj, dict):
        return []

    urls: list[str] = []
    for img_obj in prop_obj.get("images") or []:
        if isinstance(img_obj, dict):
            u = img_obj.get("image") or img_obj.get("url") or img_obj.get("src")
            if u:
                urls.append(str(u))
        elif isinstance(img_obj, str):
            urls.append(img_obj)

    if not urls and prop_obj.get("img"):
        urls.append(str(prop_obj["img"]))

    return clean_fotos(urls)


def extract_metrocuadrado_gallery(html_text: str, prop_id: str = "") -> list[str]:
    """Extrae todas las fotos de la galería desde una ficha individual de Metrocuadrado."""
    payload = extract_next_f_chunks(html_text)
    if not payload:
        payload = html_text.replace('\\"', '"')

    decoder = json.JSONDecoder()
    best_urls: list[str] = []

    for match in re.finditer(r'"images"\s*:\s*\[', payload):
        bracket_idx = match.end() - 1
        try:
            arr, _ = decoder.raw_decode(payload, bracket_idx)
        except json.JSONDecodeError:
            continue
        if not isinstance(arr, list) or not arr:
            continue

        candidate_urls: list[str] = []
        matches_prop = False
        for item in arr:
            if isinstance(item, dict):
                u = item.get("image") or item.get("imageMobile") or item.get("url")
            elif isinstance(item, str):
                u = item
            else:
                u = None
            if not u:
                continue
            u_str = str(u).strip()
            if "multimedia.metrocuadrado.com" not in u_str:
                continue
            if prop_id and f"/{prop_id}/" in u_str:
                matches_prop = True
            candidate_urls.append(u_str)

        if not candidate_urls:
            continue
        if prop_id and matches_prop:
            return clean_fotos(candidate_urls)
        if len(candidate_urls) > len(best_urls):
            best_urls = candidate_urls

    if best_urls:
        return clean_fotos(best_urls)

    if prop_id:
        fallback = re.findall(
            rf"https://multimedia\.metrocuadrado\.com/{re.escape(prop_id)}/[^\s\"'\\<>]+?\.(?:jpg|jpeg|png|webp)",
            html_text,
            re.I,
        )
        return clean_fotos(fallback)

    return []


def extract_ciencuadras_gallery(html_text: str, prop_id: str = "") -> list[str]:
    """Extrae todas las fotos de la galería desde una ficha individual de Ciencuadras."""
    match = re.search(
        r'<script[^>]+id="detail-state"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if match:
        try:
            raw_json = html.unescape(match.group(1).replace("&q;", '"'))
            state = json.loads(raw_json)
            if isinstance(state, dict):
                for val in state.values():
                    if not isinstance(val, dict):
                        continue
                    data_obj = val.get("data")
                    if not isinstance(data_obj, dict):
                        continue
                    gallery_data = data_obj.get("galleryData")
                    if isinstance(gallery_data, dict):
                        flat_photos = gallery_data.get("flatPhotos") or []
                        if isinstance(flat_photos, list) and flat_photos:
                            ordered = sorted(
                                (p for p in flat_photos if isinstance(p, dict) and p.get("url")),
                                key=lambda p: int(p.get("order") or p.get("index") or 0),
                            )
                            urls = [str(p["url"]) for p in ordered]
                            if urls:
                                return clean_fotos(urls)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    if prop_id:
        fallback = re.findall(
            rf"https://www\.ciencuadras\.com/inmuebles/images/{re.escape(prop_id)}/[^\"'&\s<>]+",
            html_text,
        )
        return clean_fotos(fallback)

    return []


def extract_properati_gallery(html_text: str) -> list[str]:
    """Extrae todas las fotos disponibles desde una ficha individual de Properati."""
    data = _extract_next_data_json(html_text)
    if not data:
        return []
    page_props = data.get("props", {}).get("pageProps", {})

    def _walk(node: object) -> list[str]:
        if isinstance(node, dict):
            for key in ("images", "photos", "pictures"):
                val = node.get(key)
                if isinstance(val, list) and val:
                    urls: list[str] = []
                    for entry in val:
                        if isinstance(entry, dict):
                            u = entry.get("url") or entry.get("src") or entry.get("image")
                            if u:
                                urls.append(str(u))
                        elif isinstance(entry, str):
                            urls.append(entry)
                    cleaned = clean_fotos(urls)
                    if cleaned:
                        return cleaned
            for val in node.values():
                res = _walk(val)
                if res:
                    return res
        elif isinstance(node, list):
            for entry in node:
                res = _walk(entry)
                if res:
                    return res
        return []

    return _walk(page_props)


def fetch_portal_gallery(session, portal: str, url: str) -> list[str]:
    """Descarga una ficha individual y extrae todas las fotos únicas de esa plataforma."""
    if not url or not url.startswith(("http://", "https://")):
        return []

    portal_clean = (portal or "").strip() or _infer_portal_from_url(url)
    html_text = fetch_text(session, url, timeout=15)

    if "fincara" in portal_clean.lower():
        return extract_fincaraiz_gallery(html_text)
    if "metrocuadrado" in portal_clean.lower():
        prop_id = url.rstrip("/").split("/")[-1]
        return extract_metrocuadrado_gallery(html_text, prop_id=prop_id)
    if "ciencuadras" in portal_clean.lower():
        prop_id = url.rstrip("/").split("-")[-1]
        return extract_ciencuadras_gallery(html_text, prop_id=prop_id)
    if "properati" in portal_clean.lower():
        return extract_properati_gallery(html_text)
    return []


def _enrich_single_listing(
    item: EvaluatedListing,
    cached_fotos: list[str],
) -> tuple[bool, list[str]]:
    """Obtiene la galería completa de un inmueble desde sus enlaces si hace falta."""
    max_fotos: Optional[int] = (
        ADJUSTMENT_MAX_FOTOS if item.categoria_filtro == "ajuste_razonable" else None
    )
    current = clean_fotos(item.fotos, limit=max_fotos)
    if max_fotos is not None and len(current) >= max_fotos:
        return False, current
    if len(cached_fotos) > 5 and len(current) <= len(cached_fotos):
        return False, clean_fotos(cached_fotos, limit=max_fotos)

    session = build_session()
    best_gallery = current
    updated = False

    for portal, url in item.portales_enlaces:
        try:
            detail_fotos = fetch_portal_gallery(session, portal, url)
            random_delay(0.15, 0.35)
        except Exception as exc:
            logger.debug("[Galería] No se pudo enriquecer %s (%s): %s", portal, url, exc)
            continue

        if detail_fotos and (
            len(detail_fotos) > len(best_gallery)
            or (len(detail_fotos) == len(best_gallery) and detail_fotos != best_gallery)
        ):
            best_gallery = clean_fotos(detail_fotos, limit=max_fotos)
            updated = True

    if len(cached_fotos) > len(best_gallery):
        best_gallery = clean_fotos(cached_fotos, limit=max_fotos)

    return updated, clean_fotos(best_gallery, limit=max_fotos)


def enrich_listings_galleries(
    listings: list[EvaluatedListing],
    existing_fotos_by_fp: Optional[dict[str, list[str]]] = None,
    max_workers: int = 4,
) -> int:
    """Enriquece en paralelo las galerías completas de inmuebles filtrados."""
    if not listings:
        return 0

    cache = existing_fotos_by_fp or {}
    enriched_count = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(
                _enrich_single_listing,
                item,
                cache.get(item.fingerprint) or [],
            ): item
            for item in listings
        }
        for future in as_completed(future_map):
            item = future_map[future]
            try:
                was_updated, fotos = future.result()
                item.fotos = fotos
                if was_updated:
                    enriched_count += 1
            except Exception as exc:
                logger.debug("[Galería] Error inesperado enriqueciendo %s: %s", item.fingerprint, exc)

    return enriched_count
