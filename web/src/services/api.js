import {
  mergeChecklistAndExtras,
  parseChecklist,
  parseListingExtras,
} from '../utils/formatters';

const LOCAL_MANUAL_KEY = 'radar_manual_listings_v1';

export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwxAM1wrNEMJ9sLopwkRB70opKP67Zs4n4dcGWVwsTGU-rXfVWjD9sKyMteWXh_v7j3/exec';

export const APPS_SCRIPT_URL =
  import.meta.env.VITE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;

function parseNumber(val, fallback = 0) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (val === null || val === undefined || val === '') return fallback;
  const str = String(val).trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (!str) return fallback;

  // Formato con coma decimal (p. ej. "75,0" o "4,7334")
  if (str.includes(',') && !str.includes('.')) {
    const n = Number(str.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  // Formato con miles por punto y coma decimal (p. ej. "3.240.000,50")
  if (str.includes('.') && str.includes(',')) {
    const n = Number(str.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  // Formato COP con separador de miles (p. ej. "3.240.000")
  if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
    const n = Number(str.replace(/\./g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolSi(val) {
  if (typeof val === 'boolean') return val;
  const norm = String(val || '').trim().toLowerCase();
  return norm === 'sí' || norm === 'si' || norm === 'true' || norm === '1';
}

function splitPipeList(val) {
  if (!val) return [];
  return String(val)
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http://') || s.startsWith('https://'));
}

function splitLinks(val) {
  if (!val) return [];
  return String(val)
    .split(/[\n|]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http://') || s.startsWith('https://'));
}

function splitComfortTags(val) {
  if (!val) return [];
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeListingRow(row, operacion, sheetName, origen = 'radar') {
  const isVenta = operacion === 'venta';
  const canon = isVenta ? 0 : parseNumber(row['Canon'], 0);
  const precioVenta = isVenta ? parseNumber(row['Precio Venta'], 0) : 0;
  const admin = isVenta
    ? parseNumber(row['Admin Mensual'] !== undefined ? row['Admin Mensual'] : row['Admin'], 0)
    : parseNumber(row['Admin'], 0);
  const totalMensual = isVenta
    ? precioVenta
    : parseNumber(row['Total Mensual'], canon + admin);
  const area = parseNumber(row['Área (m²)'], 0);
  const rawCostoM2 = isVenta
    ? parseNumber(row['Precio/m²'], 0)
    : parseNumber(row['Costo/m²'], 0);
  const costoM2 =
    rawCostoM2 > 0
      ? rawCostoM2
      : area > 0
        ? Math.round((isVenta ? precioVenta : totalMensual) / area)
        : 0;

  const lat = row['Lat'] !== '' && row['Lat'] !== undefined ? parseNumber(row['Lat'], null) : null;
  const lng = row['Lng'] !== '' && row['Lng'] !== undefined ? parseNumber(row['Lng'], null) : null;
  const extras = parseListingExtras(row['Checklist_Visita']);

  return {
    id: `${operacion}:${String(row['Fingerprint'] || '')}`,
    operacion,
    sheetName,
    origen,
    fingerprint: String(row['Fingerprint'] || '').trim(),
    score: parseNumber(row['Puntuación'], origen === 'manual' ? 7.5 : 0),
    estado: String(row['Estado'] || (origen === 'manual' ? 'Aviso propio' : '')).trim(),
    zona: String(row['Zona'] || 'Oriental').trim(),
    barrio: String(row['Barrio'] || '').trim(),
    direccion: String(row['Dirección'] || 'No publicada').trim(),
    lat,
    lng,
    estrato: parseNumber(row['Estrato'], 4),
    area,
    hab: parseNumber(row['Hab'], 0),
    banos: parseNumber(row['Baños'], 0),
    garajes: parseNumber(row['Garajes'], 0),
    antiguedad: String(row['Antiguedad'] || 'No especificada').trim(),
    canon,
    precioVenta,
    admin,
    totalMensual,
    adminEstimada: parseBoolSi(row['Admin Estimada?']),
    cocinaAbierta: parseBoolSi(row['Cocina Abierta']),
    balcon: parseBoolSi(row['Balcón']),
    costoM2,
    etiquetasConfort: splitComfortTags(row['Etiquetas_Confort']),
    diasEnMercado: parseNumber(row['Dias_en_Mercado'], 0),
    fotos: splitPipeList(row['Fotos']),
    fuente: String(row['Fuente'] || (origen === 'manual' ? 'Aviso propio' : '')).trim(),
    enlaces: splitLinks(row['Enlaces']),
    fechaDeteccion: String(row['Fecha Detección'] || '').trim(),
    estadoVisita: String(row['Estado_Visita'] || '').trim(),
    notasPersonales: String(row['Notas_Personales'] || '').trim(),
    checklistVisita: parseChecklist(row['Checklist_Visita']),
    legalShield: extras.legalShield,
    priceHistory: extras.priceHistory,
    meta: extras.meta,
  };
}

function normalizeResumenRow(row, operacion) {
  const isVenta = operacion === 'venta';
  const rawCocina = parseNumber(row['% Cocina Abierta'], 0);
  const rawBalcon = parseNumber(row['% Balcón'], 0);
  return {
    barrio: String(row['Barrio'] || '').trim(),
    zona: String(row['Zona'] || '').trim(),
    ofertasActivas: parseNumber(row['Ofertas Activas'], 0),
    promedioPrincipal: isVenta
      ? parseNumber(row['Promedio Precio Venta'], 0)
      : parseNumber(row['Promedio Canon'], 0),
    promedioSecundario: isVenta
      ? parseNumber(row['Promedio Admin'], 0)
      : parseNumber(row['Promedio Total Mensual'], 0),
    promedioM2: parseNumber(row['Promedio $/m²'], 0),
    pctCocinaAbierta: rawCocina <= 1 ? rawCocina * 100 : rawCocina,
    pctBalcon: rawBalcon <= 1 ? rawBalcon * 100 : rawBalcon,
  };
}

function normalizeHistoricoRow(row, operacion) {
  const isVenta = operacion === 'venta';
  return {
    fingerprint: String(row['Fingerprint'] || '').trim(),
    estado: String(row['Estado'] || '').trim(),
    activo: parseBoolSi(row['Activo']),
    zona: String(row['Zona'] || '').trim(),
    barrio: String(row['Barrio'] || '').trim(),
    area: parseNumber(row['Área (m²)'], 0),
    totalActual: isVenta
      ? parseNumber(row['Precio Venta Actual'], 0)
      : parseNumber(row['Total Mensual Actual'], 0),
    ahorroCop: parseNumber(row['Ahorro Último Cambio (COP)'], 0),
    cambiosPrecio: String(row['Cambios de Precio'] || '').trim(),
    diasEnMercado: parseNumber(row['Dias_en_Mercado'], 0),
    fechaPrimera: String(row['Fecha Primera Aparición'] || '').trim(),
    fechaUltima: String(row['Fecha Última Aparición'] || '').trim(),
    score: parseNumber(row['Puntuación'], 0),
    fuente: String(row['Fuente'] || '').trim(),
    enlaces: splitLinks(row['Enlaces']),
  };
}

function normalizeMejoraRow(row) {
  return {
    id: String(row['ID'] || '').trim(),
    fecha: String(row['Fecha'] || '').trim(),
    autor: String(row['Autor'] || 'Familia').trim(),
    tipo: String(row['Tipo'] || 'Idea').trim(),
    seccion: String(row['Sección'] || 'General').trim(),
    descripcion: String(row['Descripción'] || '').trim(),
    estado: String(row['Estado'] || 'Pendiente').trim(),
    notaRespuesta: String(row['Nota_Respuesta'] || '').trim(),
  };
}

export async function fetchRadarData() {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'GET',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Error al consultar Google Sheets (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data || data.ok === false) {
    throw new Error(data?.error || 'Respuesta inválida de Google Apps Script');
  }

  const sheetNames = data.sheetNames || {
    ARRIENDOS: 'Top_Semana',
    VENTAS: 'Top semana ventas',
  };

  const arriendos = (data.arriendos || []).map((row) =>
    normalizeListingRow(row, 'arriendo', sheetNames.ARRIENDOS || 'Top_Semana')
  );
  const ventas = (data.ventas || []).map((row) =>
    normalizeListingRow(row, 'venta', sheetNames.VENTAS || 'Top semana ventas')
  );
  const misAvisos = (data.misAvisos || [])
    .map((row) => {
      const op = String(row['Operación'] || '').toLowerCase() === 'venta' ? 'venta' : 'arriendo';
      return normalizeListingRow(
        row,
        op,
        sheetNames.MIS_AVISOS || 'Mis_Avisos',
        'manual'
      );
    })
    .filter((item) => item.fingerprint);

  const mejoras = (data.mejoras || [])
    .map(normalizeMejoraRow)
    .filter((m) => m.descripcion)
    .reverse();

  return {
    lastUpdated: String(data.lastUpdated || '').trim(),
    sheetNames,
    arriendos,
    ventas,
    misAvisos,
    resumenBarrios: (data.resumenBarrios || []).map((r) => normalizeResumenRow(r, 'arriendo')),
    resumenBarriosVentas: (data.resumenBarriosVentas || []).map((r) =>
      normalizeResumenRow(r, 'venta')
    ),
    historicoCompleto: (data.historicoCompleto || []).map((r) =>
      normalizeHistoricoRow(r, 'arriendo')
    ),
    historicoVentas: (data.historicoVentas || []).map((r) =>
      normalizeHistoricoRow(r, 'venta')
    ),
    mejoras,
  };
}

async function postToAppsScript(payload, fallbackError) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`${fallbackError} (HTTP ${response.status})`);
  }

  const result = await response.json();
  if (!result || result.ok === false) {
    const errMsg = result?.error || 'Google Apps Script rechazó la actualización';
    if (payload.action === 'submitMejora' && errMsg.includes('fingerprint')) {
      throw new Error(
        'Falta actualizar la nueva versión de Code.gs en Google Apps Script para activar el buzón de Mejoras.'
      );
    }
    throw new Error(errMsg);
  }

  return result;
}

export async function updateListingInSheets({
  sheetName,
  fingerprint,
  estadoVisita,
  notasPersonales,
  checklistVisita,
}) {
  const payload = {
    sheetName,
    fingerprint,
  };
  if (estadoVisita !== undefined) payload.estadoVisita = estadoVisita;
  if (notasPersonales !== undefined) payload.notasPersonales = notasPersonales;
  if (checklistVisita !== undefined) payload.checklistVisita = checklistVisita;

  return postToAppsScript(payload, 'No se pudo guardar en Google Sheets');
}

export async function submitMejora({ autor, tipo, seccion, descripcion }) {
  const result = await postToAppsScript(
    {
      action: 'submitMejora',
      autor,
      tipo,
      seccion,
      descripcion,
    },
    'No se pudo enviar la mejora a Google Sheets'
  );

  return {
    emailSent: Boolean(result.emailSent),
    emailWarning: String(result.emailWarning || '').trim(),
    mejora: normalizeMejoraRow(result.mejora || {}),
  };
}

export function loadLocalManualListings() {
  try {
    const raw = localStorage.getItem(LOCAL_MANUAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalManualListings(listings) {
  try {
    localStorage.setItem(LOCAL_MANUAL_KEY, JSON.stringify(listings || []));
  } catch {
    // Ignorar si localStorage no está disponible o excede cuota
  }
}

export async function saveManualListingInSheets(listing) {
  const checklistPayload = mergeChecklistAndExtras(listing.checklistVisita, {
    legalShield: listing.legalShield,
    priceHistory: listing.priceHistory,
    meta: listing.meta,
  });

  return postToAppsScript(
    {
      action: 'saveManualListing',
      listing: {
        fingerprint: listing.fingerprint,
        operacion: listing.operacion,
        barrio: listing.barrio,
        direccion: listing.direccion,
        zona: listing.zona,
        estrato: listing.estrato,
        area: listing.area,
        hab: listing.hab,
        banos: listing.banos,
        garajes: listing.garajes,
        canon: listing.canon,
        precioVenta: listing.precioVenta,
        admin: listing.admin,
        etiquetasConfort: listing.etiquetasConfort,
        fuente: listing.fuente,
        enlaces: (listing.enlaces || []).filter((u) => String(u).startsWith('http')),
        fechaDeteccion: listing.fechaDeteccion,
        estadoVisita: listing.estadoVisita || '',
        notasPersonales: listing.notasPersonales || '',
        checklistPayload,
      },
    },
    'No se pudo sincronizar el aviso propio con Google Sheets'
  );
}

export async function deleteManualListingInSheets(fingerprint) {
  return postToAppsScript(
    {
      action: 'deleteManualListing',
      fingerprint,
    },
    'No se pudo eliminar el aviso propio de Google Sheets'
  );
}
