"""Extractor modular para Ciencuadras (ciencuadras.com)."""

from __future__ import annotations

import html
import json
import re
from typing import Optional

from bs4 import BeautifulSoup

from config import (
    ALLOWED_ESTRATOS,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    MAX_COSTO_TOTAL,
    MAX_PRECIO_VENTA,
)
from filters import is_in_barrio_whitelist
from models import RawListing
from scrapers.base import (
    build_session,
    fetch_text,
    parse_float,
    parse_int,
    playwright_page,
    random_delay,
)
from scrapers.gallery import extract_ciencuadras_gallery

PORTAL_NAME = "Ciencuadras"
BASE_URL = "https://www.ciencuadras.com"

SEARCH_PATHS_BY_OP = {
    "arriendo": [
        "/arriendo/apartamentos/bogota/usaquen",
        "/arriendo/apartamentos/bogota/suba",
    ],
    "venta": [
        "/venta/apartamentos/bogota/usaquen",
        "/venta/apartamentos/bogota/suba",
    ],
}


def _extract_result_state(html_text: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]+id="result-state"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if not match:
        return None
    raw_json = html.unescape(match.group(1).replace("&q;", '"'))
    return json.loads(raw_json)


def _passes_pre_detail_check(listing: RawListing) -> bool:
    """Pre-filtro rápido para enriquecer descripción/amenidades solo de candidatos viables."""
    if listing.area is None or listing.area <= 70:
        return False
    if listing.habitaciones is None or not (2 <= listing.habitaciones <= 3):
        return False
    if listing.banos is None or listing.banos < 2:
        return False
    if listing.parqueaderos is None or listing.parqueaderos < 1:
        return False
    if listing.estrato is None or listing.estrato not in ALLOWED_ESTRATOS:
        return False
    if listing.operacion == "venta":
        if listing.precio_venta is None or listing.precio_venta <= 0 or listing.precio_venta > MAX_PRECIO_VENTA:
            return False
    else:
        if listing.canon is None or listing.canon <= 0 or listing.canon > MAX_COSTO_TOTAL:
            return False

    if listing.latitud is not None and listing.longitud is not None:
        if not (LAT_MIN <= listing.latitud <= LAT_MAX and LON_MIN <= listing.longitud <= LON_MAX):
            return False
    else:
        ok, _ = is_in_barrio_whitelist(listing.barrio)
        if not ok:
            return False

    return True


def _enrich_detail(session, listing: RawListing) -> None:
    """Obtiene descripción y amenidades desde la ficha individual de Ciencuadras."""
    try:
        detail_html = fetch_text(session, listing.url, timeout=15)
    except Exception:
        return

    soup = BeautifulSoup(detail_html, "html.parser")
    text_parts: list[str] = []

    # Meta description y bloques de descripción/características
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        text_parts.append(str(meta_desc["content"]))

    for selector in [
        "[class*='description']",
        "[class*='Description']",
        "[class*='characteristic']",
        "[class*='amenity']",
        "[class*='feature']",
    ]:
        for el in soup.select(selector):
            txt = el.get_text(" ", strip=True)
            if txt:
                text_parts.append(txt)

    for li in soup.select("li"):
        txt = li.get_text(" ", strip=True)
        low = txt.lower()
        if txt and any(
            kw in low
            for kw in ("ascensor", "elevador", "balc", "terraza", "cocina", "sol", "luz", "vista", "mascota")
        ):
            text_parts.append(txt)

    if not text_parts:
        # Extraer texto visible del cuerpo evitando scripts/styles
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        text_parts.append(soup.get_text(" ", strip=True)[:5000])

    listing.descripcion = " ".join(text_parts)

    gallery_imgs = extract_ciencuadras_gallery(detail_html, prop_id=listing.external_id)
    if gallery_imgs:
        listing.fotos = gallery_imgs


def _parse_item(item: dict, operacion: str = "arriendo") -> Optional[RawListing]:
    prop_id = str(item.get("id") or "")
    rel_url = item.get("url") or ""
    if not prop_id or not rel_url:
        return None
    full_url = rel_url if rel_url.startswith("http") else f"{BASE_URL}{rel_url}"

    canon = parse_int(item.get("rentPrice")) if operacion == "arriendo" else None
    precio_venta = parse_int(item.get("salePrice")) if operacion == "venta" else None
    admin = parse_int(item.get("adminValue"))
    area = parse_float(item.get("area") or item.get("privateArea") or item.get("showCardArea"))
    habitaciones = parse_int(item.get("rooms"))
    banos = parse_int(item.get("baths"))
    parqueaderos = parse_int(item.get("garages"))
    estrato = parse_int(item.get("stratum"))

    coords = item.get("coordinates") or {}
    lat = coords.get("latitude")
    lon = coords.get("longitude")
    lat_f = float(lat) if lat is not None else None
    lon_f = float(lon) if lon is not None else None

    barrio = (
        item.get("neighborhoodUser")
        or item.get("neighborhood")
        or item.get("neighborhood_integrator")
        or ""
    )
    real_estate_type = str(item.get("realEstateType") or "Apartamento")
    op_label = "Venta" if operacion == "venta" else "Arriendo"
    titulo = f"{real_estate_type} en {op_label} en {barrio}, {item.get('city') or 'Bogotá'}".strip()
    direccion = str(item.get("address") or "").strip()

    ant_raw = str(item.get("antiquity") or "").strip()
    if ant_raw.isdigit():
        antiguedad = "Para estrenar" if int(ant_raw) == 0 else f"{ant_raw} años"
    else:
        antiguedad = ant_raw

    fotos_raw = [str(item["image"]).strip()] if item.get("image") else []
    user_type = str(item.get("userType") or "").lower()
    trato_directo = any(w in user_type for w in ("natural", "particular", "propietario"))

    return RawListing(
        portal=PORTAL_NAME,
        external_id=prop_id,
        url=full_url,
        titulo=titulo,
        descripcion="",
        barrio=str(barrio),
        direccion=direccion,
        latitud=lat_f,
        longitud=lon_f,
        area=area,
        habitaciones=habitaciones,
        banos=banos,
        parqueaderos=parqueaderos,
        estrato=estrato,
        canon=canon,
        administracion=admin,
        admin_incluida=False,
        es_edificio_o_conjunto=True,
        operacion=operacion,
        precio_venta=precio_venta,
        fotos=fotos_raw,
        antiguedad=antiguedad,
        trato_directo_hint=trato_directo,
    )


def _fetch_playwright_html(url: str) -> str:
    with playwright_page(headless=True) as page:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2500)
        return page.content()


def scrape_ciencuadras(max_pages_per_zone: int = 8, operacion: str = "arriendo") -> list[RawListing]:
    """Extrae ofertas en Bogotá Norte desde Ciencuadras para la operación indicada."""
    session = build_session()
    results: list[RawListing] = []
    seen_ids: set[str] = set()
    search_paths = SEARCH_PATHS_BY_OP.get(operacion, SEARCH_PATHS_BY_OP["arriendo"])

    for base_path in search_paths:
        for page_num in range(1, max_pages_per_zone + 1):
            url = f"{BASE_URL}{base_path}?page={page_num}"
            state = None
            try:
                html_text = fetch_text(session, url)
                state = _extract_result_state(html_text)
            except Exception:
                state = None

            if state is None:
                try:
                    html_text = _fetch_playwright_html(url)
                    state = _extract_result_state(html_text)
                except Exception as exc:
                    print(f"[Ciencuadras] Error cargando {url}: {exc}")
                    break

            if not state:
                break

            results_block = None
            for key, val in state.items():
                if key.startswith("results-") and isinstance(val, dict):
                    results_block = val.get("data") or {}
                    break

            if not results_block:
                break

            items = [
                *(results_block.get("highlights") or []),
                *(results_block.get("results") or []),
            ]
            if not items:
                break

            for raw_item in items:
                if not isinstance(raw_item, dict):
                    continue
                parsed = _parse_item(raw_item, operacion=operacion)
                if parsed and parsed.external_id not in seen_ids:
                    seen_ids.add(parsed.external_id)
                    if _passes_pre_detail_check(parsed):
                        _enrich_detail(session, parsed)
                        random_delay(0.4, 0.9)
                    results.append(parsed)

            total_pages = int(results_block.get("totalPages") or 1)
            if page_num >= total_pages:
                break

            random_delay(0.8, 1.6)

    return results
