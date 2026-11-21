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
}

# Reglas de filtrado estricto (Hard Filters)
MIN_AREA_M2: float = 70.0
MIN_HABITACIONES: int = 2
MAX_HABITACIONES: int = 3
MIN_BANOS: int = 2
MIN_PARQUEADEROS: int = 1
ALLOWED_ESTRATOS: frozenset[int] = frozenset({3, 4, 5})
MAX_COSTO_TOTAL: int = 3_500_000
MAX_PRECIO_VENTA: int = 800_000_000
ADMIN_ESTIMADA_POR_M2: int = 5_500

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

USER_AGENTS: list[str] = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
]
