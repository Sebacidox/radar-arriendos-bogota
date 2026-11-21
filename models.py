"""Modelos de datos normalizados para los inmuebles extraídos y procesados."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RawListing:
    """Representa un anuncio extraído de un portal antes de filtrado y deduplicación."""

    portal: str
    external_id: str
    url: str
    titulo: str
    descripcion: str = ""
    barrio: str = ""
    direccion: str = ""
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    area: Optional[float] = None
    habitaciones: Optional[int] = None
    banos: Optional[int] = None
    parqueaderos: Optional[int] = None
    estrato: Optional[int] = None
    canon: Optional[int] = None
    administracion: Optional[int] = None
    admin_incluida: bool = False
    es_edificio_o_conjunto: bool = True
    features_extra: list[str] = field(default_factory=list)
    operacion: str = "arriendo"
    precio_venta: Optional[int] = None
    fotos: list[str] = field(default_factory=list)
    antiguedad: str = ""
    trato_directo_hint: bool = False


@dataclass
class EvaluatedListing:
    """Inmueble validado contra reglas estrictas, normalizado y puntuado."""

    fingerprint: str
    portal: str
    url: str
    titulo: str
    descripcion: str
    barrio: str
    barrio_normalizado: str
    zona: str  # "Oriental" | "Occidental"
    latitud: Optional[float]
    longitud: Optional[float]
    area: float
    habitaciones: int
    banos: int
    parqueaderos: int
    estrato: int
    canon: int
    administracion: int
    costo_total: int
    admin_estimada_flag: bool
    cocina_abierta: bool
    balcon: bool
    costo_m2: float
    score: float
    estado: str = "NUEVO"
    ahorro_cop: int = 0
    portales_enlaces: list[tuple[str, str]] = field(default_factory=list)
    fecha_primera_deteccion: str = ""
    fecha_ultima_deteccion: str = ""
    direccion: str = ""
    operacion: str = "arriendo"
    precio_venta: int = 0
    tiene_ascensor: bool = True
    fotos: list[str] = field(default_factory=list)
    antiguedad: str = ""
    dias_en_mercado: int = 0
    etiquetas_confort: str = ""
