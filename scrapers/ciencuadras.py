"""Extractor modular para Ciencuadras (ciencuadras.com)."""

from __future__ import annotations

import html
import json
import re
from typing import Optional

from bs4 import BeautifulSoup

from filters import passes_pre_detail_checks
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
        "/arriendo/apartamentos/bogota/chapinero",
        "/arriendo/apartamentos/bogota/barrios-unidos",
    ],
    "venta": [
        "/venta/apartamentos/bogota/usaquen",
        "/venta/apartamentos/bogota/suba",
        "/venta/apartamentos/bogota/chapinero",
        "/venta/apartamentos/bogota/barrios-unidos",
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


def _enrich_detail(session, listing: RawListing) -> None:
    """Obtiene descripción, administración y amenidades desde la ficha individual de Ciencuadras."""
    try:
        detail_html = fetch_text(session, listing.url, timeout=15)
    except Exception:
        return

    soup = BeautifulSoup(detail_html, "html.parser")
    text_parts: list[str] = []

    # Intentar extraer también datos estructurados de detail-state si están presentes
    detail_match = re.search(
        r'<script[^>]+id="detail-state"[^>]*>(.*?)</script>',
        detail_html,
        re.S,
    )
    if detail_match:
        try:
            raw_json = html.unescape(detail_match.group(1).replace("&q;", '"'))
            state = json.loads(raw_json)
            if isinstance(state, dict):
                for val in state.values():
                    data_obj = val.get("data") if isinstance(val, dict) else None
                    if not isinstance(data_obj, dict):
                        continue
                    desc = data_obj.get("description") or data_obj.get("observations")
                    if desc:
                        text_parts.append(str(desc))
                    if (listing.administracion is None or listing.administracion <= 0) and data_obj.get("adminValue"):
                        adm_val = parse_int(data_obj.get("adminValue"))
                        if adm_val and adm_val > 0:
                            listing.administracion = adm_val
                    for key in ("amenities", "features", "characteristics", "interiorFeatures", "exteriorFeatures"):
                        items_arr = data_obj.get(key)
                        if isinstance(items_arr, list):
                            for entry in items_arr:
                                name = entry.get("name") or entry.get("description") if isinstance(entry, dict) else entry
                                if name:
                                    listing.features_extra.append(str(name).strip())
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

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
                    if passes_pre_detail_checks(parsed):
                        _enrich_detail(session, parsed)
                        random_delay(0.4, 0.9)
                    results.append(parsed)

            total_pages = int(results_block.get("totalPages") or 1)
            if page_num >= total_pages:
                break

            random_delay(0.8, 1.6)

    return results
