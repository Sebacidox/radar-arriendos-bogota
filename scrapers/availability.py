"""Verificación directa de disponibilidad de anuncios por URL individual."""

from __future__ import annotations

import json
import re
import time
from typing import Optional
from urllib.parse import urlparse

import requests

from scrapers.base import build_session, get_random_user_agent


def _extract_title(html_text: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.I | re.S)
    return re.sub(r"\s+", " ", match.group(1)).strip().lower() if match else ""


def _extract_fincaraiz_property(html_text: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        html_text,
        re.S,
    )
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
        return data.get("props", {}).get("pageProps", {}).get("fetchResult", {}).get("property")
    except Exception:
        return None


def check_url_availability(
    portal: str,
    url: str,
    session: Optional[requests.Session] = None,
) -> str:
    """Consulta la URL individual y retorna 'AVAILABLE', 'UNAVAILABLE' o 'UNKNOWN'."""
    if not url or not url.startswith(("http://", "https://")):
        return "UNKNOWN"

    sess = session or build_session()
    try:
        resp = sess.get(
            url,
            headers={"User-Agent": get_random_user_agent()},
            allow_redirects=True,
            timeout=15,
        )
    except Exception:
        return "UNKNOWN"

    if resp.status_code in (404, 410):
        return "UNAVAILABLE"
    if resp.status_code in (401, 403, 429) or resp.status_code >= 500:
        return "UNKNOWN"
    if resp.status_code != 200:
        return "UNKNOWN"

    final_url = (resp.url or url).lower()
    domain = (urlparse(final_url).netloc or "").lower()
    title = _extract_title(resp.text)

    if "fincaraiz" in domain or "fincaraíz" in (portal or "").lower():
        # Si redirigió a la portada o listado sin ID numérico del inmueble
        path = urlparse(final_url).path.rstrip("/")
        last_segment = path.split("/")[-1] if path else ""
        if not last_segment.isdigit():
            return "UNAVAILABLE"
        if "404" in title or "no encontrada" in title or "no encontrado" in title:
            return "UNAVAILABLE"
        prop = _extract_fincaraiz_property(resp.text)
        if isinstance(prop, dict) and (
            prop.get("active") is False
            or prop.get("deleted") is True
            or prop.get("sold") is True
        ):
            return "UNAVAILABLE"
        return "AVAILABLE"

    if "metrocuadrado" in domain or "metrocuadrado" in (portal or "").lower():
        if "/inmueble/" not in final_url:
            return "UNAVAILABLE"
        if any(
            marker in title
            for marker in ("error 404", "page not found", "no encontrado", "no disponible")
        ):
            return "UNAVAILABLE"
        return "AVAILABLE"

    if "ciencuadras" in domain or "ciencuadras" in (portal or "").lower():
        if "/inmueble/" not in final_url:
            return "UNAVAILABLE"
        if title in ("", "ciencuadras") or any(
            marker in title for marker in ("no encontrado", "no disponible", "404")
        ):
            return "UNAVAILABLE"
        return "AVAILABLE"

    if any(
        marker in title
        for marker in ("404", "no disponible", "no encontrado", "page not found")
    ):
        return "UNAVAILABLE"
    return "AVAILABLE"


def check_listing_availability(
    portales_enlaces: list[tuple[str, str]],
    session: Optional[requests.Session] = None,
) -> str:
    """Evalúa hasta 3 enlaces del inmueble: 'AVAILABLE', 'UNAVAILABLE' o 'UNKNOWN'."""
    if not portales_enlaces:
        return "UNKNOWN"

    sess = session or build_session()
    saw_unavailable = False

    for idx, (portal, url) in enumerate(portales_enlaces[:3]):
        if idx > 0:
            time.sleep(0.4)
        status = check_url_availability(portal, url, session=sess)
        if status == "AVAILABLE":
            return "AVAILABLE"
        if status == "UNAVAILABLE":
            saw_unavailable = True

    return "UNAVAILABLE" if saw_unavailable else "UNKNOWN"
