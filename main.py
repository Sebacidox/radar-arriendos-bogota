"""Punto de entrada principal de radar-arriendos-bogota."""

from __future__ import annotations

import logging
from typing import Callable

from database import DatabaseManager, deduplicate_listings
from filters import evaluate_listing
from models import EvaluatedListing, RawListing
from scoring import sort_active_listings
from scrapers import (
    scrape_ciencuadras,
    scrape_fincaraiz,
    scrape_metrocuadrado,
    scrape_properati,
)
from scrapers.gallery import enrich_listings_galleries
from sheets_exporter import export_to_sheets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("radar-arriendos-bogota")


def _run_operation(
    operacion: str,
    db: DatabaseManager,
) -> tuple[list[EvaluatedListing], list[dict]]:
    """Ejecuta recolección, filtrado, deduplicación y persistencia para arriendo o venta."""
    portals: list[tuple[str, Callable[..., list[RawListing]]]] = [
        ("Fincaraíz", scrape_fincaraiz),
        ("Metrocuadrado", scrape_metrocuadrado),
        ("Ciencuadras", scrape_ciencuadras),
        ("Properati", scrape_properati),
    ]

    raw_listings: list[RawListing] = []
    portal_summary: dict[str, dict] = {}
    op_label = operacion.upper()

    for portal_name, scraper_fn in portals:
        logger.info("[%s] Iniciando extracción en %s...", op_label, portal_name)
        try:
            items = scraper_fn(operacion=operacion)
            raw_listings.extend(items)
            portal_summary[portal_name] = {"status": "OK", "raw_count": len(items)}
            logger.info("[%s][%s] Extraídos %d anuncios crudos.", op_label, portal_name, len(items))
        except Exception as exc:
            portal_summary[portal_name] = {"status": "ERROR", "raw_count": 0, "error": str(exc)}
            logger.error(
                "[%s][%s] Falló o fue bloqueado; continuando con los demás portales. Detalle: %s",
                op_label,
                portal_name,
                exc,
            )

    evaluated: list[EvaluatedListing] = []
    for raw in raw_listings:
        res = evaluate_listing(raw)
        if res is not None:
            evaluated.append(res)

    exactos_count = sum(1 for x in evaluated if x.categoria_filtro == "exacto")
    ajustes_count = sum(1 for x in evaluated if x.categoria_filtro == "ajuste_razonable")
    logger.info(
        "[%s] Clasificación: %d exactos y %d ajustes razonables (sobre %d crudos).",
        op_label,
        exactos_count,
        ajustes_count,
        len(raw_listings),
    )

    deduped = deduplicate_listings(evaluated)
    logger.info("[%s] Deduplicación por fingerprint: %d inmuebles únicos activos.", op_label, len(deduped))

    existing_fotos = db.get_fotos_by_fingerprint(operacion=operacion)
    enriched_cnt = enrich_listings_galleries(deduped, existing_fotos_by_fp=existing_fotos)
    logger.info(
        "[%s] Galerías completas enriquecidas en ficha individual: %d inmuebles actualizados.",
        op_label,
        enriched_cnt,
    )

    active = db.sync_run(
        deduped_listings=deduped,
        total_raw=len(raw_listings),
        total_filtered=len(evaluated),
        portal_summary=portal_summary,
        operacion=operacion,
    )
    active_sorted = sort_active_listings(active)
    full_history = db.get_full_history(operacion=operacion)

    logger.info("[%s] Base de datos SQLite actualizada (%d históricos totales).", op_label, len(full_history))

    exactos_sorted = [x for x in active_sorted if x.categoria_filtro == "exacto"]
    ajustes_sorted = [x for x in active_sorted if x.categoria_filtro == "ajuste_razonable"]
    logger.info(
        "[%s] Activos finales -> Exactos: %d | Ajustes razonables: %d",
        op_label,
        len(exactos_sorted),
        len(ajustes_sorted),
    )

    for idx, item in enumerate(exactos_sorted[:10], start=1):
        logger.info(
            "[%s] Top %d | Puntuación %.1f | %s | %s | $%s | %.1fm² | %s",
            op_label,
            idx,
            item.score,
            item.estado,
            item.barrio,
            f"{item.costo_total:,}".replace(",", "."),
            item.area,
            item.zona,
        )

    return active_sorted, full_history


def run_pipeline() -> int:
    """Ejecuta el pipeline completo para arriendos y ventas y actualiza Google Sheets."""
    db = DatabaseManager()
    active_arr_all, hist_arr_all = _run_operation("arriendo", db)
    active_vta_all, hist_vta_all = _run_operation("venta", db)

    active_arriendos = [x for x in active_arr_all if x.categoria_filtro == "exacto"]
    ajustes_arriendos = [x for x in active_arr_all if x.categoria_filtro == "ajuste_razonable"]
    history_arriendos = [r for r in hist_arr_all if (r.get("categoria_filtro") or "exacto") == "exacto"]
    hist_adj_arriendos = [r for r in hist_arr_all if r.get("categoria_filtro") == "ajuste_razonable"]

    active_ventas = [x for x in active_vta_all if x.categoria_filtro == "exacto"]
    ajustes_ventas = [x for x in active_vta_all if x.categoria_filtro == "ajuste_razonable"]
    history_ventas = [r for r in hist_vta_all if (r.get("categoria_filtro") or "exacto") == "exacto"]
    hist_adj_ventas = [r for r in hist_vta_all if r.get("categoria_filtro") == "ajuste_razonable"]

    export_to_sheets(
        active_arriendos=active_arriendos,
        history_arriendos=history_arriendos,
        active_ventas=active_ventas,
        history_ventas=history_ventas,
        ajustes_arriendos=ajustes_arriendos,
        ajustes_ventas=ajustes_ventas,
        history_ajustes_arriendos=hist_adj_arriendos,
        history_ajustes_ventas=hist_adj_ventas,
    )
    logger.info(
        "Exportación a Google Sheets completada exitosamente "
        "(Exactos + Ajustes Razonables + Resúmenes + Históricos)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run_pipeline())
