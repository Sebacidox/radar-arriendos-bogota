"""Extractor modular para Fincaraíz (fincaraiz.com.co)."""

from __future__ import annotations

import json
import re
from typing import Optional

from bs4 import BeautifulSoup

from config import (
    ADJUSTMENT_MAX_COSTO_TOTAL,
    ADJUSTMENT_MAX_PRECIO_VENTA,
    ADJUSTMENT_MIN_AREA_M2,
)
from models import RawListing
from scrapers.base import (
    build_session,
    enrich_candidates_concurrently,
    fetch_text,
    parse_float,
    parse_int,
    playwright_page,
    random_delay,
)

PORTAL_NAME = "Fincaraíz"
BASE_URL = "https://www.fincaraiz.com.co"

SEARCH_PATHS_BY_OP = {
    "arriendo": [
        f"/arriendo/apartamentos/bogota/usaquen/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_COSTO_TOTAL}",
        f"/arriendo/apartamentos/bogota/suba/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_COSTO_TOTAL}",
        f"/arriendo/apartamentos/bogota/chapinero/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_COSTO_TOTAL}",
        f"/arriendo/apartamentos/bogota/barrios-unidos/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_COSTO_TOTAL}",
    ],
    "venta": [
        f"/venta/apartamentos/bogota/usaquen/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_PRECIO_VENTA}",
        f"/venta/apartamentos/bogota/suba/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_PRECIO_VENTA}",
        f"/venta/apartamentos/bogota/chapinero/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_PRECIO_VENTA}",
        f"/venta/apartamentos/bogota/barrios-unidos/2-habitaciones-3-habitaciones/m2-desde-{int(ADJUSTMENT_MIN_AREA_M2)}/hasta-{ADJUSTMENT_MAX_PRECIO_VENTA}",
    ],
}


def _extract_next_data(html_text: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if not match:
        soup = BeautifulSoup(html_text, "html.parser")
        tag = soup.find("script", id="__NEXT_DATA__")
        if not tag or not tag.string:
            return None
        return json.loads(tag.string)
    return json.loads(match.group(1))


def _parse_item(item: dict, operacion: str = "arriendo") -> Optional[RawListing]:
    prop_id = str(item.get("id") or "")
    link = item.get("link") or ""
    if not prop_id or not link:
        return None
    full_url = link if link.startswith("http") else f"{BASE_URL}{link}"

    price_obj = item.get("price") or {}
    common_obj = item.get("commonExpenses") or {}

    price_amount = parse_int(price_obj.get("amount"))
    canon = price_amount if operacion == "arriendo" else None
    precio_venta = price_amount if operacion == "venta" else None
    admin = parse_int(common_obj.get("amount"))
    admin_included = bool(item.get("include_administration")) if operacion == "arriendo" else False

    area = parse_float(item.get("m2") or item.get("m2apto") or item.get("m2Built"))
    bedrooms = parse_int(item.get("bedrooms"))
    rooms = parse_int(item.get("rooms"))
    habitaciones = bedrooms if (bedrooms is not None and bedrooms > 0) else rooms

    banos = parse_int(item.get("bathrooms"))
    parqueaderos = parse_int(item.get("garage"))
    if parqueaderos is None and item.get("hasGarage") is False:
        parqueaderos = 0

    estrato = parse_int(item.get("stratum"))

    lat = item.get("latitude")
    lon = item.get("longitude")
    lat_f = float(lat) if lat is not None else None
    lon_f = float(lon) if lon is not None else None

    locations = item.get("locations") or {}
    loc_main = locations.get("location_main") or {}
    barrio = loc_main.get("name") or ""
    if not barrio:
        neighs = locations.get("neighbourhood") or []
        if neighs and isinstance(neighs[0], dict):
            barrio = neighs[0].get("name") or ""

    features_extra: list[str] = []
    antiguedad = ""
    for fac in item.get("facilities") or []:
        if isinstance(fac, dict) and fac.get("name"):
            features_extra.append(str(fac["name"]))
    for tech in item.get("technicalSheet") or []:
        if isinstance(tech, dict):
            field_name = tech.get("field") or ""
            val = tech.get("value") or ""
            text_label = str(tech.get("text") or "").lower()
            if field_name or val:
                features_extra.append(f"{field_name} {val}".strip())
            if not antiguedad and (field_name == "constructionYear" or "antig" in text_label) and val:
                antiguedad = str(val).strip()

    fotos_raw: list[str] = []
    if item.get("img"):
        fotos_raw.append(str(item["img"]))
    for img_obj in item.get("images") or []:
        if isinstance(img_obj, dict) and img_obj.get("image"):
            fotos_raw.append(str(img_obj["image"]))
        elif isinstance(img_obj, str):
            fotos_raw.append(img_obj)

    owner = item.get("owner") or {}
    trato_directo = bool(owner.get("particular")) or str(owner.get("type") or "").lower() == "particular"

    direccion = str(item.get("address") or "").strip() if item.get("showAddress", True) else ""

    return RawListing(
        portal=PORTAL_NAME,
        external_id=prop_id,
        url=full_url,
        titulo=str(item.get("title") or ""),
        descripcion=str(item.get("description") or ""),
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
        admin_incluida=admin_included,
        es_edificio_o_conjunto=True,
        features_extra=features_extra,
        operacion=operacion,
        precio_venta=precio_venta,
        fotos=fotos_raw,
        antiguedad=antiguedad,
        trato_directo_hint=trato_directo,
    )


def _enrich_detail(session, listing: RawListing) -> None:
    """Completa descripción, amenidades, administración y fotos desde la ficha de Fincaraíz."""
    try:
        detail_html = fetch_text(session, listing.url, timeout=15)
        data = _extract_next_data(detail_html)
    except Exception:
        return
    if not data:
        return

    page_props = data.get("props", {}).get("pageProps", {})
    prop = page_props.get("data") or page_props.get("property") or {}
    if not isinstance(prop, dict):
        return

    desc = str(prop.get("description") or "").strip()
    if len(desc) > len(listing.descripcion):
        listing.descripcion = desc

    extra = list(listing.features_extra)
    seen = {x.lower() for x in extra}
    for fac in prop.get("facilities") or []:
        if isinstance(fac, dict) and fac.get("name"):
            name = str(fac["name"]).strip()
            if name.lower() not in seen:
                extra.append(name)
                seen.add(name.lower())
    listing.features_extra = extra

    if prop.get("include_administration"):
        listing.admin_incluida = True
    common_amt = parse_int((prop.get("commonExpenses") or {}).get("amount"))
    if (listing.administracion is None or listing.administracion <= 0) and common_amt and common_amt > 0:
        listing.administracion = common_amt

    imgs: list[str] = []
    for img_obj in prop.get("images") or []:
        if isinstance(img_obj, dict) and img_obj.get("image"):
            imgs.append(str(img_obj["image"]))
        elif isinstance(img_obj, str):
            imgs.append(img_obj)
    if len(imgs) > len(listing.fotos):
        listing.fotos = imgs


def _fetch_page_playwright(url: str) -> str:
    with playwright_page(headless=True) as page:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        random_delay(1.5, 3.0)
        return page.content()


def scrape_fincaraiz(max_pages_per_zone: int = 8, operacion: str = "arriendo") -> list[RawListing]:
    """Extrae ofertas en Bogotá Norte desde Fincaraíz para la operación indicada."""
    session = build_session()
    results: list[RawListing] = []
    seen_ids: set[str] = set()
    search_paths = SEARCH_PATHS_BY_OP.get(operacion, SEARCH_PATHS_BY_OP["arriendo"])

    for base_path in search_paths:
        for page_num in range(1, max_pages_per_zone + 1):
            path = base_path if page_num == 1 else f"{base_path}/pagina{page_num}"
            url = f"{BASE_URL}{path}"

            html_text = ""
            data = None
            try:
                html_text = fetch_text(session, url)
                data = _extract_next_data(html_text)
            except Exception:
                data = None

            if data is None:
                try:
                    html_text = _fetch_page_playwright(url)
                    data = _extract_next_data(html_text)
                except Exception as exc:
                    print(f"[Fincaraíz] Error cargando {url}: {exc}")
                    break

            if not data:
                break

            search_fast = (
                data.get("props", {})
                .get("pageProps", {})
                .get("fetchResult", {})
                .get("searchFast", {})
            )
            hits = search_fast.get("data") or []
            if not hits:
                break

            for raw_item in hits:
                parsed = _parse_item(raw_item, operacion=operacion)
                if parsed and parsed.external_id not in seen_ids:
                    seen_ids.add(parsed.external_id)
                    results.append(parsed)

            paginator = search_fast.get("paginatorInfo") or {}
            if not paginator.get("hasMorePages"):
                break

            random_delay(0.7, 1.5)

    enrich_candidates_concurrently(results, _enrich_detail, max_workers=4)
    return results
