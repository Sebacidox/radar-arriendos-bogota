"""Utilidades compartidas para los scrapers: sesión HTTP, rotación de User-Agent, delays y Playwright."""

from __future__ import annotations

import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from typing import Callable, Iterator, Optional

import requests
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from config import USER_AGENTS
from filters import detect_elevator, passes_pre_detail_checks
from models import RawListing


def get_random_user_agent() -> str:
    """Retorna un User-Agent aleatorio."""
    return random.choice(USER_AGENTS)


def random_delay(min_s: float = 0.8, max_s: float = 2.0) -> None:
    """Pausa aleatoria entre peticiones para evitar bloqueos."""
    time.sleep(random.uniform(min_s, max_s))


def build_session() -> requests.Session:
    """Crea una sesión HTTP con cabeceras de navegador realistas."""
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }
    )
    return session


def fetch_text(
    session: requests.Session,
    url: str,
    timeout: int = 20,
    headers: Optional[dict[str, str]] = None,
) -> str:
    """Descarga HTML o JSON rotando User-Agent."""
    req_headers = {"User-Agent": get_random_user_agent()}
    if headers:
        req_headers.update(headers)
    resp = session.get(url, headers=req_headers, timeout=timeout)
    resp.raise_for_status()
    return resp.text


@contextmanager
def playwright_page(headless: bool = True) -> Iterator[Page]:
    """Context manager para abrir una página headless de Playwright con UA rotado."""
    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(headless=headless)
        context: BrowserContext = browser.new_context(
            user_agent=get_random_user_agent(),
            locale="es-CO",
            viewport={"width": 1366, "height": 768},
        )
        page: Page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()


def parse_int(value: object) -> Optional[int]:
    """Convierte valores numéricos o strings con formato COP/entero a int."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(round(value))
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return int(digits) if digits else None


def parse_float(value: object) -> Optional[float]:
    """Convierte strings con coma o punto decimal a float."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("m²", "").replace("m2", "").strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    cleaned = "".join(ch for ch in text if ch.isdigit() or ch == ".")
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def needs_detail_enrichment(listing: RawListing) -> bool:
    """Determina si conviene consultar la ficha individual antes del filtro final."""
    if not passes_pre_detail_checks(listing):
        return False
    missing_elevator = not detect_elevator(
        listing.titulo, listing.descripcion, listing.features_extra
    )
    missing_rent_admin = (
        (listing.operacion or "arriendo").lower() == "arriendo"
        and not listing.admin_incluida
        and (listing.administracion is None or listing.administracion <= 0)
    )
    return missing_elevator or missing_rent_admin


def enrich_candidates_concurrently(
    listings: list[RawListing],
    enrich_fn: Callable[[requests.Session, RawListing], None],
    max_workers: int = 4,
) -> None:
    """Enriquece en paralelo solo candidatos viables con datos incompletos en tarjeta."""
    targets = [item for item in listings if needs_detail_enrichment(item)]
    if not targets:
        return

    def _run_one(item: RawListing) -> None:
        sess = build_session()
        enrich_fn(sess, item)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_run_one, item) for item in targets]
        for fut in as_completed(futures):
            try:
                fut.result()
            except Exception:
                continue
