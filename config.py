"""Configuración global, constantes de filtrado, puntuación y rutas para radar-arriendos-bogota."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SPREADSHEET_ID: str = os.getenv("SPREADSHEET_ID", "").strip()
GOOGLE_CREDENTIALS_JSON: str = os.getenv("GOOGLE_CREDENTIALS_JSON", "credentials.json").strip()
DB_PATH: Path = BASE_DIR / "arriendos.db"

# Polígono geográfico estricto (Calle 100 a Calle 153, Cra 7ª a Colina Campestre / Av. Boyacá)
LAT_MIN: float = 4.6835
LAT_MAX: float = 4.7365
LON_MIN: float = -74.0720
LON_MAX: float = -74.0240

# División Zona Oriental vs Zona Occidental (Autopista Norte)
LON_ZONE_SPLIT: float = -74.0485

# Lista blanca de barrios (fallback cuando no hay coordenadas) y su zona esperada
BARRIO_WHITELIST_ZONA: dict[str, str] = {
    "santa barbara norte": "Oriental",
    "contador": "Oriental",
    "cedritos": "Oriental",
    "barrancas": "Oriental",
    "caobos": "Oriental",
    "alcala": "Occidental",
    "prado veraniego norte": "Occidental",
    "las villas": "Occidental",
    "iberia": "Occidental",
    "colina campestre": "Occidental",
    "mazuren": "Occidental",
}

# Centroides aproximados (lat, lng) para barrios de la lista blanca sin coordenadas del portal
BARRIO_CENTROIDS: dict[str, tuple[float, float]] = {
    "santa barbara norte": (4.7025, -74.0395),
    "contador": (4.7165, -74.0415),
    "cedritos": (4.7215, -74.0355),
    "barrancas": (4.7285, -74.0295),
    "caobos": (4.7245, -74.0415),
    "alcala": (4.7190, -74.0535),
    "prado veraniego norte": (4.7155, -74.0575),
    "las villas": (4.7120, -74.0630),
    "iberia": (4.7195, -74.0645),
    "colina campestre": (4.7280, -74.0655),
    "mazuren": (4.7325, -74.0545),
}
QUADRANT_DEFAULT_CENTROID_ORIENTAL: tuple[float, float] = (4.7150, -74.0370)
QUADRANT_DEFAULT_CENTROID_OCCIDENTAL: tuple[float, float] = (4.7180, -74.0600)

# Aliases habituales en portales colombianos mapeados al nombre canónico de la lista blanca
BARRIO_ALIASES: dict[str, str] = {
    "el contador": "contador",
    "los caobos": "caobos",
    "caobos salazar": "caobos",
    "los cedros": "cedritos",
    "cedritos": "cedritos",
    "barrancas norte": "barrancas",
    "barrancas": "barrancas",
    "la colina campestre": "colina campestre",
    "colina campestre": "colina campestre",
    "prado veraniego norte": "prado veraniego norte",
    "prado veraniego": "prado veraniego norte",
    "santa barbara norte": "santa barbara norte",
    "alcala": "alcala",
    "las villas": "las villas",
    "iberia": "iberia",
    "mazuren": "mazuren",
    "el chico": "chico",
    "chico norte ii": "chico norte",
    "chico norte iii": "chico norte",
    "chico norte": "chico norte",
    "chico reservado": "chico reservado",
    "chico navarra": "chico navarra",
    "santa barbara central": "santa barbara central",
    "santa barbara occidental": "santa barbara occidental",
    "niza norte": "niza",
    "niza sur": "niza",
    "niza": "niza",
    "los rosales": "los rosales",
    "el refugio": "el refugio",
    "floresta": "la floresta",
    "la floresta": "la floresta",
    "pontevedra": "pontevedra",
    "pasadena": "pasadena",
    "molinos norte": "molinos norte",
    "san patricio": "san patricio",
    "la carolina": "la carolina",
    "country club": "country club",
    "bella suiza": "bella suiza",
    "santa bibiana": "santa bibiana",
    "andes norte": "andes norte",
    "rionegro": "rionegro",
}

# Reglas de filtrado estricto (Hard Filters)
MIN_AREA_M2: float = 70.0
MIN_HABITACIONES: int = 2
MAX_HABITACIONES: int = 3
MIN_BANOS: int = 2
MIN_PARQUEADEROS: int = 1
ALLOWED_ESTRATOS: frozenset[int] = frozenset({3, 4, 5})
TARGET_MAX_COSTO_TOTAL: int = 3_500_000
MAX_COSTO_TOTAL: int = 3_800_000
MAX_PRECIO_VENTA: int = 800_000_000
ADMIN_ESTIMADA_POR_M2: int = 5_500
RENT_OVER_TARGET_BASE_PENALTY: float = 1.0
RENT_OVER_TARGET_MAX_EXTRA_PENALTY: float = 2.0

# Reglas de tolerancia para "Ajustes Razonables" (máximo 2 parámetros flexibles a la vez)
ADJUSTMENT_MIN_AREA_M2: float = 65.0
ADJUSTMENT_MAX_COSTO_TOTAL: int = 4_200_000
ADJUSTMENT_MAX_PRECIO_VENTA: int = 850_000_000
ADJUSTMENT_MAX_DISTANCE_KM: float = 9.0
ADJUSTMENT_MAX_FAILED_PARAMS: int = 2
ADJUSTMENT_MAX_FOTOS: int = 10

FAMILY_LOCATIONS_COORDS: dict[str, tuple[float, float]] = {
    "Gloria": (4.72495, -74.03345),
    "Ángela": (4.700921, -74.053909),
    "Beatriz": (4.666094, -74.075093),
}

ADJUSTMENT_BARRIO_WHITELIST_ZONA: dict[str, str] = {
    "santa barbara central": "Oriental",
    "santa barbara occidental": "Occidental",
    "chico norte": "Oriental",
    "chico": "Oriental",
    "chico reservado": "Oriental",
    "chico navarra": "Occidental",
    "los rosales": "Oriental",
    "el refugio": "Oriental",
    "cabrera": "Oriental",
    "usaquen": "Oriental",
    "pasadena": "Occidental",
    "niza": "Occidental",
    "la floresta": "Occidental",
    "pontevedra": "Occidental",
    "la carolina": "Oriental",
    "country club": "Oriental",
    "san patricio": "Oriental",
    "molinos norte": "Oriental",
    "navarra": "Occidental",
    "bella suiza": "Oriental",
    "santa bibiana": "Oriental",
    "andes norte": "Occidental",
    "rionegro": "Occidental",
    "gratamira": "Occidental",
    "sotileza": "Occidental",
}

ADJUSTMENT_BARRIO_CENTROIDS: dict[str, tuple[float, float]] = {
    "santa barbara central": (4.6960, -74.0410),
    "santa barbara occidental": (4.6980, -74.0490),
    "chico norte": (4.6775, -74.0485),
    "chico": (4.6745, -74.0495),
    "chico reservado": (4.6730, -74.0435),
    "chico navarra": (4.6915, -74.0530),
    "los rosales": (4.6580, -74.0520),
    "el refugio": (4.6650, -74.0510),
    "cabrera": (4.6680, -74.0495),
    "usaquen": (4.6950, -74.0305),
    "pasadena": (4.6960, -74.0610),
    "niza": (4.7070, -74.0695),
    "la floresta": (4.6930, -74.0740),
    "pontevedra": (4.6985, -74.0735),
    "la carolina": (4.7035, -74.0335),
    "country club": (4.7125, -74.0365),
    "san patricio": (4.6895, -74.0470),
    "molinos norte": (4.6930, -74.0460),
    "navarra": (4.6920, -74.0535),
    "bella suiza": (4.7045, -74.0310),
    "santa bibiana": (4.6925, -74.0430),
    "andes norte": (4.6890, -74.0645),
    "rionegro": (4.6860, -74.0675),
    "gratamira": (4.7320, -74.0745),
    "sotileza": (4.7250, -74.0760),
}

# Palabras clave de preferencias y requisito de ascensor
ASCENSOR_KEYWORDS: tuple[str, ...] = (
    "ascensor",
    "ascensores",
    "elevador",
    "elevadores",
)

OPEN_KITCHEN_KEYWORDS: tuple[str, ...] = (
    "cocina abierta",
    "barra americana",
    "tipo americano",
    "cocina integral abierta",
)

BALCONY_KEYWORDS: tuple[str, ...] = (
    "balcón",
    "balcon",
    "terraza",
)

# Puntuación
SCORE_ZONA_ORIENTAL: float = 4.0
SCORE_ZONA_OCCIDENTAL: float = 2.0
SCORE_COCINA_ABIERTA: float = 2.0
SCORE_BALCON: float = 2.0
SCORE_ESTRATO_3_4: float = 1.0
SCORE_EFICIENCIA: float = 1.0
EFFICIENCY_MIN_AREA: float = 80.0
EFFICIENCY_MAX_COST_PER_M2: float = 42_000.0
EFFICIENCY_MAX_SALE_PRICE_PER_M2: float = 7_500_000.0

# Nombres de pestañas en Google Sheets
SHEET_TOP_SEMANA = "Top_Semana"
SHEET_HISTORICO = "Historico_Completo"
SHEET_RESUMEN_BARRIOS = "Resumen_Barrios"
SHEET_TOP_VENTAS = "Top semana ventas"
SHEET_HISTORICO_VENTAS = "Histórico ventas"
SHEET_RESUMEN_BARRIOS_VENTAS = "Resumen_Barrios_Ventas"
SHEET_AJUSTES_ARRIENDOS = "Ajustes_Arriendos"
SHEET_AJUSTES_VENTAS = "Ajustes_Ventas"
SHEET_RESUMEN_AJUSTES_ARRIENDOS = "Resumen_Ajustes_Arriendos"
SHEET_RESUMEN_AJUSTES_VENTAS = "Resumen_Ajustes_Ventas"

TOP_SEMANA_HEADERS: list[str] = [
    "Fingerprint",
    "Puntuación",
    "Estado",
    "Zona",
    "Barrio",
    "Dirección",
    "Lat",
    "Lng",
    "Estrato",
    "Área (m²)",
    "Hab",
    "Baños",
    "Garajes",
    "Antiguedad",
    "Canon",
    "Admin",
    "Total Mensual",
    "Admin Estimada?",
    "Cocina Abierta",
    "Balcón",
    "Costo/m²",
    "Etiquetas_Confort",
    "Dias_en_Mercado",
    "Fotos",
    "Fuente",
    "Enlaces",
    "Fecha Detección",
    "Estado_Visita",
    "Notas_Personales",
    "Checklist_Visita",
]

TOP_VENTAS_HEADERS: list[str] = [
    "Fingerprint",
    "Puntuación",
    "Estado",
    "Zona",
    "Barrio",
    "Dirección",
    "Lat",
    "Lng",
    "Estrato",
    "Área (m²)",
    "Hab",
    "Baños",
    "Garajes",
    "Antiguedad",
    "Precio Venta",
    "Admin Mensual",
    "Admin Estimada?",
    "Cocina Abierta",
    "Balcón",
    "Precio/m²",
    "Etiquetas_Confort",
    "Dias_en_Mercado",
    "Fotos",
    "Fuente",
    "Enlaces",
    "Fecha Detección",
    "Estado_Visita",
    "Notas_Personales",
    "Checklist_Visita",
]


def _with_motivos_header(base_headers: list[str]) -> list[str]:
    idx = base_headers.index("Fotos")
    return [*base_headers[:idx], "Motivos_Ajuste", *base_headers[idx:]]


AJUSTES_ARRIENDOS_HEADERS: list[str] = _with_motivos_header(TOP_SEMANA_HEADERS)
AJUSTES_VENTAS_HEADERS: list[str] = _with_motivos_header(TOP_VENTAS_HEADERS)

USER_AGENTS: list[str] = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
]
