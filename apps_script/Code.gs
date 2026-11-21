/**
 * Puente gratuito (Google Apps Script) para conectar Google Sheets de
 * radar-arriendos-bogota con una aplicación web externa sin servidor.
 *
 * Despliegue:
 * 1. En Google Sheets: Extensiones -> Apps Script.
 * 2. Pega este contenido en Code.gs y guarda.
 * 3. Implementar -> Nueva implementación -> Tipo: Aplicación web.
 *    - Ejecutar como: Yo (propietario de la hoja).
 *    - Quién tiene acceso: Cualquier usuario (para consumir desde la web sin login OAuth).
 */

var SHEET_NAMES = {
  ARRIENDOS: "Top_Semana",
  VENTAS: "Top semana ventas",
  HISTORICO_ARRIENDOS: "Historico_Completo",
  HISTORICO_VENTAS: "Histórico ventas",
  RESUMEN_ARRIENDOS: "Resumen_Barrios",
  RESUMEN_VENTAS: "Resumen_Barrios_Ventas",
  MEJORAS: "Mejoras",
};

// Opcional: escribe aquí un correo distinto si no quieres usar el del dueño del Google Sheet
var NOTIFY_EMAIL = "";

var MEJORAS_HEADERS = [
  "ID",
  "Fecha",
  "Autor",
  "Tipo",
  "Sección",
  "Descripción",
  "Estado",
  "Nota_Respuesta",
];

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone() || "America/Bogota";

    var arriendos = readSheetAsObjects_(ss, SHEET_NAMES.ARRIENDOS, tz);
    var ventas = readSheetAsObjects_(ss, SHEET_NAMES.VENTAS, tz);
    var historicoCompleto = readSheetAsObjects_(ss, SHEET_NAMES.HISTORICO_ARRIENDOS, tz);
    var historicoVentas = readSheetAsObjects_(ss, SHEET_NAMES.HISTORICO_VENTAS, tz);
    var resumenBarrios = readSheetAsObjects_(ss, SHEET_NAMES.RESUMEN_ARRIENDOS, tz);
    var resumenBarriosVentas = readSheetAsObjects_(ss, SHEET_NAMES.RESUMEN_VENTAS, tz);
    var mejoras = readSheetAsObjects_(ss, SHEET_NAMES.MEJORAS, tz);

    var lastUpdated = resolveLastUpdated_(arriendos, ventas, tz);

    var sheetsMap = {};
    sheetsMap[SHEET_NAMES.ARRIENDOS] = arriendos;
    sheetsMap[SHEET_NAMES.VENTAS] = ventas;
    sheetsMap[SHEET_NAMES.HISTORICO_ARRIENDOS] = historicoCompleto;
    sheetsMap[SHEET_NAMES.HISTORICO_VENTAS] = historicoVentas;
    sheetsMap[SHEET_NAMES.RESUMEN_ARRIENDOS] = resumenBarrios;
    sheetsMap[SHEET_NAMES.RESUMEN_VENTAS] = resumenBarriosVentas;
    sheetsMap[SHEET_NAMES.MEJORAS] = mejoras;

    var payload = {
      ok: true,
      lastUpdated: lastUpdated,
      sheetNames: SHEET_NAMES,
      arriendos: arriendos,
      ventas: ventas,
      historicoCompleto: historicoCompleto,
      historicoVentas: historicoVentas,
      resumenBarrios: resumenBarrios,
      resumenBarriosVentas: resumenBarriosVentas,
      mejoras: mejoras,
      sheets: sheetsMap,
    };

    return jsonResponse_(payload);
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var rawBody = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (!rawBody) {
      return jsonResponse_({ ok: false, error: "Cuerpo de solicitud vacío." });
    }

    var body = JSON.parse(rawBody);
    var action = String(body.action || "").trim();

    if (action === "submitMejora") {
      return handleSubmitMejora_(body);
    }
    if (action === "updateMejoraStatus") {
      return handleUpdateMejoraStatus_(body);
    }

    var requestedSheet = String(body.sheetName || SHEET_NAMES.ARRIENDOS).trim();
    var targetSheetName = resolveSheetName_(requestedSheet);
    var fingerprint = String(body.fingerprint || "").trim();

    if (!fingerprint) {
      return jsonResponse_({ ok: false, error: "El campo 'fingerprint' es obligatorio." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      return jsonResponse_({
        ok: false,
        error: "No se encontró la pestaña '" + targetSheetName + "'.",
      });
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return jsonResponse_({
        ok: false,
        error: "La pestaña '" + targetSheetName + "' no contiene filas de datos.",
      });
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
      return String(h || "").trim();
    });

    var fpCol = headers.indexOf("Fingerprint");
    if (fpCol === -1) {
      return jsonResponse_({
        ok: false,
        error: "No se encontró la columna 'Fingerprint' en '" + targetSheetName + "'.",
      });
    }

    var fpValues = sheet.getRange(2, fpCol + 1, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < fpValues.length; i++) {
      if (String(fpValues[i][0] || "").trim() === fingerprint) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      return jsonResponse_({
        ok: false,
        error: "No se encontró el inmueble con Fingerprint '" + fingerprint + "' en '" + targetSheetName + "'.",
      });
    }

    var fieldMap = [
      { payloadKey: "estadoVisita", headerName: "Estado_Visita", isJson: false },
      { payloadKey: "notasPersonales", headerName: "Notas_Personales", isJson: false },
      { payloadKey: "checklistVisita", headerName: "Checklist_Visita", isJson: true },
    ];

    var updatedFields = [];
    for (var j = 0; j < fieldMap.length; j++) {
      var spec = fieldMap[j];
      if (!Object.prototype.hasOwnProperty.call(body, spec.payloadKey)) {
        continue;
      }
      var colIdx = headers.indexOf(spec.headerName);
      if (colIdx === -1) {
        continue;
      }
      var rawVal = body[spec.payloadKey];
      var cellVal;
      if (rawVal === null || rawVal === undefined) {
        cellVal = "";
      } else if (spec.isJson && typeof rawVal !== "string") {
        cellVal = JSON.stringify(rawVal);
      } else {
        cellVal = String(rawVal);
      }
      sheet.getRange(targetRow, colIdx + 1).setValue(cellVal);
      updatedFields.push(spec.headerName);
    }

    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      sheetName: targetSheetName,
      fingerprint: fingerprint,
      updatedRow: targetRow,
      updatedFields: updatedFields,
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function readSheetAsObjects_(ss, sheetName, tz) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return [];
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return [];
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rawHeaders = values[0];

  // Determinar columnas válidas con encabezado no vacío
  var validCols = [];
  for (var c = 0; c < rawHeaders.length; c++) {
    var h = String(rawHeaders[c] || "").trim();
    if (h) {
      validCols.push({ index: c, name: h });
    }
  }
  if (validCols.length === 0) {
    return [];
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var rowArr = values[r];
    var obj = {};
    var hasContent = false;

    for (var k = 0; k < validCols.length; k++) {
      var col = validCols[k];
      var val = normalizeCellValue_(rowArr[col.index], tz);
      if (val !== "" && val !== null && val !== undefined) {
        hasContent = true;
      }
      obj[col.name] = val;
    }

    if (hasContent) {
      rows.push(obj);
    }
  }

  return rows;
}

function handleSubmitMejora_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || "America/Bogota";

  var autor = String(body.autor || "Familia").trim();
  var tipo = String(body.tipo || "Idea").trim();
  var seccion = String(body.seccion || "General").trim();
  var descripcion = String(body.descripcion || "").trim();

  if (!descripcion) {
    return jsonResponse_({ ok: false, error: "La descripción de la mejora o falla no puede estar vacía." });
  }

  var sheet = getOrCreateMejorasSheet_(ss);
  var now = new Date();
  var fechaStr = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm");
  var id = "M-" + Utilities.formatDate(now, tz, "yyyyMMdd-HHmmss");
  var estado = "Pendiente";

  sheet.appendRow([id, fechaStr, autor, tipo, seccion, descripcion, estado, ""]);
  SpreadsheetApp.flush();

  var emailSent = false;
  var emailWarning = "";
  try {
    var recipient = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    if (recipient) {
      var subject = "[Radar Inmobiliario · " + tipo + "] " + seccion + " — " + autor;
      var textBody =
        "Nueva entrada en la pestaña Mejoras del Radar Inmobiliario Familiar:\n\n" +
        "ID: " + id + "\n" +
        "Fecha: " + fechaStr + "\n" +
        "Enviado por: " + autor + "\n" +
        "Tipo: " + tipo + "\n" +
        "Sección: " + seccion + "\n" +
        "Estado: " + estado + "\n\n" +
        "Mensaje:\n" + descripcion + "\n\n" +
        "---\n" +
        "Hoja de cálculo: " + ss.getUrl() + "\n" +
        "Web: https://radar-arriendos-familia-contreras-romero.vercel.app";
      MailApp.sendEmail(recipient, subject, textBody);
      emailSent = true;
    }
  } catch (mailErr) {
    emailWarning = mailErr && mailErr.message ? mailErr.message : String(mailErr);
  }

  return jsonResponse_({
    ok: true,
    emailSent: emailSent,
    emailWarning: emailWarning,
    mejora: {
      ID: id,
      Fecha: fechaStr,
      Autor: autor,
      Tipo: tipo,
      "Sección": seccion,
      "Descripción": descripcion,
      Estado: estado,
      Nota_Respuesta: "",
    },
  });
}

function handleUpdateMejoraStatus_(body) {
  var id = String(body.id || "").trim();
  if (!id) {
    return jsonResponse_({ ok: false, error: "El campo 'id' es obligatorio." });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.MEJORAS);
  if (!sheet) {
    return jsonResponse_({ ok: false, error: "La pestaña 'Mejoras' aún no existe." });
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return jsonResponse_({ ok: false, error: "La pestaña 'Mejoras' está vacía." });
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || "").trim();
  });
  var idCol = headers.indexOf("ID");
  if (idCol === -1) {
    return jsonResponse_({ ok: false, error: "No se encontró la columna 'ID' en 'Mejoras'." });
  }

  var idValues = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  var targetRow = -1;
  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0] || "").trim() === id) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) {
    return jsonResponse_({ ok: false, error: "No se encontró la mejora con ID '" + id + "'." });
  }

  if (Object.prototype.hasOwnProperty.call(body, "estado")) {
    var estadoCol = headers.indexOf("Estado");
    if (estadoCol !== -1) {
      sheet.getRange(targetRow, estadoCol + 1).setValue(String(body.estado || "").trim());
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "notaRespuesta")) {
    var notaCol = headers.indexOf("Nota_Respuesta");
    if (notaCol !== -1) {
      sheet.getRange(targetRow, notaCol + 1).setValue(String(body.notaRespuesta || ""));
    }
  }

  SpreadsheetApp.flush();
  return jsonResponse_({ ok: true, id: id, updatedRow: targetRow });
}

function getOrCreateMejorasSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.MEJORAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.MEJORAS);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, MEJORAS_HEADERS.length).setValues([MEJORAS_HEADERS]);
    sheet.getRange(1, 1, 1, MEJORAS_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizeCellValue_(val, tz) {
  if (val === null || val === undefined) {
    return "";
  }
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    var timeStr = Utilities.formatDate(val, tz, "HH:mm:ss");
    if (timeStr !== "00:00:00") {
      return Utilities.formatDate(val, tz, "yyyy-MM-dd HH:mm");
    }
    return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  }
  return val;
}

function resolveSheetName_(name) {
  var lower = String(name || "").toLowerCase();
  if (lower === "arriendos" || lower === "top_semana") {
    return SHEET_NAMES.ARRIENDOS;
  }
  if (lower === "ventas" || lower === "top semana ventas") {
    return SHEET_NAMES.VENTAS;
  }
  if (lower === "historico_completo") {
    return SHEET_NAMES.HISTORICO_ARRIENDOS;
  }
  if (lower === "histórico ventas" || lower === "historico ventas") {
    return SHEET_NAMES.HISTORICO_VENTAS;
  }
  if (lower === "resumen_barrios") {
    return SHEET_NAMES.RESUMEN_ARRIENDOS;
  }
  if (lower === "resumen_barrios_ventas") {
    return SHEET_NAMES.RESUMEN_VENTAS;
  }
  if (lower === "mejoras") {
    return SHEET_NAMES.MEJORAS;
  }
  return name;
}

function resolveLastUpdated_(arriendos, ventas, tz) {
  var latest = "";
  var allRows = arriendos.concat(ventas);
  for (var i = 0; i < allRows.length; i++) {
    var d = String(allRows[i]["Fecha Detección"] || "").trim();
    if (d && d > latest) {
      latest = d;
    }
  }
  return latest || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
