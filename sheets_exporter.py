"""Exportador a Google Sheets con pestañas de arriendos/ventas, formato visual y gráficas."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

from config import (
    ADJUSTMENT_MAX_FOTOS,
    AJUSTES_ARRIENDOS_HEADERS,
    AJUSTES_VENTAS_HEADERS,
    BASE_DIR,
    GOOGLE_CREDENTIALS_JSON,
    SHEET_AJUSTES_ARRIENDOS,
    SHEET_AJUSTES_VENTAS,
    SHEET_HISTORICO,
    SHEET_HISTORICO_VENTAS,
    SHEET_RESUMEN_AJUSTES_ARRIENDOS,
    SHEET_RESUMEN_AJUSTES_VENTAS,
    SHEET_RESUMEN_BARRIOS,
    SHEET_RESUMEN_BARRIOS_VENTAS,
    SHEET_TOP_SEMANA,
    SHEET_TOP_VENTAS,
    SPREADSHEET_ID,
    TOP_SEMANA_HEADERS,
    TOP_VENTAS_HEADERS,
)
from models import EvaluatedListing

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HISTORICO_ARRIENDOS_HEADERS: list[str] = [
    "Fingerprint",
    "Estado",
    "Activo",
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
    "Canon Actual",
    "Admin Actual",
    "Total Mensual Actual",
    "Ahorro Último Cambio (COP)",
    "Cambios de Precio",
    "Etiquetas_Confort",
    "Dias_en_Mercado",
    "Fotos",
    "Fecha Primera Aparición",
    "Fecha Última Aparición",
    "Puntuación",
    "Fuente",
    "Enlaces",
]

HISTORICO_VENTAS_HEADERS: list[str] = [
    "Fingerprint",
    "Estado",
    "Activo",
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
    "Precio Venta Actual",
    "Admin Mensual",
    "Ahorro Último Cambio (COP)",
    "Cambios de Precio",
    "Etiquetas_Confort",
    "Dias_en_Mercado",
    "Fotos",
    "Fecha Primera Aparición",
    "Fecha Última Aparición",
    "Puntuación",
    "Fuente",
    "Enlaces",
]

RESUMEN_ARRIENDOS_HEADERS: list[str] = [
    "Barrio",
    "Zona",
    "Ofertas Activas",
    "Promedio Canon",
    "Promedio Total Mensual",
    "Promedio $/m²",
    "% Cocina Abierta",
    "% Balcón",
]

RESUMEN_VENTAS_HEADERS: list[str] = [
    "Barrio",
    "Zona",
    "Ofertas Activas",
    "Promedio Precio Venta",
    "Promedio Admin",
    "Promedio $/m²",
    "% Cocina Abierta",
    "% Balcón",
]

CURRENCY_HEADERS = {
    "Canon",
    "Admin",
    "Total Mensual",
    "Costo/m²",
    "Precio Venta",
    "Admin Mensual",
    "Precio/m²",
    "Canon Actual",
    "Admin Actual",
    "Total Mensual Actual",
    "Precio Venta Actual",
    "Ahorro Último Cambio (COP)",
    "Promedio Canon",
    "Promedio Total Mensual",
    "Promedio Precio Venta",
    "Promedio Admin",
    "Promedio $/m²",
}

DECIMAL_HEADERS = {"Puntuación", "Área (m²)"}
COORD_HEADERS = {"Lat", "Lng"}
INTEGER_HEADERS = {"Estrato", "Hab", "Baños", "Garajes", "Ofertas Activas", "Dias_en_Mercado"}
PERCENT_HEADERS = {"% Cocina Abierta", "% Balcón"}
CENTER_HEADERS = {
    "Puntuación",
    "Zona",
    "Estrato",
    "Hab",
    "Baños",
    "Garajes",
    "Activo",
    "Admin Estimada?",
    "Cocina Abierta",
    "Balcón",
    "Ofertas Activas",
    "Dias_en_Mercado",
    "Fecha Detección",
    "Fecha Primera Aparición",
    "Fecha Última Aparición",
}

CUSTOM_COL_WIDTHS: dict[str, int] = {
    "Fingerprint": 200,
    "Puntuación": 95,
    "Estado": 180,
    "Zona": 95,
    "Barrio": 150,
    "Dirección": 185,
    "Lat": 95,
    "Lng": 100,
    "Antiguedad": 145,
    "Etiquetas_Confort": 240,
    "Dias_en_Mercado": 120,
    "Motivos_Ajuste": 250,
    "Fotos": 260,
    "Fuente": 135,
    "Enlaces": 290,
    "Cambios de Precio": 265,
    "Estado_Visita": 140,
    "Notas_Personales": 220,
    "Checklist_Visita": 240,
}

THEME_ARRIENDO = {
    "header": {"red": 0.118, "green": 0.227, "blue": 0.373},  # #1E3A5F
    "band2": {"red": 0.945, "green": 0.961, "blue": 0.976},   # #F1F5F9
    "accent1": {"red": 0.145, "green": 0.388, "blue": 0.922}, # #2563EB
    "accent2": {"red": 0.055, "green": 0.647, "blue": 0.914}, # #0EA5E9
}

THEME_VENTA = {
    "header": {"red": 0.078, "green": 0.325, "blue": 0.176},  # #14532D
    "band2": {"red": 0.925, "green": 0.973, "blue": 0.945},   # #ECFDF5
    "accent1": {"red": 0.086, "green": 0.639, "blue": 0.290}, # #16A34A
    "accent2": {"red": 0.051, "green": 0.580, "blue": 0.533}, # #0D9488
}

WHITE = {"red": 1.0, "green": 1.0, "blue": 1.0}
BORDER_GRAY = {"red": 0.796, "green": 0.835, "blue": 0.882}


def _load_credentials(raw_cred: str) -> Credentials:
    """Carga credenciales desde contenido JSON directo o desde ruta a archivo."""
    value = (raw_cred or "").strip()
    if not value:
        raise ValueError("GOOGLE_CREDENTIALS_JSON no está configurado en el entorno.")

    if value.startswith("{"):
        info = json.loads(value)
        return Credentials.from_service_account_info(info, scopes=SCOPES)

    cred_path = Path(value)
    if not cred_path.is_absolute():
        cred_path = BASE_DIR / cred_path
    if not cred_path.exists():
        raise FileNotFoundError(f"No se encontró el archivo de credenciales: {cred_path}")
    return Credentials.from_service_account_file(str(cred_path), scopes=SCOPES)


def _get_or_create_worksheet(
    spreadsheet: gspread.Spreadsheet,
    title: str,
    rows: int = 1000,
    cols: int = 25,
) -> gspread.Worksheet:
    try:
        ws = spreadsheet.worksheet(title)
        if ws.row_count < rows or ws.col_count < cols:
            ws.resize(rows=max(ws.row_count, rows), cols=max(ws.col_count, cols))
        return ws
    except gspread.WorksheetNotFound:
        return spreadsheet.add_worksheet(title=title, rows=rows, cols=cols)


def _read_manual_notes(ws: gspread.Worksheet) -> dict[str, tuple[str, str, str]]:
    """Lee Estado_Visita, Notas_Personales y Checklist_Visita indexados por Fingerprint."""
    notes_by_fp: dict[str, tuple[str, str, str]] = {}
    all_values = ws.get_all_values()
    if not all_values:
        return notes_by_fp

    headers = [h.strip() for h in all_values[0]]
    if "Fingerprint" not in headers:
        return notes_by_fp

    fp_idx = headers.index("Fingerprint")
    visita_idx = headers.index("Estado_Visita") if "Estado_Visita" in headers else None
    notas_idx = headers.index("Notas_Personales") if "Notas_Personales" in headers else None
    checklist_idx = headers.index("Checklist_Visita") if "Checklist_Visita" in headers else None

    for row in all_values[1:]:
        if fp_idx >= len(row):
            continue
        fp = row[fp_idx].strip()
        if not fp:
            continue
        estado_visita = row[visita_idx].strip() if (visita_idx is not None and visita_idx < len(row)) else ""
        notas = row[notas_idx].strip() if (notas_idx is not None and notas_idx < len(row)) else ""
        checklist = row[checklist_idx].strip() if (checklist_idx is not None and checklist_idx < len(row)) else ""
        if estado_visita or notas or checklist:
            notes_by_fp[fp] = (estado_visita, notas, checklist)

    return notes_by_fp


def _format_fotos(fotos: list[str] | None, limit: int | None = None) -> str:
    """Serializa las URLs limpias separadas por '|' respetando tope opcional y límite de celda."""
    urls: list[str] = []
    total_len = 0
    for url in fotos or []:
        if limit is not None and len(urls) >= limit:
            break
        u = str(url or "").strip()
        if not u:
            continue
        sep = 1 if urls else 0
        if total_len + sep + len(u) > 48000:
            break
        urls.append(u)
        total_len += sep + len(u)
    return "|".join(urls)


def _format_sources(portales_enlaces: list[tuple[str, str]] | list[list[str]]) -> str:
    return ", ".join(dict.fromkeys(portal for portal, _ in portales_enlaces))


def _format_urls(portales_enlaces: list[tuple[str, str]] | list[list[str]]) -> str:
    return "\n".join(dict.fromkeys(url for _, url in portales_enlaces))


def _write_table_values(ws: gspread.Worksheet, rows: list[list[object]]) -> None:
    ws.clear()
    if rows:
        ws.update(range_name="A1", values=rows, value_input_option="USER_ENTERED")


def _grid_range(sheet_id: int, r0: int, r1: int, c0: int, c1: int) -> dict:
    return {
        "sheetId": sheet_id,
        "startRowIndex": r0,
        "endRowIndex": r1,
        "startColumnIndex": c0,
        "endColumnIndex": c1,
    }


def _cond_rule(
    sheet_id: int,
    r0: int,
    r1: int,
    c0: int,
    c1: int,
    cond_type: str,
    values: list[str],
    bg: dict,
    fg: dict | None = None,
    bold: bool = False,
    index: int = 0,
) -> dict:
    text_fmt: dict = {"bold": bold}
    if fg is not None:
        text_fmt["foregroundColor"] = fg
    return {
        "addConditionalFormatRule": {
            "rule": {
                "ranges": [_grid_range(sheet_id, r0, r1, c0, c1)],
                "booleanRule": {
                    "condition": {
                        "type": cond_type,
                        "values": [{"userEnteredValue": v} for v in values],
                    },
                    "format": {
                        "backgroundColor": bg,
                        "textFormat": text_fmt,
                    },
                },
            },
            "index": index,
        }
    }


def _build_sheet_styling_requests(
    sheet_id: int,
    sheet_meta: dict,
    headers: list[str],
    num_rows: int,
    theme: dict,
) -> list[dict]:
    """Construye requests idempotentes de formato, zebra banding, filtros y ancho de columnas."""
    requests: list[dict] = []
    num_cols = len(headers)

    # Limpiar banding, formatos condicionales y gráficas previas de esta hoja
    for br in sheet_meta.get("bandedRanges", []):
        requests.append({"deleteBanding": {"bandedRangeId": br["bandedRangeId"]}})

    conds = sheet_meta.get("conditionalFormats", [])
    for idx in range(len(conds) - 1, -1, -1):
        requests.append({"deleteConditionalFormatRule": {"sheetId": sheet_id, "index": idx}})

    for chart in sheet_meta.get("charts", []):
        requests.append({"deleteEmbeddedObject": {"objectId": chart["chartId"]}})

    # Congelar fila de encabezado
    requests.append(
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": sheet_id,
                    "gridProperties": {"frozenRowCount": 1},
                },
                "fields": "gridProperties.frozenRowCount",
            }
        }
    )

    # Estilo del encabezado
    requests.append(
        {
            "repeatCell": {
                "range": _grid_range(sheet_id, 0, 1, 0, num_cols),
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": theme["header"],
                        "textFormat": {
                            "foregroundColor": WHITE,
                            "bold": True,
                            "fontSize": 10,
                            "fontFamily": "Roboto",
                        },
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                        "wrapStrategy": "WRAP",
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
            }
        }
    )

    # Alto de fila del encabezado
    requests.append(
        {
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "ROWS",
                    "startIndex": 0,
                    "endIndex": 1,
                },
                "properties": {"pixelSize": 36},
                "fields": "pixelSize",
            }
        }
    )

    # Bordes limpios en toda la tabla
    border_style = {"style": "SOLID", "width": 1, "color": BORDER_GRAY}
    requests.append(
        {
            "updateBorders": {
                "range": _grid_range(sheet_id, 0, max(num_rows, 1), 0, num_cols),
                "top": border_style,
                "bottom": border_style,
                "left": border_style,
                "right": border_style,
                "innerHorizontal": border_style,
                "innerVertical": border_style,
            }
        }
    )

    if num_rows > 1:
        # Fuente y alineación general de filas de datos
        requests.append(
            {
                "repeatCell": {
                    "range": _grid_range(sheet_id, 1, num_rows, 0, num_cols),
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"fontFamily": "Roboto", "fontSize": 10},
                            "verticalAlignment": "MIDDLE",
                            "wrapStrategy": "WRAP",
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)",
                }
            }
        )

        requests.append(
            {
                "updateDimensionProperties": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 1,
                        "endIndex": num_rows,
                    },
                    "properties": {"pixelSize": 26},
                    "fields": "pixelSize",
                }
            }
        )

        # Zebra banding
        requests.append(
            {
                "addBanding": {
                    "bandedRange": {
                        "range": _grid_range(sheet_id, 0, num_rows, 0, num_cols),
                        "rowProperties": {
                            "headerColor": theme["header"],
                            "firstBandColor": WHITE,
                            "secondBandColor": theme["band2"],
                        },
                    }
                }
            }
        )

        # Formatos numéricos y alineación por columna
        for col_idx, header in enumerate(headers):
            fmt = None
            align = "LEFT"
            if header in CURRENCY_HEADERS:
                fmt = {"type": "CURRENCY", "pattern": "$#,##0"}
                align = "RIGHT"
            elif header in DECIMAL_HEADERS:
                fmt = {"type": "NUMBER", "pattern": "0.0"}
                align = "CENTER" if header == "Puntuación" else "RIGHT"
            elif header in COORD_HEADERS:
                fmt = {"type": "NUMBER", "pattern": "0.000000"}
                align = "RIGHT"
            elif header in INTEGER_HEADERS:
                fmt = {"type": "NUMBER", "pattern": "#,##0"}
                align = "CENTER"
            elif header in PERCENT_HEADERS:
                fmt = {"type": "PERCENT", "pattern": "0.0%"}
                align = "RIGHT"
            elif header in CENTER_HEADERS:
                align = "CENTER"

            cell_fmt: dict = {"horizontalAlignment": align}
            fields = "userEnteredFormat.horizontalAlignment"
            if fmt is not None:
                cell_fmt["numberFormat"] = fmt
                fields = "userEnteredFormat(horizontalAlignment,numberFormat)"

            requests.append(
                {
                    "repeatCell": {
                        "range": _grid_range(sheet_id, 1, num_rows, col_idx, col_idx + 1),
                        "cell": {"userEnteredFormat": cell_fmt},
                        "fields": fields,
                    }
                }
            )

        # Reglas de formato condicional
        if "Puntuación" in headers:
            c = headers.index("Puntuación")
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "NUMBER_GREATER_THAN_EQ", ["8"],
                    bg={"red": 0.863, "green": 0.988, "blue": 0.906},
                    fg={"red": 0.086, "green": 0.396, "blue": 0.204},
                    bold=True,
                    index=0,
                )
            )
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "NUMBER_GREATER_THAN_EQ", ["6"],
                    bg={"red": 0.996, "green": 0.976, "blue": 0.765},
                    fg={"red": 0.522, "green": 0.302, "blue": 0.055},
                    bold=True,
                    index=1,
                )
            )

        if "Estado" in headers:
            c = headers.index("Estado")
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "TEXT_CONTAINS", ["NUEVO"],
                    bg={"red": 0.863, "green": 0.988, "blue": 0.906},
                    fg={"red": 0.086, "green": 0.396, "blue": 0.204},
                    bold=True,
                )
            )
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "TEXT_CONTAINS", ["BAJÓ"],
                    bg={"red": 0.859, "green": 0.918, "blue": 0.996},
                    fg={"red": 0.118, "green": 0.251, "blue": 0.686},
                    bold=True,
                )
            )
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "TEXT_CONTAINS", ["NO DETECTADO"],
                    bg={"red": 0.996, "green": 0.886, "blue": 0.886},
                    fg={"red": 0.600, "green": 0.106, "blue": 0.106},
                    bold=False,
                )
            )
            requests.append(
                _cond_rule(
                    sheet_id, 1, num_rows, c, c + 1,
                    "TEXT_CONTAINS", ["NO DISPONIBLE"],
                    bg={"red": 0.996, "green": 0.886, "blue": 0.886},
                    fg={"red": 0.600, "green": 0.106, "blue": 0.106},
                    bold=True,
                )
            )

        for col_name in ("Cocina Abierta", "Balcón"):
            if col_name in headers:
                c = headers.index(col_name)
                requests.append(
                    _cond_rule(
                        sheet_id, 1, num_rows, c, c + 1,
                        "TEXT_EQ", ["Sí"],
                        bg={"red": 0.925, "green": 0.992, "blue": 0.961},
                        fg={"red": 0.024, "green": 0.373, "blue": 0.275},
                        bold=True,
                    )
                )

    # Filtro automático
    requests.append(
        {
            "setBasicFilter": {
                "filter": {
                    "range": _grid_range(sheet_id, 0, max(num_rows, 1), 0, num_cols),
                }
            }
        }
    )

    # Autoajuste y anchos personalizados para columnas largas
    requests.append(
        {
            "autoResizeDimensions": {
                "dimensions": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": 0,
                    "endIndex": num_cols,
                }
            }
        }
    )
    for col_idx, header in enumerate(headers):
        if header in CUSTOM_COL_WIDTHS:
            requests.append(
                {
                    "updateDimensionProperties": {
                        "range": {
                            "sheetId": sheet_id,
                            "dimension": "COLUMNS",
                            "startIndex": col_idx,
                            "endIndex": col_idx + 1,
                        },
                        "properties": {"pixelSize": CUSTOM_COL_WIDTHS[header]},
                        "fields": "pixelSize",
                    }
                }
            )

    return requests


def _build_chart_request(
    sheet_id: int,
    num_rows: int,
    chart_type: str,
    title: str,
    domain_col: int,
    series_specs: list[tuple[int, dict]],
    anchor_row: int,
    anchor_col: int,
    width: int = 520,
    height: int = 320,
    x_title: str = "",
    y_title: str = "",
) -> dict:
    is_horizontal_bar = chart_type == "BAR"
    series_axis = "BOTTOM_AXIS" if is_horizontal_bar else "LEFT_AXIS"
    domain_axis = "LEFT_AXIS" if is_horizontal_bar else "BOTTOM_AXIS"

    series_payload = [
        {
            "series": {
                "sourceRange": {
                    "sources": [_grid_range(sheet_id, 0, num_rows, col_idx, col_idx + 1)]
                }
            },
            "targetAxis": series_axis,
            "colorStyle": {"rgbColor": color},
        }
        for col_idx, color in series_specs
    ]

    return {
        "addChart": {
            "chart": {
                "spec": {
                    "title": title,
                    "basicChart": {
                        "chartType": chart_type,
                        "legendPosition": "BOTTOM_LEGEND" if len(series_specs) > 1 else "NO_LEGEND",
                        "headerCount": 1,
                        "axis": [
                            {"position": domain_axis, "title": x_title},
                            {"position": series_axis, "title": y_title},
                        ],
                        "domains": [
                            {
                                "domain": {
                                    "sourceRange": {
                                        "sources": [
                                            _grid_range(sheet_id, 0, num_rows, domain_col, domain_col + 1)
                                        ]
                                    }
                                }
                            }
                        ],
                        "series": series_payload,
                    },
                },
                "position": {
                    "overlayPosition": {
                        "anchorCell": {
                            "sheetId": sheet_id,
                            "rowIndex": anchor_row,
                            "columnIndex": anchor_col,
                        },
                        "widthPixels": width,
                        "heightPixels": height,
                    }
                },
            }
        }
    }


def _build_resumen_charts(
    sheet_id: int,
    num_rows: int,
    operacion: str,
    theme: dict,
) -> list[dict]:
    """Genera 4 gráficas comparativas por barrio para el resumen."""
    if num_rows <= 1:
        return []

    if operacion == "venta":
        price_col = 3
        price_title = "Promedio Precio Venta por Barrio (COP)"
        price_axis = "Precio Venta (COP)"
    else:
        price_col = 4
        price_title = "Promedio Total Mensual por Barrio (COP)"
        price_axis = "Total Mensual (COP)"

    return [
        _build_chart_request(
            sheet_id=sheet_id,
            num_rows=num_rows,
            chart_type="COLUMN",
            title="Ofertas Activas por Barrio",
            domain_col=0,
            series_specs=[(2, theme["header"])],
            anchor_row=0,
            anchor_col=9,
            width=520,
            height=320,
            x_title="Barrio",
            y_title="Ofertas",
        ),
        _build_chart_request(
            sheet_id=sheet_id,
            num_rows=num_rows,
            chart_type="BAR",
            title=price_title,
            domain_col=0,
            series_specs=[(price_col, theme["accent1"])],
            anchor_row=0,
            anchor_col=16,
            width=540,
            height=320,
            x_title="Barrio",
            y_title=price_axis,
        ),
        _build_chart_request(
            sheet_id=sheet_id,
            num_rows=num_rows,
            chart_type="COLUMN",
            title="Promedio $/m² por Barrio",
            domain_col=0,
            series_specs=[(5, theme["accent2"])],
            anchor_row=17,
            anchor_col=9,
            width=520,
            height=320,
            x_title="Barrio",
            y_title="COP / m²",
        ),
        _build_chart_request(
            sheet_id=sheet_id,
            num_rows=num_rows,
            chart_type="COLUMN",
            title="% Cocina Abierta vs % Balcón por Barrio",
            domain_col=0,
            series_specs=[(6, theme["accent1"]), (7, theme["accent2"])],
            anchor_row=17,
            anchor_col=16,
            width=540,
            height=320,
            x_title="Barrio",
            y_title="Porcentaje",
        ),
    ]


def _build_top_rows(
    active_listings: list[EvaluatedListing],
    manual_notes: dict[str, tuple[str, str, str]],
    operacion: str,
    include_motivos: bool = False,
) -> list[list[object]]:
    if include_motivos:
        headers = AJUSTES_VENTAS_HEADERS if operacion == "venta" else AJUSTES_ARRIENDOS_HEADERS
        fotos_limit: int | None = ADJUSTMENT_MAX_FOTOS
    else:
        headers = TOP_VENTAS_HEADERS if operacion == "venta" else TOP_SEMANA_HEADERS
        fotos_limit = None
    rows: list[list[object]] = [headers]
    for item in active_listings:
        estado_visita, notas_personales, checklist_visita = manual_notes.get(
            item.fingerprint, ("", "", "")
        )
        common_prefix: list[object] = [
            item.fingerprint,
            item.score,
            item.estado,
            item.zona,
            item.barrio,
            item.direccion or "No publicada",
            item.latitud if item.latitud is not None else "",
            item.longitud if item.longitud is not None else "",
            item.estrato,
            round(item.area, 1),
            item.habitaciones,
            item.banos,
            item.parqueaderos,
            item.antiguedad or "No especificada",
        ]
        if operacion == "venta":
            money_cols: list[object] = [item.precio_venta, item.administracion]
        else:
            money_cols = [item.canon, item.administracion, item.costo_total]

        extra_cols: list[object] = [item.motivos_ajuste] if include_motivos else []

        rows.append(
            [
                *common_prefix,
                *money_cols,
                "Sí" if item.admin_estimada_flag else "No",
                "Sí" if item.cocina_abierta else "No",
                "Sí" if item.balcon else "No",
                round(item.costo_m2, 0),
                item.etiquetas_confort,
                item.dias_en_mercado,
                *extra_cols,
                _format_fotos(item.fotos, limit=fotos_limit),
                _format_sources(item.portales_enlaces),
                _format_urls(item.portales_enlaces),
                item.fecha_ultima_deteccion,
                estado_visita,
                notas_personales,
                checklist_visita,
            ]
        )
    return rows


def _build_historico_rows(full_history: list[dict], operacion: str) -> list[list[object]]:
    headers = HISTORICO_VENTAS_HEADERS if operacion == "venta" else HISTORICO_ARRIENDOS_HEADERS
    rows: list[list[object]] = [headers]
    for rec in full_history:
        history_events = rec.get("price_history") or []
        cambios_str = " -> ".join(
            f"{ev['fecha'][:10]}: ${ev['costo_total']:,} ({ev['evento']})".replace(",", ".")
            for ev in history_events
        )
        if operacion == "venta":
            money_cols: list[object] = [rec.get("precio_venta") or rec["costo_total"], rec["administracion"]]
        else:
            money_cols = [rec["canon"], rec["administracion"], rec["costo_total"]]

        rows.append(
            [
                rec["fingerprint"],
                rec["estado"],
                "Sí" if rec["activo"] else "No",
                rec["zona"],
                rec["barrio"],
                rec.get("direccion") or "No publicada",
                rec["latitud"] if rec.get("latitud") is not None else "",
                rec["longitud"] if rec.get("longitud") is not None else "",
                rec["estrato"],
                round(float(rec["area"]), 1),
                rec["habitaciones"],
                rec["banos"],
                rec["parqueaderos"],
                rec.get("antiguedad") or "No especificada",
                *money_cols,
                rec["ahorro_cop"],
                cambios_str,
                rec.get("etiquetas_confort") or "",
                rec.get("dias_en_mercado", 0),
                _format_fotos(rec.get("fotos")),
                rec["fecha_primera_deteccion"],
                rec["fecha_ultima_deteccion"],
                rec["score"],
                _format_sources(rec["portales_enlaces"]),
                _format_urls(rec["portales_enlaces"]),
            ]
        )
    return rows


def _build_resumen_rows(active_listings: list[EvaluatedListing], operacion: str) -> list[list[object]]:
    headers = RESUMEN_VENTAS_HEADERS if operacion == "venta" else RESUMEN_ARRIENDOS_HEADERS
    grouped: dict[str, list[EvaluatedListing]] = defaultdict(list)
    for item in active_listings:
        grouped[item.barrio_normalizado].append(item)

    rows: list[list[object]] = [headers]
    for barrio_norm, items in sorted(grouped.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        count = len(items)
        avg_main = round(
            sum((x.precio_venta if operacion == "venta" else x.canon) for x in items) / count
        )
        avg_secondary = round(
            sum((x.administracion if operacion == "venta" else x.costo_total) for x in items) / count
        )
        avg_m2 = round(sum(x.costo_m2 for x in items) / count)
        pct_cocina = round(sum(1 for x in items if x.cocina_abierta) / count, 4)
        pct_balcon = round(sum(1 for x in items if x.balcon) / count, 4)
        zona_pred = items[0].zona
        rows.append(
            [
                barrio_norm.title(),
                zona_pred,
                count,
                avg_main,
                avg_secondary,
                avg_m2,
                pct_cocina,
                pct_balcon,
            ]
        )
    return rows


def _record_to_evaluated(rec: dict, operacion: str) -> EvaluatedListing:
    links = [tuple(x) for x in (rec.get("portales_enlaces") or [])]
    return EvaluatedListing(
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
        estado=rec.get("estado") or "NO DISPONIBLE",
        ahorro_cop=int(rec.get("ahorro_cop") or 0),
        portales_enlaces=links,
        fecha_primera_deteccion=rec.get("fecha_primera_deteccion") or "",
        fecha_ultima_deteccion=rec.get("fecha_ultima_deteccion") or "",
        direccion=rec.get("direccion") or "",
        operacion=rec.get("operacion") or operacion,
        precio_venta=int(rec.get("precio_venta") or 0),
        tiene_ascensor=True,
        fotos=list(rec.get("fotos") or []),
        antiguedad=rec.get("antiguedad") or "",
        dias_en_mercado=int(rec.get("dias_en_mercado") or 0),
        etiquetas_confort=rec.get("etiquetas_confort") or "",
        categoria_filtro=rec.get("categoria_filtro") or "exacto",
        motivos_ajuste=rec.get("motivos_ajuste") or "",
    )


def _append_unavailable_favorites(
    active_listings: list[EvaluatedListing],
    full_history: list[dict],
    manual_notes: dict[str, tuple[str, str, str]],
    operacion: str,
) -> list[EvaluatedListing]:
    """Conserva favoritos marcados aunque ya no estén activos, mostrando su estado NO DISPONIBLE."""
    active_fps = {item.fingerprint for item in active_listings}
    history_by_fp = {rec["fingerprint"]: rec for rec in full_history}
    merged = list(active_listings)

    for fp, (estado_visita, _, _) in manual_notes.items():
        if estado_visita not in ("Nos gusta", "Agendar visita"):
            continue
        if fp in active_fps:
            continue
        rec = history_by_fp.get(fp)
        if not rec:
            continue
        merged.append(_record_to_evaluated(rec, operacion))

    return merged


def export_to_sheets(
    active_arriendos: list[EvaluatedListing],
    history_arriendos: list[dict],
    active_ventas: list[EvaluatedListing],
    history_ventas: list[dict],
    ajustes_arriendos: list[EvaluatedListing] | None = None,
    ajustes_ventas: list[EvaluatedListing] | None = None,
    history_ajustes_arriendos: list[dict] | None = None,
    history_ajustes_ventas: list[dict] | None = None,
    spreadsheet_id: str = SPREADSHEET_ID,
    credentials_value: str = GOOGLE_CREDENTIALS_JSON,
) -> None:
    """Actualiza las pestañas (exactos y ajustes razonables) con formato visual y gráficas."""
    if not spreadsheet_id:
        raise ValueError("SPREADSHEET_ID no está configurado en .env.")

    ajustes_arr = ajustes_arriendos or []
    ajustes_vta = ajustes_ventas or []
    hist_adj_arr = history_ajustes_arriendos if history_ajustes_arriendos is not None else history_arriendos
    hist_adj_vta = history_ajustes_ventas if history_ajustes_ventas is not None else history_ventas

    creds = _load_credentials(credentials_value)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(spreadsheet_id)

    # Preparar hojas y preservar apuntes manuales en Exactos y Ajustes Razonables
    ws_top_arr = _get_or_create_worksheet(spreadsheet, SHEET_TOP_SEMANA, rows=500, cols=len(TOP_SEMANA_HEADERS))
    notes_arr = _read_manual_notes(ws_top_arr)
    top_arr_listings = _append_unavailable_favorites(
        active_arriendos, history_arriendos, notes_arr, "arriendo"
    )

    ws_hist_arr = _get_or_create_worksheet(spreadsheet, SHEET_HISTORICO, rows=2000, cols=len(HISTORICO_ARRIENDOS_HEADERS))
    ws_res_arr = _get_or_create_worksheet(spreadsheet, SHEET_RESUMEN_BARRIOS, rows=60, cols=26)

    ws_adj_arr = _get_or_create_worksheet(spreadsheet, SHEET_AJUSTES_ARRIENDOS, rows=500, cols=len(AJUSTES_ARRIENDOS_HEADERS))
    notes_adj_arr = _read_manual_notes(ws_adj_arr)
    adj_arr_listings = _append_unavailable_favorites(
        ajustes_arr, hist_adj_arr, notes_adj_arr, "arriendo"
    )
    ws_res_adj_arr = _get_or_create_worksheet(spreadsheet, SHEET_RESUMEN_AJUSTES_ARRIENDOS, rows=60, cols=26)

    ws_top_vta = _get_or_create_worksheet(spreadsheet, SHEET_TOP_VENTAS, rows=500, cols=len(TOP_VENTAS_HEADERS))
    notes_vta = _read_manual_notes(ws_top_vta)
    top_vta_listings = _append_unavailable_favorites(
        active_ventas, history_ventas, notes_vta, "venta"
    )

    ws_hist_vta = _get_or_create_worksheet(spreadsheet, SHEET_HISTORICO_VENTAS, rows=2000, cols=len(HISTORICO_VENTAS_HEADERS))
    ws_res_vta = _get_or_create_worksheet(spreadsheet, SHEET_RESUMEN_BARRIOS_VENTAS, rows=60, cols=26)

    ws_adj_vta = _get_or_create_worksheet(spreadsheet, SHEET_AJUSTES_VENTAS, rows=500, cols=len(AJUSTES_VENTAS_HEADERS))
    notes_adj_vta = _read_manual_notes(ws_adj_vta)
    adj_vta_listings = _append_unavailable_favorites(
        ajustes_vta, hist_adj_vta, notes_adj_vta, "venta"
    )
    ws_res_adj_vta = _get_or_create_worksheet(spreadsheet, SHEET_RESUMEN_AJUSTES_VENTAS, rows=60, cols=26)

    tables = [
        (ws_top_arr, _build_top_rows(top_arr_listings, notes_arr, "arriendo"), THEME_ARRIENDO, None),
        (ws_hist_arr, _build_historico_rows(history_arriendos, "arriendo"), THEME_ARRIENDO, None),
        (ws_res_arr, _build_resumen_rows(active_arriendos, "arriendo"), THEME_ARRIENDO, "arriendo"),
        (ws_adj_arr, _build_top_rows(adj_arr_listings, notes_adj_arr, "arriendo", include_motivos=True), THEME_ARRIENDO, None),
        (ws_res_adj_arr, _build_resumen_rows(ajustes_arr, "arriendo"), THEME_ARRIENDO, "arriendo"),
        (ws_top_vta, _build_top_rows(top_vta_listings, notes_vta, "venta"), THEME_VENTA, None),
        (ws_hist_vta, _build_historico_rows(history_ventas, "venta"), THEME_VENTA, None),
        (ws_res_vta, _build_resumen_rows(active_ventas, "venta"), THEME_VENTA, "venta"),
        (ws_adj_vta, _build_top_rows(adj_vta_listings, notes_adj_vta, "venta", include_motivos=True), THEME_VENTA, None),
        (ws_res_adj_vta, _build_resumen_rows(ajustes_vta, "venta"), THEME_VENTA, "venta"),
    ]

    for ws, rows, _, _ in tables:
        _write_table_values(ws, rows)

    # Asegurar grilla suficiente en resúmenes para anclar las gráficas sin desbordar columnas
    for ws, rows, _, op in tables:
        if op is not None:
            min_rows = max(60, len(rows) + 10)
            if ws.row_count < min_rows or ws.col_count < 26:
                ws.resize(rows=max(ws.row_count, min_rows), cols=max(ws.col_count, 26))

    meta = spreadsheet.fetch_sheet_metadata()
    meta_by_id = {
        s["properties"]["sheetId"]: s
        for s in meta.get("sheets", [])
        if "properties" in s and "sheetId" in s["properties"]
    }

    batch_requests: list[dict] = []
    for ws, rows, theme, resumen_op in tables:
        sid = ws.id
        sheet_meta = meta_by_id.get(sid, {})
        batch_requests.extend(
            _build_sheet_styling_requests(
                sheet_id=sid,
                sheet_meta=sheet_meta,
                headers=rows[0],
                num_rows=len(rows),
                theme=theme,
            )
        )
        if resumen_op is not None and len(rows) > 1:
            batch_requests.extend(
                _build_resumen_charts(
                    sheet_id=sid,
                    num_rows=len(rows),
                    operacion=resumen_op,
                    theme=theme,
                )
            )

    if batch_requests:
        spreadsheet.batch_update({"requests": batch_requests})
