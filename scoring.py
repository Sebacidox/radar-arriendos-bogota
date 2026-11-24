"""Sistema de puntuación de preferencias (Score 0 a 10) y ordenamiento."""

from __future__ import annotations

from typing import TYPE_CHECKING

from config import (
    EFFICIENCY_MAX_COST_PER_M2,
    EFFICIENCY_MAX_SALE_PRICE_PER_M2,
    EFFICIENCY_MIN_AREA,
    MAX_COSTO_TOTAL,
    RENT_OVER_TARGET_BASE_PENALTY,
    RENT_OVER_TARGET_MAX_EXTRA_PENALTY,
    SCORE_BALCON,
    SCORE_COCINA_ABIERTA,
    SCORE_EFICIENCIA,
    SCORE_ESTRATO_3_4,
    SCORE_ZONA_OCCIDENTAL,
    SCORE_ZONA_ORIENTAL,
    TARGET_MAX_COSTO_TOTAL,
)

if TYPE_CHECKING:
    from models import EvaluatedListing


def calculate_score(
    zona: str,
    cocina_abierta: bool,
    balcon: bool,
    estrato: int,
    area: float,
    costo_total: int,
    operacion: str = "arriendo",
) -> float:
    """Calcula la puntuación de preferencias de 0 a 10 según las reglas definidas."""
    score = 0.0

    if zona == "Oriental":
        score += SCORE_ZONA_ORIENTAL
    else:
        score += SCORE_ZONA_OCCIDENTAL

    if cocina_abierta:
        score += SCORE_COCINA_ABIERTA

    if balcon:
        score += SCORE_BALCON

    if estrato in (3, 4):
        score += SCORE_ESTRATO_3_4

    max_price_per_m2 = (
        EFFICIENCY_MAX_SALE_PRICE_PER_M2
        if operacion == "venta"
        else EFFICIENCY_MAX_COST_PER_M2
    )
    costo_m2 = costo_total / area if area > 0 else float("inf")
    if area >= EFFICIENCY_MIN_AREA or costo_m2 <= max_price_per_m2:
        score += SCORE_EFICIENCIA

    score = min(score, 10.0)

    # Penalizar arriendos entre $3.500.001 y $3.800.000 para priorizar <= $3.500.000
    if operacion == "arriendo" and costo_total > TARGET_MAX_COSTO_TOTAL:
        excedente = costo_total - TARGET_MAX_COSTO_TOTAL
        max_excedente = max(1, MAX_COSTO_TOTAL - TARGET_MAX_COSTO_TOTAL)
        ratio = min(1.0, excedente / max_excedente)
        penalty = RENT_OVER_TARGET_BASE_PENALTY + (
            RENT_OVER_TARGET_MAX_EXTRA_PENALTY * ratio
        )
        score = max(0.0, score - penalty)

    return round(score, 2)


def _status_priority(estado: str) -> int:
    """Prioridad de desempate: NUEVO > BAJÓ DE PRECIO > SIGUE DISPONIBLE."""
    upper = estado.upper()
    if upper.startswith("NUEVO"):
        return 3
    if upper.startswith("BAJÓ DE PRECIO") or upper.startswith("BAJO DE PRECIO"):
        return 2
    return 1


def sort_active_listings(listings: list[EvaluatedListing]) -> list[EvaluatedListing]:
    """Ordena los inmuebles activos por score descendente y desempata por rango objetivo y estado."""
    return sorted(
        listings,
        key=lambda item: (
            -item.score,
            0 if (item.operacion != "arriendo" or item.costo_total <= TARGET_MAX_COSTO_TOTAL) else 1,
            -_status_priority(item.estado),
            item.costo_total,
            -item.area,
        ),
    )
