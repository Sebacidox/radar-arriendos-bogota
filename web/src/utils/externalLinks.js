import { BARRIOS_DATA_META } from './valuationEngine';
import { formatCOP } from './formatters';

export const OFFICIAL_LINKS = {
  HABIMETRO_BOGOTA: 'https://habi.co/ubicaciones/habimetro-bogota',
  HABITAT_MATRICULA_ARRENDADOR:
    'https://habitatbogota.gov.co/transparencia/tramites-servicios/arrendadores-0',
  SUPERNOTARIADO_CTL:
    'https://www.supernotariado.gov.co/atencion-servicios-ciudadania/tramites-y-servicios/',
  APTOLOGIA_DATOS: 'https://www.aptologia.com/datos',
};

const IDECA_CACHE_KEY = 'radar_ideca_cache_v1';
const RATES_CACHE_KEY = 'radar_rates_cache_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 1. Cazador de duplicados: búsqueda estructurada en Google por características del inmueble. */
export function buildDuplicateSearchUrl({ barrio, areaM2, adminMensual, operacion }) {
  const op = operacion === 'venta' ? 'venta' : 'arriendo';
  const adminToken =
    Number(adminMensual) > 0 ? `"${Math.round(Number(adminMensual) / 1000)}.000"` : '';
  const barrioToken = barrio ? `"${String(barrio).trim()}"` : 'Norte';
  const areaToken = Number(areaM2) > 0 ? `"${Math.round(Number(areaM2))} m2"` : '';
  const query = `apartamento ${op} ${barrioToken} ${areaToken} ${adminToken} Bogota`
    .replace(/\s+/g, ' ')
    .trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** 2. Búsqueda visual en Google Lens con la foto principal (si es URL HTTP válida). */
export function buildGoogleLensUrl(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith('http')) {
    return 'https://lens.google.com/';
  }
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
}

/** 3. API REST pública IDECA Catastro Bogotá (estrato oficial y valor de referencia por manzana). */
export async function fetchIdecaParcelInfo(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || numLat === 0 || numLng === 0) {
    return null;
  }

  const cacheCoord = `${numLat.toFixed(4)},${numLng.toFixed(4)}`;
  try {
    const rawCache = localStorage.getItem(IDECA_CACHE_KEY);
    if (rawCache) {
      const cache = JSON.parse(rawCache);
      const hit = cache?.[cacheCoord];
      if (hit && Date.now() - hit.ts < 14 * DAY_MS) {
        return hit.data;
      }
    }
  } catch {
    // Ignorar error de lectura de localStorage
  }

  const geometry = encodeURIComponent(`${numLng},${numLat}`);
  const common = `geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&f=json&returnGeometry=false`;
  const estratoUrl = `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/ordenamientoterritorial/estratificacion/MapServer/1/query?${common}&outFields=*`;
  const valorRefUrl = `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/valorreferencia/MapServer/0/query?${common}&outFields=*`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const [estRes, valRes] = await Promise.all([
      fetch(estratoUrl, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(valorRefUrl, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const estAttrs = estRes?.features?.[0]?.attributes || {};
    const valAttrs = valRes?.features?.[0]?.attributes || {};

    const estratoOficial =
      Number(estAttrs.ESTRATO ?? estAttrs.estrato ?? estAttrs.COD_ESTRATO) || null;
    const valorRefM2 =
      Number(valAttrs.V_REF ?? valAttrs.VALOR_REF ?? valAttrs.valor_ref) || null;

    if (!estratoOficial && !valorRefM2) return null;

    const result = { estratoOficial, valorRefM2 };
    try {
      const existing = JSON.parse(localStorage.getItem(IDECA_CACHE_KEY) || '{}');
      existing[cacheCoord] = { ts: Date.now(), data: result };
      localStorage.setItem(IDECA_CACHE_KEY, JSON.stringify(existing));
    } catch {
      // Ignorar si excede cuota de localStorage
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 4. Consulta semanal de tasas hipotecarias en Superfinanciera (datos.gov.co) con fallback nov 2026. */
export async function fetchMortgageRates2026() {
  const fallback = { ...BARRIOS_DATA_META.tasasFallback2026, fromApi: false };

  try {
    const rawCache = localStorage.getItem(RATES_CACHE_KEY);
    if (rawCache) {
      const parsed = JSON.parse(rawCache);
      if (parsed && Date.now() - parsed.ts < 7 * DAY_MS && parsed.data) {
        return parsed.data;
      }
    }
  } catch {
    // Ignorar error de caché
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const url =
    'https://www.datos.gov.co/resource/yvb2-ppaa.json?$limit=200&$order=fecha_corte%20DESC';

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return fallback;
    const rows = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) return fallback;

    const viviendaRates = [];
    for (const row of rows) {
      const producto = String(
        row.tipo_de_credito || row.producto || row.modalidad || ''
      ).toLowerCase();
      if (!producto.includes('vivienda') && !producto.includes('hipotec')) continue;
      if (producto.includes('vis')) continue; // Focalizar en segmento No VIS (>135/150 SMMLV)
      const rawRate = Number(
        row.tasa_efectiva_promedio_ponderada ?? row.tasa ?? row.tasa_ea
      );
      if (!Number.isFinite(rawRate)) continue;
      const rateEA = rawRate > 1 ? rawRate / 100 : rawRate;
      if (rateEA >= 0.08 && rateEA <= 0.24) {
        viviendaRates.push({
          entidad: String(row.nombre_entidad || row.entidad || '').toLowerCase(),
          rateEA,
          fecha: String(row.fecha_corte || '').slice(0, 10),
        });
      }
    }

    if (viviendaRates.length === 0) return fallback;

    const avg =
      viviendaRates.reduce((acc, r) => acc + r.rateEA, 0) / viviendaRates.length;
    const fnaMatch = viviendaRates.find((r) => r.entidad.includes('fondo nacional del ahorro'));
    const maxRate = Math.max(...viviendaRates.map((r) => r.rateEA));

    const result = {
      fnaEA: fnaMatch ? Number(fnaMatch.rateEA.toFixed(4)) : fallback.fnaEA,
      avVillasEA: fallback.avVillasEA,
      promedioNoVisEA: Number(avg.toFixed(4)),
      topeMercadoEA: Number(Math.max(maxRate, avg).toFixed(4)),
      fechaCorte: viviendaRates[0].fecha || fallback.fechaCorte,
      fromApi: true,
    };

    try {
      localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }));
    } catch {
      // Ignorar
    }
    return result;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Normaliza un celular colombiano de 10 dígitos (ej. 3001234567 -> 573001234567). */
export function normalizeWhatsAppDigits(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

/** 5. Constructor de WhatsApp de oferta (Equidad Dual + Concesión Contingente). */
export function buildNegotiationWhatsAppUrl({
  telefono = '',
  operacion = 'arriendo',
  interlocutor = 'dueno_directo',
  barrio = 'el sector',
  adminMensual = 0,
  ofertaSugerida = 0,
  palanca = 'entrada_inmediata',
  costoRemodelacion = 0,
  diasEnMercado = 0,
}) {
  const ofertaTxt = formatCOP(ofertaSugerida);
  const adminTxt = formatCOP(adminMensual);
  let text = '';

  if (operacion === 'arriendo' && interlocutor === 'dueno_directo') {
    const tiempoTxt =
      diasEnMercado > 30 ? ` viendo que lleva ${diasEnMercado} días disponible y` : '';
    text =
      `Buenas tardes, nos gustó mucho el apartamento en ${barrio}. ` +
      `Somos una familia tranquila y cuidadosa buscando estabilidad para quedarnos varios años. ` +
      `Revisando apartamentos comparables en ${barrio} con administración similar (${adminTxt}),` +
      `${tiempoTxt} nuestro presupuesto mensual real está ajustado a un canon de ${ofertaTxt} más la administración. ` +
      `Si le sirve este valor, tenemos documentación lista para firmar esta misma semana y recibirlo de inmediato, ` +
      `evitándole otro mes desocupado. ¿Le parece si avanzamos así?`;
  } else if (operacion === 'arriendo') {
    const tiempoTxt =
      diasEnMercado > 30
        ? `el apartamento lleva ${diasEnMercado} días disponible`
        : 'revisamos el presupuesto total con la administración';
    text =
      `Buenas tardes, gracias por la atención con el apartamento en ${barrio}. ` +
      `Tenemos todos los documentos organizados para radicar el estudio hoy mismo sin demoras. ` +
      `Como vimos que ${tiempoTxt} (administración de ${adminTxt}), quisiéramos presentar formalmente al propietario ` +
      `una oferta de ${ofertaTxt} de canon con ingreso inmediato; o, si prefiere sostener el valor publicado, ` +
      `cerrar hoy mismo con 15 días de gracia para mudanza y revisando el cobro de derechos de contrato. ` +
      `¿Nos ayuda trasladándole estas dos alternativas al propietario?`;
  } else {
    const respaldo =
      palanca === 'contado'
        ? 'recursos propios disponibles'
        : 'crédito hipotecario preaprobado';
    const arreglosTxt =
      Number(costoRemodelacion) > 0
        ? ` y considerando que invertiremos aprox. ${formatCOP(costoRemodelacion)} en actualizaciones`
        : '';
    const adminParte =
      Number(adminMensual) > 0 ? ` —sumado a la administración actual de ${adminTxt}—` : '';
    text =
      `Buenas tardes, agradecemos mucho la visita al apartamento en ${barrio}. ` +
      `Nos interesa seriamente y ya contamos con ${respaldo}, lo que nos permite firmar promesa en 10 días sin demoras. ` +
      `Al revisar inmuebles comparables a menos de cinco cuadras${arreglosTxt}${adminParte}, ` +
      `nuestra oferta formal es de ${ofertaTxt}, aplicando la división legal 50/50 en notaría e impuesto de registro ` +
      `y entregando 10% en arras confirmatorias tras validar el certificado de tradición y el acta de la última asamblea. ` +
      `Esta oferta tiene vigencia de 72 horas. Si le funciona, podemos coordinar mañana la revisión de documentos.`;
  }

  const normalizedDigits = normalizeWhatsAppDigits(telefono);
  const base = normalizedDigits ? `https://wa.me/${normalizedDigits}` : 'https://wa.me/';
  return { text, url: `${base}?text=${encodeURIComponent(text)}` };
}
