"""Extractor modular para Metrocuadrado (metrocuadrado.com)."""

from __future__ import annotations

import json
import re
from typing import Optional

from models import RawListing
from scrapers.base import (
    build_session,
    fetch_text,
    parse_float,
    parse_int,
    playwright_page,
    random_delay,
)

PORTAL_NAME = "Metrocuadrado"
BASE_URL = "https://www.metrocuadrado.com"

ZONES = [
    "usaquen",
    "suba",
    "cedritos",
    "colina-campestre",
    "contador",
    "mazuren",
    "santa-barbara",
]


def _extract_next_f_chunks(html_text: str) -> str:
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


def _find_enclosing_json_object(text: str, key_pos: int) -> Optional[dict]:
    """Encuentra el objeto JSON que contiene a key_pos y lo decodifica."""
    decoder = json.JSONDecoder()
    # Buscamos los posibles inicios de objeto de anuncio antes de "midinmueble"
    search_start = max(0, key_pos - 2500)
    window = text[search_start:key_pos]
    for pattern in ('{"contactPhone"', '{"whatsapp"', '{"title"', '{"link"', '{"imageLink"'):
        rel_idx = window.rfind(pattern)
        if rel_idx != -1:
            try:
                obj, _ = decoder.raw_decode(text, search_start + rel_idx)
                if isinstance(obj, dict) and "midinmueble" in obj:
                    return obj
            except json.JSONDecodeError:
                continue

    # Respaldo: probar llaves '{' hacia atrás en un rango corto
    pos = key_pos
    while pos > search_start:
        pos = text.rfind("{", search_start, pos)
        if pos == -1:
            break
        try:
            obj, _ = decoder.raw_decode(text, pos)
            if isinstance(obj, dict) and "midinmueble" in obj:
                return obj
        except json.JSONDecodeError:
            continue
    return None


def _extract_items_from_html(html_text: str) -> list[dict]:
    decoded_payload = _extract_next_f_chunks(html_text)
    if not decoded_payload:
        decoded_payload = html_text.replace('\\"', '"')

    items: list[dict] = []
    seen_ids: set[str] = set()
    for match in re.finditer(r'"midinmueble"\s*:\s*"([^"]+)"', decoded_payload):
        prop_id = match.group(1)
        if prop_id in seen_ids:
            continue
        obj = _find_enclosing_json_object(decoded_payload, match.start())
        if obj:
            seen_ids.add(prop_id)
            items.append(obj)
    return items


def _parse_featured_flags(featured: object) -> list[str]:
    """Convierte la lista `featured` de Metrocuadrado a texto legible solo para flags activos (:S)."""
    if not isinstance(featured, list):
        return []
    tokens: list[str] = []
    mapping = {
        "concocinaamericana": "cocina tipo americano",
        "concocinaabierta": "cocina abierta",
        "conbalcon": "balcon",
        "conterraza": "terraza",
        "ascensor": "ascensor",
        "conascensor": "ascensor",
    }
    for entry in featured:
        text = str(entry).strip()
        if ":" not in text:
            continue
        key, val = text.split(":", 1)
        if val.strip().upper() != "S":
            continue
        key_clean = key.lower().replace("_", "").replace("-", "")
        for prefix, label in mapping.items():
            if key_clean.startswith(prefix):
                tokens.append(label)
    return tokens


def _parse_item(item: dict, operacion: str = "arriendo") -> Optional[RawListing]:
    prop_id = str(item.get("midinmueble") or "")
    link = item.get("link") or (item.get("data") or {}).get("murldetalle") or ""
    if not prop_id or not link:
        return None
    full_url = link if link.startswith("http") else f"{BASE_URL}{link}"

    canon = parse_int(item.get("mvalorarriendo")) if operacion == "arriendo" else None
    precio_venta = parse_int(item.get("mvalorventa")) if operacion == "venta" else None
    admin = parse_int(item.get("mvaloradministracion"))

    area_raw = item.get("marea") or item.get("mareac") or item.get("areaprivada")
    area = parse_float(area_raw)
    habitaciones = parse_int(item.get("mnrocuartos"))
    banos = parse_int(item.get("mnrobanos"))
    parqueaderos = parse_int(item.get("mnrogarajes"))
    estrato = parse_int(item.get("estrato"))

    loc = item.get("localizacion") or {}
    lat = loc.get("lat")
    lon = loc.get("lon")
    lat_f = float(lat) if lat is not None else None
    lon_f = float(lon) if lon is not None else None

    barrio = item.get("mnombrecomunbarrio") or item.get("mbarrio") or ""
    features_extra = _parse_featured_flags(item.get("featured"))
    descripcion = str(item.get("comment") or "")
    direccion = str(item.get("address") or "").strip()
    if not direccion and descripcion:
        addr_match = re.search(
            r"\b((?:Calle|Cll|Cl|Carrera|Cra|Cr|Avenida|Av|Transversal|Tv|Diagonal|Dg)\.?\s+\d+[A-Za-z]?\s*(?:#|No\.?|Nro\.?)\s*\d+[A-Za-z]?(?:\s*-\s*\d+)?)",
            descripcion,
            re.I,
        )
        if addr_match:
            direccion = addr_match.group(1).strip()

    return RawListing(
        portal=PORTAL_NAME,
        external_id=prop_id,
        url=full_url,
        titulo=str(item.get("title") or ""),
        descripcion=descripcion,
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
        features_extra=features_extra,
        operacion=operacion,
        precio_venta=precio_venta,
    )


def _fetch_playwright_html(url: str) -> str:
    with playwright_page(headless=True) as page:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3500)
        return page.content()


def scrape_metrocuadrado(operacion: str = "arriendo") -> list[RawListing]:
    """Extrae ofertas en Bogotá Norte desde Metrocuadrado para la operación indicada."""
    session = build_session()
    results: list[RawListing] = []
    seen_ids: set[str] = set()
    search_urls = [f"{BASE_URL}/apartamento/{operacion}/bogota/{zone}/" for zone in ZONES]

    for url in search_urls:
        items: list[dict] = []
        try:
            html_text = fetch_text(session, url)
            items = _extract_items_from_html(html_text)
        except Exception:
            items = []

        if not items:
            try:
                html_text = _fetch_playwright_html(url)
                items = _extract_items_from_html(html_text)
            except Exception as exc:
                print(f"[Metrocuadrado] Error cargando {url}: {exc}")
                continue

        for raw_item in items:
            parsed = _parse_item(raw_item, operacion=operacion)
            if parsed and parsed.external_id not in seen_ids:
                seen_ids.add(parsed.external_id)
                results.append(parsed)

        random_delay(0.8, 1.8)

    return results
