"""Reglas de filtrado estricto (Hard Filters), normalización y extracción de atributos."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from config import (
    ADMIN_ESTIMADA_POR_M2,
    ALLOWED_ESTRATOS,
    ASCENSOR_KEYWORDS,
    BALCONY_KEYWORDS,
    BARRIO_ALIASES,
    BARRIO_WHITELIST_ZONA,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    LON_ZONE_SPLIT,
    MAX_COSTO_TOTAL,
    MAX_HABITACIONES,
    MAX_PRECIO_VENTA,
    MIN_AREA_M2,
    MIN_BANOS,
    MIN_HABITACIONES,
    MIN_PARQUEADEROS,
    OPEN_KITCHEN_KEYWORDS,
)
from models import EvaluatedListing, RawListing
from scoring import calculate_score


def normalize_text(text: str) -> str:
    """Convierte a minúsculas, elimina tildes/diacríticos y normaliza espacios."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"\s+", " ", ascii_text.lower()).strip()
    return cleaned


def normalize_barrio(barrio: str) -> str:
    """Normaliza el nombre del barrio para whitelist y generación de fingerprint."""
    norm = normalize_text(barrio)
    if not norm:
        return "desconocido"

    # Limpia sufijos comunes de ciudad o localidad
    norm = re.sub(r"\b(bogota(\s+d\.?\s*c\.?)?|colombia|zona\s+norte|zona\s+urbana|zona\s+rural)\b", "", norm)
    norm = re.sub(r"[,;/\-]+", " ", norm)
    norm = re.sub(r"\s+", " ", norm).strip()

    if norm in BARRIO_ALIASES:
        return BARRIO_ALIASES[norm]

    for alias, canonical in sorted(BARRIO_ALIASES.items(), key=lambda x: -len(x[0])):
        if re.search(rf"\b{re.escape(alias)}\b", norm):
            return canonical

    return norm or "desconocido"


def is_in_geo_polygon(lat: Optional[float], lon: Optional[float]) -> bool:
    """Valida si las coordenadas están dentro del cuadrante norte de Bogotá."""
    if lat is None or lon is None:
        return False
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def is_in_barrio_whitelist(barrio_raw: str) -> tuple[bool, str]:
    """Valida el barrio contra la lista blanca cuando no existen coordenadas."""
    canon = normalize_barrio(barrio_raw)
    if canon in BARRIO_WHITELIST_ZONA:
        return True, canon

    norm = normalize_text(barrio_raw)
    if "santa barbara" in norm and "alta" not in norm:
        return True, "santa barbara norte"

    return False, canon


def determine_zona(lon: Optional[float], barrio_canon: str) -> str:
    """Determina si el inmueble está en Zona Oriental u Occidental."""
    if lon is not None:
        return "Oriental" if lon >= LON_ZONE_SPLIT else "Occidental"
    return BARRIO_WHITELIST_ZONA.get(barrio_canon, "Occidental")


def _build_searchable_text(titulo: str, descripcion: str, features: list[str]) -> str:
    combined = " ".join([titulo or "", descripcion or "", *(features or [])])
    return normalize_text(combined)


NEGATIVE_ELEVATOR_PHRASES: tuple[str, ...] = (
    "sin ascensor",
    "no tiene ascensor",
    "no cuenta con ascensor",
    "no posee ascensor",
)


def detect_elevator(titulo: str, descripcion: str, features: list[str]) -> bool:
    """Detecta si el conjunto/edificio cuenta con ascensor (requisito obligatorio)."""
    features_text = normalize_text(" ".join(features or []))
    has_negative_in_features = any(phrase in features_text for phrase in NEGATIVE_ELEVATOR_PHRASES)
    has_positive_in_features = any(
        re.search(rf"\b{re.escape(normalize_text(kw))}\b", features_text)
        for kw in ASCENSOR_KEYWORDS
    )
    if has_positive_in_features and not has_negative_in_features:
        return True

    text = _build_searchable_text(titulo, descripcion, features)
    if any(phrase in text for phrase in NEGATIVE_ELEVATOR_PHRASES):
        return False
    return any(
        re.search(rf"\b{re.escape(normalize_text(kw))}\b", text)
        for kw in ASCENSOR_KEYWORDS
    )


def detect_open_kitchen(titulo: str, descripcion: str, features: list[str]) -> bool:
    """Detecta si el anuncio menciona cocina abierta o tipo americano."""
    text = _build_searchable_text(titulo, descripcion, features)
    return any(normalize_text(kw) in text for kw in OPEN_KITCHEN_KEYWORDS)


def detect_balcony(titulo: str, descripcion: str, features: list[str]) -> bool:
    """Detecta si el anuncio menciona balcón o terraza."""
    text = _build_searchable_text(titulo, descripcion, features)
    return any(normalize_text(kw) in text for kw in BALCONY_KEYWORDS)


def build_fingerprint(
    barrio_normalizado: str,
    area: float,
    habitaciones: int,
    banos: int,
    parqueaderos: int,
    costo_total: int,
    operacion: str = "arriendo",
) -> str:
    """Construye la huella única para deduplicar inmuebles entre portales."""
    area_round = int(round(area))
    if operacion == "venta":
        precio_round = int(round(costo_total, -6))
        return f"venta|{barrio_normalizado}|{area_round}|{habitaciones}|{banos}|{parqueaderos}|{precio_round}"
    costo_round = int(round(costo_total, -4))
    return f"{barrio_normalizado}|{area_round}|{habitaciones}|{banos}|{parqueaderos}|{costo_round}"


def evaluate_listing(raw: RawListing) -> Optional[EvaluatedListing]:
    """Aplica los filtros estrictos; retorna EvaluatedListing si pasa todos, o None si se descarta."""
    # 1. Validar atributos físicos, estrato y ascensor obligatorio
    if raw.area is None or raw.area <= MIN_AREA_M2:
        return None
    if raw.habitaciones is None or not (MIN_HABITACIONES <= raw.habitaciones <= MAX_HABITACIONES):
        return None
    if raw.banos is None or raw.banos < MIN_BANOS:
        return None
    if raw.parqueaderos is None or raw.parqueaderos < MIN_PARQUEADEROS:
        return None
    if raw.estrato is None or raw.estrato not in ALLOWED_ESTRATOS:
        return None
    if not detect_elevator(raw.titulo, raw.descripcion, raw.features_extra):
        return None

    # 2. Validar polígono geográfico o lista blanca de barrios si faltan coordenadas
    barrio_canon = normalize_barrio(raw.barrio)
    if raw.latitud is not None and raw.longitud is not None:
        if not is_in_geo_polygon(raw.latitud, raw.longitud):
            return None
    else:
        in_whitelist, barrio_canon = is_in_barrio_whitelist(raw.barrio)
        if not in_whitelist:
            return None

    # 3. Validar presupuesto según operación (arriendo o venta)
    operacion = (raw.operacion or "arriendo").lower()
    administracion = raw.administracion if (raw.administracion is not None and raw.administracion > 0) else 0
    admin_estimada_flag = False

    if operacion == "venta":
        if raw.precio_venta is None or raw.precio_venta <= 0 or raw.precio_venta > MAX_PRECIO_VENTA:
            return None
        if administracion == 0 and raw.es_edificio_o_conjunto:
            administracion = int(round(raw.area * ADMIN_ESTIMADA_POR_M2))
            admin_estimada_flag = True
        canon = 0
        precio_venta = int(raw.precio_venta)
        costo_total = precio_venta
    else:
        if raw.canon is None or raw.canon <= 0:
            return None
        if administracion == 0 and not raw.admin_incluida and raw.es_edificio_o_conjunto:
            administracion = int(round(raw.area * ADMIN_ESTIMADA_POR_M2))
            admin_estimada_flag = True
        canon = int(raw.canon)
        precio_venta = 0
        costo_total = int(canon + administracion)
        if costo_total > MAX_COSTO_TOTAL:
            return None

    # 4. Atributos derivados y puntuación
    zona = determine_zona(raw.longitud, barrio_canon)
    cocina_abierta = detect_open_kitchen(raw.titulo, raw.descripcion, raw.features_extra)
    balcon = detect_balcony(raw.titulo, raw.descripcion, raw.features_extra)
    costo_m2 = round(costo_total / raw.area, 2)

    score = calculate_score(
        zona=zona,
        cocina_abierta=cocina_abierta,
        balcon=balcon,
        estrato=raw.estrato,
        area=raw.area,
        costo_total=costo_total,
        operacion=operacion,
    )

    fingerprint = build_fingerprint(
        barrio_normalizado=barrio_canon,
        area=raw.area,
        habitaciones=raw.habitaciones,
        banos=raw.banos,
        parqueaderos=raw.parqueaderos,
        costo_total=costo_total,
        operacion=operacion,
    )

    barrio_display = raw.barrio.strip() if raw.barrio and raw.barrio.strip() else barrio_canon.title()

    return EvaluatedListing(
        fingerprint=fingerprint,
        portal=raw.portal,
        url=raw.url,
        titulo=raw.titulo.strip(),
        descripcion=raw.descripcion.strip(),
        barrio=barrio_display,
        barrio_normalizado=barrio_canon,
        zona=zona,
        direccion=re.sub(r"\s+", " ", raw.direccion or "").strip(),
        latitud=raw.latitud,
        longitud=raw.longitud,
        area=round(float(raw.area), 2),
        habitaciones=int(raw.habitaciones),
        banos=int(raw.banos),
        parqueaderos=int(raw.parqueaderos),
        estrato=int(raw.estrato),
        canon=canon,
        administracion=int(administracion),
        costo_total=costo_total,
        admin_estimada_flag=admin_estimada_flag,
        cocina_abierta=cocina_abierta,
        balcon=balcon,
        costo_m2=costo_m2,
        score=score,
        portales_enlaces=[(raw.portal, raw.url)],
        operacion=operacion,
        precio_venta=precio_venta,
        tiene_ascensor=True,
    )
