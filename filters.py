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
    BARRIO_CENTROIDS,
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
    QUADRANT_DEFAULT_CENTROID_OCCIDENTAL,
    QUADRANT_DEFAULT_CENTROID_ORIENTAL,
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


def resolve_coordinates(
    lat: Optional[float],
    lon: Optional[float],
    barrio_canon: str,
    zona: str,
) -> tuple[float, float]:
    """Devuelve coordenadas del portal o el centroide aproximado del barrio."""
    if lat is not None and lon is not None:
        return round(float(lat), 6), round(float(lon), 6)
    if barrio_canon in BARRIO_CENTROIDS:
        return BARRIO_CENTROIDS[barrio_canon]
    if zona == "Oriental":
        return QUADRANT_DEFAULT_CENTROID_ORIENTAL
    return QUADRANT_DEFAULT_CENTROID_OCCIDENTAL


_M2_PHOTO_RE = re.compile(
    r"^(https?://multimedia\.metrocuadrado\.com/[^/]+/[^/]+?)_(p|m|g|h|x)\.(jpg|jpeg|png|webp)(?:\?.*)?$",
    re.I,
)
_M2_QUALITY_RANK = {"x": 5, "h": 4, "g": 3, "m": 2, "p": 1}


def _photo_dedup_key(url: str) -> tuple[str, int]:
    """Genera clave canónica para deduplicar variantes de tamaño de una misma foto."""
    m = _M2_PHOTO_RE.match(url)
    if m:
        base_id = m.group(1).lower()
        size_code = m.group(2).lower()
        return f"m2:{base_id}", _M2_QUALITY_RANK.get(size_code, 0)
    return url, 1


def clean_fotos(fotos: list[str], limit: Optional[int] = None) -> list[str]:
    """Filtra y deduplica URLs limpias de imágenes sin tope artificial salvo que se indique."""
    cleaned: list[str] = []
    index_by_key: dict[str, tuple[int, int]] = {}
    for url in fotos or []:
        u = str(url or "").strip()
        if not u.startswith(("http://", "https://")):
            continue
        key, quality = _photo_dedup_key(u)
        if key not in index_by_key:
            if limit is not None and len(cleaned) >= limit:
                break
            index_by_key[key] = (len(cleaned), quality)
            cleaned.append(u)
        else:
            pos, prev_quality = index_by_key[key]
            if quality > prev_quality:
                cleaned[pos] = u
                index_by_key[key] = (pos, quality)
    return cleaned


def detect_antiquity(antiguedad_raw: str, titulo: str, descripcion: str) -> str:
    """Extrae o normaliza el rango de antigüedad del edificio."""
    raw_clean = re.sub(r"\s+", " ", str(antiguedad_raw or "")).strip()
    if raw_clean:
        return raw_clean

    text = normalize_text(f"{titulo} {descripcion}")
    patterns = [
        r"(entre\s+\d+\s+y\s+\d+\s+anos)",
        r"(mas\s+de\s+\d+\s+anos)",
        r"(menos\s+de\s+\d+\s+anos)",
        r"(\d+\s+a\s+\d+\s+anos)",
        r"(\d+\s+anos\s+de\s+(?:construido|antiguedad))",
        r"\b(para\s+estrenar|sobre\s+planos|en\s+construccion|remodelado)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            found = m.group(1).replace("anos", "años").replace("mas ", "más ")
            return found.capitalize()
    return "No especificada"


def detect_comfort_tags(raw: RawListing, has_elevator: bool = True) -> str:
    """Detecta etiquetas de confort y ruido vial desde título, descripción y dirección."""
    text = _build_searchable_text(raw.titulo, raw.descripcion, raw.features_extra)
    addr_and_text = normalize_text(
        " ".join([raw.titulo or "", raw.descripcion or "", raw.direccion or "", *(raw.features_extra or [])])
    )
    tags: list[str] = []

    if any(
        kw in text
        for kw in (
            "sol de la manana",
            "sol en la manana",
            "sol manana",
            "luz en la manana",
            "luz manana",
            "luz de la manana",
            "sol en las mananas",
        )
    ):
        tags.append("Sol mañana")

    if any(
        kw in text
        for kw in (
            "sol de la tarde",
            "sol en la tarde",
            "sol tarde",
            "luz en la tarde",
            "luz tarde",
            "luz de la tarde",
            "sol en las tardes",
        )
    ):
        tags.append("Sol tarde")

    if "vista interior" not in text and any(
        kw in text
        for kw in ("vista exterior", "vista panoramica", "exterior", "con vista")
    ):
        tags.append("Vista exterior")

    if has_elevator:
        tags.append("Ascensor")

    via_principal_pattern = (
        r"\b(?:cra|carrera|cr)\.?\s*0?[79]\b"
        r"|\b(?:calle|cll|cl)\.?\s*(?:127|134|147)\b"
        r"|\b(?:autopista\s+norte|autonorte|auto\s*norte)\b"
    )
    if re.search(via_principal_pattern, addr_and_text):
        tags.append("Vía principal (posible ruido)")

    if raw.trato_directo_hint or any(
        kw in text
        for kw in (
            "trato directo",
            "directo con dueno",
            "directo con el dueno",
            "directamente con el propietario",
            "sin intermediarios",
            "propietario directo",
            "persona natural",
        )
    ):
        tags.append("Trato directo")

    negative_pets = (
        "no acepta mascotas",
        "no se aceptan mascotas",
        "no admite mascotas",
        "no permiten mascotas",
        "sin mascotas",
        "prohibido mascotas",
    )
    if not any(neg in text for neg in negative_pets) and any(
        kw in text
        for kw in (
            "acepta mascotas",
            "admite mascotas",
            "permiten mascotas",
            "mascotas permitidas",
            "se aceptan mascotas",
            "pet friendly",
            "petfriendly",
        )
    ):
        tags.append("Acepta mascotas")

    return ", ".join(tags)


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
    lat_resolved, lon_resolved = resolve_coordinates(
        raw.latitud, raw.longitud, barrio_canon, zona
    )
    cocina_abierta = detect_open_kitchen(raw.titulo, raw.descripcion, raw.features_extra)
    balcon = detect_balcony(raw.titulo, raw.descripcion, raw.features_extra)
    costo_m2 = round(costo_total / raw.area, 2)
    fotos_limpias = clean_fotos(raw.fotos)
    antiguedad = detect_antiquity(raw.antiguedad, raw.titulo, raw.descripcion)
    etiquetas_confort = detect_comfort_tags(raw, has_elevator=True)

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
        latitud=lat_resolved,
        longitud=lon_resolved,
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
        fotos=fotos_limpias,
        antiguedad=antiguedad,
        dias_en_mercado=0,
        etiquetas_confort=etiquetas_confort,
    )
