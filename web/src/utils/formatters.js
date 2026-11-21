export const CHECKLIST_ITEMS = [
  { key: 'parqueadero', label: '1. Parqueadero independiente vs. servidumbre' },
  { key: 'adminReal', label: '2. Valor real de administración confirmado en portería' },
  { key: 'aguaHumedad', label: '3. Presión de agua y revisión de humedades' },
  { key: 'ruidoVentanas', label: '4. Ruido real con ventanas cerradas' },
  { key: 'zonasAscensor', label: '5. Estado de zonas comunes y ascensor' },
];

export function emptyChecklist() {
  return {
    parqueadero: false,
    adminReal: false,
    aguaHumedad: false,
    ruidoVentanas: false,
    zonasAscensor: false,
  };
}

export function parseChecklist(raw) {
  const base = emptyChecklist();
  if (!raw) return base;
  if (typeof raw === 'object') {
    for (const item of CHECKLIST_ITEMS) {
      base[item.key] = Boolean(raw[item.key]);
    }
    return base;
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object') {
      for (const item of CHECKLIST_ITEMS) {
        base[item.key] = Boolean(parsed[item.key]);
      }
    }
  } catch {
    // Mantener checklist vacío si el texto previo no es JSON válido
  }
  return base;
}

/** Lee datos enriquecidos (_legalShield, _priceHistory, _meta) preservados en Checklist_Visita. */
export function parseListingExtras(raw) {
  const fallback = { legalShield: null, priceHistory: [], meta: {} };
  if (!raw) return fallback;
  let parsed = raw;
  if (typeof raw !== 'object') {
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return fallback;
    }
  }
  if (!parsed || typeof parsed !== 'object') return fallback;

  const legalShield =
    parsed._legalShield && typeof parsed._legalShield === 'object'
      ? { ...parsed._legalShield }
      : null;
  const priceHistory = Array.isArray(parsed._priceHistory)
    ? parsed._priceHistory.filter(
        (p) => p && typeof p === 'object' && Number.isFinite(Number(p.price))
      )
    : [];
  const meta =
    parsed._meta && typeof parsed._meta === 'object' ? { ...parsed._meta } : {};

  return { legalShield, priceHistory, meta };
}

/** Combina los 5 checks presenciales y los extras del análisis en un único objeto para Google Sheets. */
export function mergeChecklistAndExtras(checklist, extras = {}) {
  const out = emptyChecklist();
  if (checklist && typeof checklist === 'object') {
    for (const item of CHECKLIST_ITEMS) {
      out[item.key] = Boolean(checklist[item.key]);
    }
  }
  if (extras?.legalShield && Object.keys(extras.legalShield).length > 0) {
    out._legalShield = extras.legalShield;
  }
  if (Array.isArray(extras?.priceHistory) && extras.priceHistory.length > 0) {
    out._priceHistory = extras.priceHistory;
  }
  if (extras?.meta && Object.keys(extras.meta).length > 0) {
    out._meta = extras.meta;
  }
  return out;
}

export function formatCOP(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(num));
}

export function formatCompactCOP(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    const millions = num / 1_000_000;
    return `$${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  return formatCOP(num);
}

export function normalizeBarrioKey(barrio) {
  if (!barrio) return '';
  let text = String(barrio)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(bogota(\s+d\.?\s*c\.?)?|colombia|zona\s+norte|zona\s+urbana|zona\s+rural)\b/g, ' ')
    .replace(/[,;/\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = {
    'el contador': 'contador',
    'los caobos': 'caobos',
    'caobos salazar': 'caobos',
    'los cedros': 'cedritos',
    'los cedritos': 'cedritos',
    'barrancas norte': 'barrancas',
    'la colina campestre': 'colina campestre',
    'colina suba': 'colina campestre',
    'suba mazuren': 'mazuren',
    'prado veraniego': 'prado veraniego norte',
    'santa barbara': 'santa barbara norte',
    'el chico': 'chico norte',
    chico: 'chico norte',
    rosales: 'los rosales',
    salitre: 'ciudad salitre',
    chapinero: 'chapinero alto',
    floresta: 'la floresta',
  };

  if (aliases[text]) return aliases[text];
  for (const canonical of [
    'santa barbara norte',
    'contador',
    'cedritos',
    'barrancas',
    'caobos',
    'alcala',
    'prado veraniego norte',
    'las villas',
    'iberia',
    'colina campestre',
    'mazuren',
    'chico norte',
    'los rosales',
    'ciudad salitre',
    'chapinero alto',
    'teusaquillo',
    'normandia',
    'la floresta',
    'usaquen',
  ]) {
    if (text.includes(canonical)) return canonical;
  }
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (text.includes(alias)) return canonical;
  }
  return text;
}

export function getScoreDescriptor(score) {
  const s = Number(score) || 0;
  if (s >= 9) return { label: 'Excelente opción', tone: 'sage' };
  if (s >= 7.5) return { label: 'Muy buena opción', tone: 'sage' };
  if (s >= 6) return { label: 'Buena opción', tone: 'amber' };
  return { label: 'Opción básica', tone: 'stone' };
}

export function estimateUtilitiesByStratum(estrato) {
  const e = Number(estrato);
  if (e <= 3) return 280_000;
  if (e === 4) return 380_000;
  return 500_000;
}

export function computeOpportunityBadge(listing, resumenList, allListings) {
  const key = normalizeBarrioKey(listing.barrio);
  const match = (resumenList || []).find(
    (r) => normalizeBarrioKey(r.barrio) === key
  );

  let avgM2 = match ? Number(match.promedioM2) : 0;
  let barrioLabel = match?.barrio || listing.barrio;

  if (!avgM2 && allListings && allListings.length > 0) {
    const sameBarrio = allListings.filter(
      (item) => normalizeBarrioKey(item.barrio) === key && item.costoM2 > 0
    );
    const pool = sameBarrio.length >= 2 ? sameBarrio : allListings;
    avgM2 = pool.reduce((acc, item) => acc + item.costoM2, 0) / pool.length;
    if (sameBarrio.length < 2) barrioLabel = 'el sector';
  }

  if (!avgM2 || !listing.costoM2) {
    return {
      pctDiff: 0,
      text: 'Precio de referencia en cálculo',
      tone: 'neutral',
      avgM2: 0,
    };
  }

  const diffRatio = (avgM2 - listing.costoM2) / avgM2;
  const pct = Math.round(Math.abs(diffRatio) * 100);

  if (diffRatio >= 0.03) {
    return {
      pctDiff: pct,
      text: `Te ahorras un ${pct}% frente al promedio de ${barrioLabel}`,
      tone: 'savings',
      avgM2,
    };
  }
  if (diffRatio <= -0.05) {
    return {
      pctDiff: -pct,
      text: `${pct}% por encima del promedio de ${barrioLabel}`,
      tone: 'premium',
      avgM2,
    };
  }
  return {
    pctDiff: 0,
    text: `Precio alineado con el promedio de ${barrioLabel}`,
    tone: 'aligned',
    avgM2,
  };
}

export function buildStreetViewUrl(lat, lng) {
  if (lat === null || lng === null || lat === '' || lng === '') return '';
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function buildWhatsAppUrl(listing) {
  const priceText =
    listing.operacion === 'venta'
      ? `Precio venta: ${formatCOP(listing.precioVenta)}`
      : `Total mensual: ${formatCOP(listing.totalMensual)}`;
  const mainLink = listing.enlaces?.[0] || '';
  const msg = [
    `Hola, vimos este apartamento en ${listing.barrio} (${listing.zona}):`,
    `• ${listing.area} m² | ${listing.hab} hab | ${listing.banos} baños | ${listing.garajes} garaje(s) | Estrato ${listing.estrato}`,
    `• ${priceText} | Puntuación: ${Number(listing.score).toFixed(1)}/10`,
    mainLink ? `• Enlace: ${mainLink}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export const FAMILY_LOCATIONS = [
  {
    id: 'gloria',
    name: 'Gloria',
    address: 'Calle 146 #11-25, Bogotá',
    lat: 4.72495,
    lng: -74.03345,
    defined: true,
  },
  {
    id: 'angela',
    name: 'Ángela',
    address: 'Carrera 23 #118-31, Bogotá',
    lat: 4.700921,
    lng: -74.053909,
    defined: true,
  },
  {
    id: 'beatriz',
    name: 'Beatriz',
    address: 'Av. NQS con Calle 72 (estimada), Bogotá',
    lat: 4.666094,
    lng: -74.075093,
    defined: true,
    estimated: true,
  },
];

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 === null ||
    lng1 === null ||
    lat2 === null ||
    lng2 === null ||
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export function isListingUnavailable(listing) {
  const est = String(listing?.estado || '').toUpperCase();
  return est.includes('NO DISPONIBLE') || est.includes('NO DETECTADO');
}

const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'con', 'a']);

/** Formatea nombres de barrios en Title Case elegante sin alterar los datos originales. */
export function formatTitleCase(text) {
  if (!text) return '';
  const cleaned = String(text).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      if (!word) return '';
      if (idx > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
