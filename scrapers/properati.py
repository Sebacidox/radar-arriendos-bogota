"""Extractor modular para Properati (properati.com.co)."""

from __future__ import annotations

import json
import re
from typing import Optional

from bs4 import BeautifulSoup

from models import RawListing
from scrapers.base import (
    build_session,
    fetch_text,
    parse_float,
    parse_int,
    playwright_page,
    random_delay,
)

PORTAL_NAME = "Properati"
BASE_URL = "https://www.properati.com.co"

SEARCH_SLUGS = [
    "bogota-d-c-colombia",
    "usaquen-bogota-d-c-colombia",
    "suba-bogota-d-c-colombia",
]


def _extract_next_data(html_text: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if not match:
        return None
    return json.loads(match.group(1))


def _parse_next_data_items(data: dict, operacion: str = "arriendo") -> list[RawListing]:
    listings: list[RawListing] = []
    page_props = data.get("props", {}).get("pageProps", {})
    raw_items = (
        page_props.get("listings")
        or page_props.get("results")
        or page_props.get("properties")
        or []
    )

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        prop_id = str(item.get("id") or item.get("listing_id") or "")
        url_path = item.get("url") or item.get("permalink") or ""
        if not prop_id or not url_path:
            continue
        full_url = url_path if url_path.startswith("http") else f"{BASE_URL}{url_path}"

        price = item.get("price")
        price_val = parse_int(price.get("amount") if isinstance(price, dict) else price)
        canon = price_val if operacion == "arriendo" else None
        precio_venta = price_val if operacion == "venta" else None
        admin = parse_int(item.get("expenses") or item.get("administration"))

        features = item.get("features") or {}
        features_extra: list[str] = []
        if isinstance(features, dict):
            for k, v in features.items():
                if v:
                    features_extra.append(f"{k} {v}")
        elif isinstance(features, list):
            features_extra.extend(str(x) for x in features if x)
        for am in item.get("amenities") or []:
            features_extra.append(str(am))

        area = parse_float(
            item.get("surface_covered")
            or item.get("surface_total")
            or item.get("area")
            or (features.get("area") if isinstance(features, dict) else None)
        )
        habitaciones = parse_int(
            item.get("bedrooms") or (features.get("bedrooms") if isinstance(features, dict) else None)
        )
        banos = parse_int(
            item.get("bathrooms") or (features.get("bathrooms") if isinstance(features, dict) else None)
        )
        parqueaderos = parse_int(
            item.get("garages")
            or item.get("parking")
            or (features.get("garages") if isinstance(features, dict) else None)
        )
        estrato = parse_int(
            item.get("stratum") or (features.get("stratum") if isinstance(features, dict) else None)
        )

        geo = item.get("geo") or item.get("coordinates") or {}
        lat = geo.get("lat") or geo.get("latitude")
        lon = geo.get("lon") or geo.get("lng") or geo.get("longitude")
        lat_f = float(lat) if lat is not None else None
        lon_f = float(lon) if lon is not None else None

        place = item.get("place") or {}
        barrio = place.get("name") or item.get("neighborhood") or ""
        direccion = str(item.get("address") or place.get("address") or "").strip()

        fotos_raw: list[str] = []
        for img_entry in (item.get("images") or item.get("photos") or item.get("pictures") or []):
            if isinstance(img_entry, dict):
                u = img_entry.get("url") or img_entry.get("src") or img_entry.get("image")
                if u:
                    fotos_raw.append(str(u))
            elif isinstance(img_entry, str):
                fotos_raw.append(img_entry)

        antiguedad = str(
            item.get("age")
            or item.get("antiquity")
            or (features.get("antiquity") if isinstance(features, dict) else "")
            or ""
        ).strip()
        trato_directo = bool(item.get("is_owner")) or str(item.get("publisher_type") or "").lower() in (
            "owner",
            "particular",
            "persona natural",
        )

        listings.append(
            RawListing(
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
                admin_incluida=False,
                es_edificio_o_conjunto=True,
                features_extra=features_extra,
                operacion=operacion,
                precio_venta=precio_venta,
                fotos=fotos_raw,
                antiguedad=antiguedad,
                trato_directo_hint=trato_directo,
            )
        )
    return listings


def _parse_html_cards(html_text: str, operacion: str = "arriendo") -> list[RawListing]:
    soup = BeautifulSoup(html_text, "html.parser")
    listings: list[RawListing] = []
    for card in soup.select("article[data-idanuncio], div[data-test='listing-card'], a.listing-card"):
        href = card.get("href") or (card.find("a") or {}).get("href") or ""
        if not href:
            continue
        full_url = href if href.startswith("http") else f"{BASE_URL}{href}"
        ext_id = str(card.get("data-idanuncio") or href.rstrip("/").split("-")[-1])
        text = card.get_text(" ", strip=True)
        price_m = re.search(r"\$\s*([\d.,]+)", text)
        area_m = re.search(r"(\d+(?:[.,]\d+)?)\s*m²", text, re.I)
        hab_m = re.search(r"(\d+)\s*hab", text, re.I)
        ban_m = re.search(r"(\d+)\s*bañ", text, re.I)
        price_val = parse_int(price_m.group(1)) if price_m else None
        listings.append(
            RawListing(
                portal=PORTAL_NAME,
                external_id=ext_id,
                url=full_url,
                titulo=text[:120],
                descripcion=text,
                canon=price_val if operacion == "arriendo" else None,
                area=parse_float(area_m.group(1)) if area_m else None,
                habitaciones=parse_int(hab_m.group(1)) if hab_m else None,
                banos=parse_int(ban_m.group(1)) if ban_m else None,
                operacion=operacion,
                precio_venta=price_val if operacion == "venta" else None,
            )
        )
    return listings


def _fetch_playwright_html(url: str) -> str:
    with playwright_page(headless=True) as page:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)
        if resp and resp.status in (401, 403):
            raise RuntimeError(f"Bloqueado por Properati (HTTP {resp.status})")
        random_delay(1.5, 3.0)
        body_text = page.inner_text("body")
        if "Access Denied" in body_text and len(body_text) < 200:
            raise RuntimeError("Bloqueado por Properati (Access Denied)")
        return page.content()


def scrape_properati(operacion: str = "arriendo") -> list[RawListing]:
    """Extrae ofertas en Bogotá desde Properati para la operación indicada."""
    session = build_session()
    results: list[RawListing] = []
    seen_ids: set[str] = set()
    blocked_errors: list[str] = []
    search_urls = [f"{BASE_URL}/s/{slug}/apartamento/{operacion}" for slug in SEARCH_SLUGS]

    for url in search_urls:
        html_text = ""
        try:
            html_text = fetch_text(session, url)
        except Exception as http_exc:
            try:
                html_text = _fetch_playwright_html(url)
            except Exception as pw_exc:
                blocked_errors.append(f"{url} -> HTTP({http_exc}) / PW({pw_exc})")
                continue

        next_data = _extract_next_data(html_text)
        parsed = (
            _parse_next_data_items(next_data, operacion=operacion)
            if next_data
            else _parse_html_cards(html_text, operacion=operacion)
        )
        for item in parsed:
            if item.external_id not in seen_ids:
                seen_ids.add(item.external_id)
                results.append(item)

        random_delay(0.8, 1.8)

    if not results and blocked_errors:
        raise RuntimeError(f"No fue posible extraer datos de Properati: {blocked_errors[0]}")

    return results
