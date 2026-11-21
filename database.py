"""Persistencia en SQLite (arriendos.db), deduplicación e historial de precios."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from config import DB_PATH
from filters import clean_fotos
from models import EvaluatedListing
from scoring import calculate_score
from scrapers.availability import check_listing_availability
from scrapers.base import build_session


def _compute_days_in_market(first_date_str: str, ref_date_str: str) -> int:
    """Calcula días transcurridos entre la primera detección y la fecha de referencia."""
    try:
        d1 = date.fromisoformat(str(first_date_str)[:10])
        d2 = date.fromisoformat(str(ref_date_str)[:10])
        return max(0, (d2 - d1).days)
    except ValueError:
        return 0


def _merge_comfort_tags(tags_a: str, tags_b: str) -> str:
    combined = [
        t.strip()
        for src in (tags_a, tags_b)
        for t in (src or "").split(",")
        if t.strip()
    ]
    return ", ".join(dict.fromkeys(combined))


def deduplicate_listings(listings: list[EvaluatedListing]) -> list[EvaluatedListing]:
    """Fusiona anuncios repetidos en la misma corrida usando su fingerprint."""
    merged: dict[str, EvaluatedListing] = {}

    for item in listings:
        fp = item.fingerprint
        if fp not in merged:
            # Asegura lista única de (portal, url)
            unique_links = list(dict.fromkeys(item.portales_enlaces))
            item.portales_enlaces = unique_links
            merged[fp] = item
            continue

        existing = merged[fp]
        # Fusionar enlaces conservando todos sin duplicados
        seen_urls = {url for _, url in existing.portales_enlaces}
        for portal, url in item.portales_enlaces:
            if url not in seen_urls:
                existing.portales_enlaces.append((portal, url))
                seen_urls.add(url)

        # Completar descripción / dirección / coordenadas / fotos / antigüedad / etiquetas
        if len(item.descripcion) > len(existing.descripcion):
            existing.descripcion = item.descripcion
        if not existing.direccion and item.direccion:
            existing.direccion = item.direccion
        if existing.latitud is None and item.latitud is not None:
            existing.latitud = item.latitud
            existing.longitud = item.longitud
            existing.zona = item.zona
        if (not existing.antiguedad or existing.antiguedad == "No especificada") and item.antiguedad:
            existing.antiguedad = item.antiguedad
        if item.fotos and (not existing.fotos or len(item.fotos) > len(existing.fotos)):
            existing.fotos = clean_fotos(item.fotos)
        existing.etiquetas_confort = _merge_comfort_tags(
            existing.etiquetas_confort, item.etiquetas_confort
        )

        existing.cocina_abierta = existing.cocina_abierta or item.cocina_abierta
        existing.balcon = existing.balcon or item.balcon

        # Si el otro anuncio reporta un canon/admin real (no estimado) y el existente era estimado, preferir el real
        if existing.admin_estimada_flag and not item.admin_estimada_flag:
            existing.canon = item.canon
            existing.precio_venta = item.precio_venta
            existing.administracion = item.administracion
            existing.costo_total = item.costo_total
            existing.admin_estimada_flag = False
            existing.costo_m2 = item.costo_m2

        existing.score = calculate_score(
            zona=existing.zona,
            cocina_abierta=existing.cocina_abierta,
            balcon=existing.balcon,
            estrato=existing.estrato,
            area=existing.area,
            costo_total=existing.costo_total,
            operacion=existing.operacion,
        )

    return list(merged.values())


class DatabaseManager:
    """Gestiona la base de datos SQLite arriendos.db."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_at TEXT NOT NULL,
                    operacion TEXT NOT NULL DEFAULT 'arriendo',
                    total_raw INTEGER NOT NULL,
                    total_filtered INTEGER NOT NULL,
                    total_unique INTEGER NOT NULL,
                    portal_summary TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS inmuebles (
                    fingerprint TEXT PRIMARY KEY,
                    operacion TEXT NOT NULL DEFAULT 'arriendo',
                    titulo TEXT NOT NULL,
                    descripcion TEXT NOT NULL,
                    barrio TEXT NOT NULL,
                    barrio_normalizado TEXT NOT NULL,
                    zona TEXT NOT NULL,
                    direccion TEXT NOT NULL DEFAULT '',
                    latitud REAL,
                    longitud REAL,
                    area REAL NOT NULL,
                    habitaciones INTEGER NOT NULL,
                    banos INTEGER NOT NULL,
                    parqueaderos INTEGER NOT NULL,
                    estrato INTEGER NOT NULL,
                    canon INTEGER NOT NULL,
                    precio_venta INTEGER NOT NULL DEFAULT 0,
                    administracion INTEGER NOT NULL,
                    costo_total INTEGER NOT NULL,
                    admin_estimada_flag INTEGER NOT NULL,
                    cocina_abierta INTEGER NOT NULL,
                    balcon INTEGER NOT NULL,
                    costo_m2 REAL NOT NULL,
                    score REAL NOT NULL,
                    estado TEXT NOT NULL,
                    ahorro_cop INTEGER NOT NULL DEFAULT 0,
                    portales_enlaces_json TEXT NOT NULL,
                    fotos_json TEXT NOT NULL DEFAULT '[]',
                    antiguedad TEXT NOT NULL DEFAULT '',
                    etiquetas_confort TEXT NOT NULL DEFAULT '',
                    fecha_primera_deteccion TEXT NOT NULL,
                    fecha_ultima_deteccion TEXT NOT NULL,
                    activo INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS inmueble_urls (
                    url TEXT PRIMARY KEY,
                    portal TEXT NOT NULL,
                    fingerprint TEXT NOT NULL,
                    FOREIGN KEY (fingerprint) REFERENCES inmuebles(fingerprint)
                );

                CREATE TABLE IF NOT EXISTS price_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fingerprint TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    canon INTEGER NOT NULL,
                    administracion INTEGER NOT NULL,
                    costo_total INTEGER NOT NULL,
                    evento TEXT NOT NULL,
                    diferencia_cop INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (fingerprint) REFERENCES inmuebles(fingerprint)
                );
                """
            )
            cols = {row["name"] for row in conn.execute("PRAGMA table_info(inmuebles)").fetchall()}
            if "direccion" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN direccion TEXT NOT NULL DEFAULT ''")
            if "operacion" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN operacion TEXT NOT NULL DEFAULT 'arriendo'")
            if "precio_venta" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN precio_venta INTEGER NOT NULL DEFAULT 0")
            if "fotos_json" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN fotos_json TEXT NOT NULL DEFAULT '[]'")
            if "antiguedad" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN antiguedad TEXT NOT NULL DEFAULT ''")
            if "etiquetas_confort" not in cols:
                conn.execute("ALTER TABLE inmuebles ADD COLUMN etiquetas_confort TEXT NOT NULL DEFAULT ''")

            run_cols = {row["name"] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
            if "operacion" not in run_cols:
                conn.execute("ALTER TABLE runs ADD COLUMN operacion TEXT NOT NULL DEFAULT 'arriendo'")

    def sync_run(
        self,
        deduped_listings: list[EvaluatedListing],
        total_raw: int,
        total_filtered: int,
        portal_summary: dict[str, dict],
        run_timestamp: Optional[str] = None,
        operacion: str = "arriendo",
        verify_missing_urls: bool = True,
    ) -> list[EvaluatedListing]:
        """Actualiza el estado semanal, historial de precios y retorna los activos clasificados."""
        now_str = run_timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        today_str = now_str[:10]

        with self._connect() as conn:
            existing_rows = {
                row["fingerprint"]: dict(row)
                for row in conn.execute(
                    "SELECT * FROM inmuebles WHERE operacion = ?",
                    (operacion,),
                ).fetchall()
            }
            url_to_fp = {
                row["url"]: row["fingerprint"]
                for row in conn.execute(
                    """
                    SELECT iu.url, iu.fingerprint
                    FROM inmueble_urls iu
                    JOIN inmuebles i ON i.fingerprint = iu.fingerprint
                    WHERE i.operacion = ?
                    """,
                    (operacion,),
                ).fetchall()
            }

            active_fingerprints: set[str] = set()
            processed_active: list[EvaluatedListing] = []

            for item in deduped_listings:
                matched_fp: Optional[str] = None
                if item.fingerprint in existing_rows:
                    matched_fp = item.fingerprint
                else:
                    # Si bajó bastante de precio, su URL previa permite enlazar al mismo inmueble
                    for _, url in item.portales_enlaces:
                        if url in url_to_fp:
                            matched_fp = url_to_fp[url]
                            break

                if matched_fp is None:
                    # NUEVO
                    item.estado = "NUEVO"
                    item.ahorro_cop = 0
                    item.fecha_primera_deteccion = today_str
                    item.fecha_ultima_deteccion = today_str
                    item.dias_en_mercado = 0

                    links_json = json.dumps(item.portales_enlaces, ensure_ascii=False)
                    fotos_json = json.dumps(clean_fotos(item.fotos), ensure_ascii=False)
                    conn.execute(
                        """
                        INSERT INTO inmuebles (
                            fingerprint, operacion, titulo, descripcion, barrio, barrio_normalizado,
                            zona, direccion, latitud, longitud, area, habitaciones, banos, parqueaderos,
                            estrato, canon, precio_venta, administracion, costo_total, admin_estimada_flag,
                            cocina_abierta, balcon, costo_m2, score, estado, ahorro_cop,
                            portales_enlaces_json, fotos_json, antiguedad, etiquetas_confort,
                            fecha_primera_deteccion, fecha_ultima_deteccion, activo
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                        """,
                        (
                            item.fingerprint,
                            operacion,
                            item.titulo,
                            item.descripcion,
                            item.barrio,
                            item.barrio_normalizado,
                            item.zona,
                            item.direccion,
                            item.latitud,
                            item.longitud,
                            item.area,
                            item.habitaciones,
                            item.banos,
                            item.parqueaderos,
                            item.estrato,
                            item.canon,
                            item.precio_venta,
                            item.administracion,
                            item.costo_total,
                            int(item.admin_estimada_flag),
                            int(item.cocina_abierta),
                            int(item.balcon),
                            item.costo_m2,
                            item.score,
                            item.estado,
                            item.ahorro_cop,
                            links_json,
                            fotos_json,
                            item.antiguedad,
                            item.etiquetas_confort,
                            item.fecha_primera_deteccion,
                            item.fecha_ultima_deteccion,
                        ),
                    )
                    conn.execute(
                        """
                        INSERT INTO price_history (
                            fingerprint, fecha, canon, administracion, costo_total, evento, diferencia_cop
                        ) VALUES (?, ?, ?, ?, ?, 'DETECCION_INICIAL', 0)
                        """,
                        (item.fingerprint, now_str, item.canon, item.administracion, item.costo_total),
                    )
                    active_fingerprints.add(item.fingerprint)
                    target_fp = item.fingerprint
                else:
                    # Existía previamente
                    prev = existing_rows[matched_fp]
                    item.fingerprint = matched_fp
                    old_total = int(prev["costo_total"])
                    item.fecha_primera_deteccion = prev["fecha_primera_deteccion"]
                    item.fecha_ultima_deteccion = today_str
                    item.dias_en_mercado = _compute_days_in_market(
                        item.fecha_primera_deteccion, today_str
                    )

                    prev_fotos = json.loads(prev.get("fotos_json") or "[]")
                    if (not item.fotos and prev_fotos) or (len(prev_fotos) > len(item.fotos) and len(item.fotos) <= 5):
                        item.fotos = clean_fotos(prev_fotos)
                    else:
                        item.fotos = clean_fotos(item.fotos)
                    if (not item.antiguedad or item.antiguedad == "No especificada") and prev.get("antiguedad"):
                        item.antiguedad = prev["antiguedad"]
                    item.etiquetas_confort = _merge_comfort_tags(
                        item.etiquetas_confort, prev.get("etiquetas_confort") or ""
                    )

                    # Combinar enlaces históricos con los actuales
                    prev_links = json.loads(prev["portales_enlaces_json"])
                    combined_links: list[tuple[str, str]] = []
                    seen_urls: set[str] = set()
                    for p, u in [*item.portales_enlaces, *(tuple(x) for x in prev_links)]:
                        if u not in seen_urls:
                            combined_links.append((p, u))
                            seen_urls.add(u)
                    item.portales_enlaces = combined_links

                    if item.costo_total < old_total:
                        ahorro = old_total - item.costo_total
                        item.estado = f"BAJÓ DE PRECIO (-${ahorro:,} COP)".replace(",", ".")
                        item.ahorro_cop = ahorro
                        conn.execute(
                            """
                            INSERT INTO price_history (
                                fingerprint, fecha, canon, administracion, costo_total, evento, diferencia_cop
                            ) VALUES (?, ?, ?, ?, ?, 'BAJA_PRECIO', ?)
                            """,
                            (matched_fp, now_str, item.canon, item.administracion, item.costo_total, -ahorro),
                        )
                    elif item.costo_total > old_total:
                        diff = item.costo_total - old_total
                        item.estado = "SIGUE DISPONIBLE"
                        item.ahorro_cop = 0
                        conn.execute(
                            """
                            INSERT INTO price_history (
                                fingerprint, fecha, canon, administracion, costo_total, evento, diferencia_cop
                            ) VALUES (?, ?, ?, ?, ?, 'SUBE_PRECIO', ?)
                            """,
                            (matched_fp, now_str, item.canon, item.administracion, item.costo_total, diff),
                        )
                    else:
                        item.estado = "SIGUE DISPONIBLE"
                        item.ahorro_cop = 0

                    conn.execute(
                        """
                        UPDATE inmuebles SET
                            titulo = ?,
                            descripcion = ?,
                            barrio = ?,
                            zona = ?,
                            direccion = COALESCE(NULLIF(?, ''), direccion),
                            latitud = COALESCE(?, latitud),
                            longitud = COALESCE(?, longitud),
                            canon = ?,
                            precio_venta = ?,
                            administracion = ?,
                            costo_total = ?,
                            admin_estimada_flag = ?,
                            cocina_abierta = ?,
                            balcon = ?,
                            costo_m2 = ?,
                            score = ?,
                            estado = ?,
                            ahorro_cop = ?,
                            portales_enlaces_json = ?,
                            fotos_json = ?,
                            antiguedad = ?,
                            etiquetas_confort = ?,
                            fecha_ultima_deteccion = ?,
                            activo = 1
                        WHERE fingerprint = ?
                        """,
                        (
                            item.titulo,
                            item.descripcion,
                            item.barrio,
                            item.zona,
                            item.direccion,
                            item.latitud,
                            item.longitud,
                            item.canon,
                            item.precio_venta,
                            item.administracion,
                            item.costo_total,
                            int(item.admin_estimada_flag),
                            int(item.cocina_abierta),
                            int(item.balcon),
                            item.costo_m2,
                            item.score,
                            item.estado,
                            item.ahorro_cop,
                            json.dumps(item.portales_enlaces, ensure_ascii=False),
                            json.dumps(clean_fotos(item.fotos), ensure_ascii=False),
                            item.antiguedad,
                            item.etiquetas_confort,
                            item.fecha_ultima_deteccion,
                            matched_fp,
                        ),
                    )
                    active_fingerprints.add(matched_fp)
                    target_fp = matched_fp

                for portal, url in item.portales_enlaces:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO inmueble_urls (url, portal, fingerprint)
                        VALUES (?, ?, ?)
                        """,
                        (url, portal, target_fp),
                    )

                processed_active.append(item)

            # Verificar disponibilidad real de los que estaban activos y no aparecieron en búsqueda
            verify_session = build_session() if verify_missing_urls else None
            for fp, prev in existing_rows.items():
                if fp not in active_fingerprints and prev["activo"] == 1:
                    if verify_missing_urls:
                        prev_links = [
                            tuple(x) for x in json.loads(prev["portales_enlaces_json"])
                        ]
                        availability = check_listing_availability(
                            prev_links, session=verify_session
                        )
                    else:
                        availability = "UNKNOWN"

                    if availability == "AVAILABLE":
                        conn.execute(
                            """
                            UPDATE inmuebles
                            SET estado = 'SIGUE DISPONIBLE',
                                fecha_ultima_deteccion = ?,
                                activo = 1
                            WHERE fingerprint = ?
                            """,
                            (today_str, fp),
                        )
                        prev_links = [
                            tuple(x) for x in json.loads(prev["portales_enlaces_json"])
                        ]
                        prev_fotos = json.loads(prev.get("fotos_json") or "[]")
                        processed_active.append(
                            EvaluatedListing(
                                fingerprint=fp,
                                portal=prev_links[0][0] if prev_links else "",
                                url=prev_links[0][1] if prev_links else "",
                                titulo=prev["titulo"],
                                descripcion=prev["descripcion"],
                                barrio=prev["barrio"],
                                barrio_normalizado=prev["barrio_normalizado"],
                                zona=prev["zona"],
                                latitud=prev["latitud"],
                                longitud=prev["longitud"],
                                area=float(prev["area"]),
                                habitaciones=int(prev["habitaciones"]),
                                banos=int(prev["banos"]),
                                parqueaderos=int(prev["parqueaderos"]),
                                estrato=int(prev["estrato"]),
                                canon=int(prev["canon"]),
                                administracion=int(prev["administracion"]),
                                costo_total=int(prev["costo_total"]),
                                admin_estimada_flag=bool(prev["admin_estimada_flag"]),
                                cocina_abierta=bool(prev["cocina_abierta"]),
                                balcon=bool(prev["balcon"]),
                                costo_m2=float(prev["costo_m2"]),
                                score=float(prev["score"]),
                                estado="SIGUE DISPONIBLE",
                                ahorro_cop=int(prev["ahorro_cop"]),
                                portales_enlaces=prev_links,
                                fecha_primera_deteccion=prev["fecha_primera_deteccion"],
                                fecha_ultima_deteccion=today_str,
                                direccion=prev.get("direccion") or "",
                                operacion=prev.get("operacion") or operacion,
                                precio_venta=int(prev.get("precio_venta") or 0),
                                tiene_ascensor=True,
                                fotos=clean_fotos(prev_fotos),
                                antiguedad=prev.get("antiguedad") or "",
                                dias_en_mercado=_compute_days_in_market(
                                    prev["fecha_primera_deteccion"], today_str
                                ),
                                etiquetas_confort=prev.get("etiquetas_confort") or "",
                            )
                        )
                    elif availability == "UNAVAILABLE":
                        conn.execute(
                            """
                            UPDATE inmuebles
                            SET estado = 'NO DISPONIBLE', activo = 0
                            WHERE fingerprint = ?
                            """,
                            (fp,),
                        )
                    else:
                        conn.execute(
                            """
                            UPDATE inmuebles
                            SET estado = 'NO DETECTADO', activo = 0
                            WHERE fingerprint = ?
                            """,
                            (fp,),
                        )

            conn.execute(
                """
                INSERT INTO runs (run_at, operacion, total_raw, total_filtered, total_unique, portal_summary)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    now_str,
                    operacion,
                    total_raw,
                    total_filtered,
                    len(processed_active),
                    json.dumps(portal_summary, ensure_ascii=False),
                ),
            )

        return processed_active

    def get_full_history(self, operacion: str = "arriendo") -> list[dict]:
        """Retorna el historial completo de los inmuebles de la operación y su historial de precios."""
        with self._connect() as conn:
            inmuebles = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT * FROM inmuebles
                    WHERE operacion = ?
                    ORDER BY activo DESC, score DESC, fecha_ultima_deteccion DESC
                    """,
                    (operacion,),
                ).fetchall()
            ]
            history_rows = conn.execute(
                "SELECT * FROM price_history ORDER BY fecha ASC, id ASC"
            ).fetchall()

        history_by_fp: dict[str, list[dict]] = {}
        for row in history_rows:
            history_by_fp.setdefault(row["fingerprint"], []).append(dict(row))

        today_str = date.today().isoformat()
        for inm in inmuebles:
            inm["portales_enlaces"] = json.loads(inm["portales_enlaces_json"])
            inm["fotos"] = json.loads(inm.get("fotos_json") or "[]")
            inm["dias_en_mercado"] = _compute_days_in_market(
                inm["fecha_primera_deteccion"], today_str
            )
            inm["price_history"] = history_by_fp.get(inm["fingerprint"], [])

        return inmuebles

    def get_fotos_by_fingerprint(self, operacion: str) -> dict[str, list[str]]:
        """Retorna las galerías ya guardadas en SQLite indexadas por fingerprint."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT fingerprint, fotos_json FROM inmuebles WHERE operacion = ?",
                (operacion,),
            ).fetchall()
        result: dict[str, list[str]] = {}
        for row in rows:
            try:
                fotos = json.loads(row["fotos_json"] or "[]")
            except json.JSONDecodeError:
                fotos = []
            if isinstance(fotos, list) and fotos:
                result[row["fingerprint"]] = clean_fotos(fotos)
        return result

    def get_active_evaluated(self, operacion: str) -> list[EvaluatedListing]:
        """Reconstruye los inmuebles activos desde SQLite como EvaluatedListing."""
        today_str = date.today().isoformat()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM inmuebles
                WHERE operacion = ? AND activo = 1
                ORDER BY score DESC, fecha_ultima_deteccion DESC
                """,
                (operacion,),
            ).fetchall()
        items: list[EvaluatedListing] = []
        for row in rows:
            rec = dict(row)
            links = [tuple(x) for x in json.loads(rec.get("portales_enlaces_json") or "[]")]
            fotos = clean_fotos(json.loads(rec.get("fotos_json") or "[]"))
            items.append(
                EvaluatedListing(
                    fingerprint=rec["fingerprint"],
                    portal=links[0][0] if links else "",
                    url=links[0][1] if links else "",
                    titulo=rec.get("titulo") or "",
                    descripcion=rec.get("descripcion") or "",
                    barrio=rec.get("barrio") or "",
                    barrio_normalizado=rec.get("barrio_normalizado") or "",
                    zona=rec.get("zona") or "Oriental",
                    latitud=rec.get("latitud"),
                    longitud=rec.get("longitud"),
                    area=float(rec.get("area") or 0),
                    habitaciones=int(rec.get("habitaciones") or 0),
                    banos=int(rec.get("banos") or 0),
                    parqueaderos=int(rec.get("parqueaderos") or 0),
                    estrato=int(rec.get("estrato") or 4),
                    canon=int(rec.get("canon") or 0),
                    administracion=int(rec.get("administracion") or 0),
                    costo_total=int(rec.get("costo_total") or 0),
                    admin_estimada_flag=bool(rec.get("admin_estimada_flag")),
                    cocina_abierta=bool(rec.get("cocina_abierta")),
                    balcon=bool(rec.get("balcon")),
                    costo_m2=float(rec.get("costo_m2") or 0),
                    score=float(rec.get("score") or 0),
                    estado=rec.get("estado") or "SIGUE DISPONIBLE",
                    ahorro_cop=int(rec.get("ahorro_cop") or 0),
                    portales_enlaces=links,
                    fecha_primera_deteccion=rec.get("fecha_primera_deteccion") or "",
                    fecha_ultima_deteccion=rec.get("fecha_ultima_deteccion") or "",
                    direccion=rec.get("direccion") or "",
                    operacion=rec.get("operacion") or operacion,
                    precio_venta=int(rec.get("precio_venta") or 0),
                    tiene_ascensor=True,
                    fotos=fotos,
                    antiguedad=rec.get("antiguedad") or "",
                    dias_en_mercado=_compute_days_in_market(
                        rec.get("fecha_primera_deteccion") or "", today_str
                    ),
                    etiquetas_confort=rec.get("etiquetas_confort") or "",
                )
            )
        return items

    def update_fotos_batch(self, fotos_by_fp: dict[str, list[str]]) -> int:
        """Actualiza fotos_json en SQLite para un diccionario {fingerprint: fotos}."""
        if not fotos_by_fp:
            return 0
        updated = 0
        with self._connect() as conn:
            for fp, fotos in fotos_by_fp.items():
                cleaned = clean_fotos(fotos)
                if not cleaned:
                    continue
                cur = conn.execute(
                    "UPDATE inmuebles SET fotos_json = ? WHERE fingerprint = ?",
                    (json.dumps(cleaned, ensure_ascii=False), fp),
                )
                updated += cur.rowcount
        return updated
