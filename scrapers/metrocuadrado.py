"""Extractor modular para Metrocuadrado (metrocuadrado.com)."""

from __future__ import annotations

import json
import re
from typing import Optional

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
from scrapers.gallery import extract_next_f_chunks

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
    "barrancas",
    "alcala",
    "caobos-salazar",
    "las-villas",
    "iberia",
    "prado-veraniego",
    "chapinero",
    "chico-norte",
    "los-rosales",
    "pasadena",
    "niza",
    "la-floresta",
    "barrios-unidos",
]

_extract_next_f_chunks = extract_next_f_chunks


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


def _parse_featured_flags(featured: object) -> tuple[list[str], str]:
    """Extrae etiquetas legibles y antigüedad desde la lista `featured` de Metrocuadrado."""
    if not isinstance(featured, list):
        return [], ""
    tokens: list[str] = []
    antiguedad = ""
    mapping = {
        "concocinaamericana": "cocina tipo americano",
        "concocinaabierta": "cocina abierta",
        "conbalcon": "balcon",
        "conterraza": "terraza",
        "ascensor": "ascensor",
        "conascensor": "ascensor",
        "luzenlamanana": "sol en la manana",
        "luzenlatarde": "sol en la tarde",
        "convistapanoramica": "vista exterior",
    }
    for entry in featured:
        text = str(entry).strip()
        if ":" not in text:
            continue
        key, val = text.split(":", 1)
        key_clean = key.lower().replace("_", "").replace("-", "").strip()
        val_clean = val.strip()

        if key_clean == "tiempoconstruido" and val_clean:
            antiguedad = val_clean
            continue
        if key_clean == "vista" and val_clean.lower() == "exterior":
            tokens.append("vista exterior")
            continue

        if val_clean.upper() != "S":
            continue
        for prefix, label in mapping.items():
            if key_clean.startswith(prefix):
                tokens.append(label)
    return tokens, antiguedad


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
    features_extra, antiguedad = _parse_featured_flags(item.get("featured"))
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

    fotos_raw: list[str] = []
    if item.get("imageLink"):
        fotos_raw.append(str(item["imageLink"]))
    for photo_id in item.get("mgaleriainmueble") or []:
        if photo_id:
            fotos_raw.append(f"https://multimedia.metrocuadrado.com/{prop_id}/{photo_id}_p.jpg")

    trato_directo = str(item.get("OwnerType") or "").strip().lower() == "persona natural"

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
        fotos=fotos_raw,
        antiguedad=antiguedad,
        trato_directo_hint=trato_directo,
    )


def _enrich_detail(session, listing: RawListing) -> None:
    """Completa descripción y amenidades desde la ficha individual de Metrocuadrado."""
    try:
        detail_html = fetch_text(session, listing.url, timeout=15)
    except Exception:
        return

    payload = extract_next_f_chunks(detail_html) or detail_html.replace('\\"', '"')
    decoder = json.JSONDecoder()

    # Extraer descripción completa ("comment":"...")
    for match in re.finditer(r'"comment"\s*:\s*"', payload):
        try:
            comment_val, _ = decoder.raw_decode(payload, match.end() - 1)
            if isinstance(comment_val, str) and len(comment_val) > len(listing.descripcion):
                listing.descripcion = comment_val
        except json.JSONDecodeError:
            continue

    # Extraer grupos de características ("featured":[...])
    extra = list(listing.features_extra)
    seen = {x.lower() for x in extra}
    for match in re.finditer(r'"featured"\s*:\s*\[', payload):
        try:
            arr, _ = decoder.raw_decode(payload, match.end() - 1)
        except json.JSONDecodeError:
            continue
        if not isinstance(arr, list):
            continue
        for group in arr:
            if isinstance(group, dict):
                for feat in group.get("items") or group.get("features") or []:
                    label = feat.get("name") or feat.get("title") or feat.get("label") if isinstance(feat, dict) else feat
                    if label:
                        s_label = str(label).strip()
                        if s_label.lower() not in seen:
                            extra.append(s_label)
                            seen.add(s_label.lower())
            elif isinstance(group, str) and group.strip().lower() not in seen:
                extra.append(group.strip())
                seen.add(group.strip().lower())

    # Respaldo directo en el texto de la ficha por si el formato de featured cambia
    if not any("ascensor" in x.lower() for x in extra) and re.search(
        r"\bascensor(?:es)?\b", payload, re.I
    ):
        # Evitar falsos positivos de "sin ascensor"
        if not re.search(r"\b(?:sin|no\s+tiene|no\s+cuenta\s+con)\s+ascensor\b", payload, re.I):
            extra.append("ascensor")

    listing.features_extra = extra


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

    enrich_candidates_concurrently(results, _enrich_detail, max_workers=4)
    return results
