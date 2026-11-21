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
  };

  if (aliases[text]) return aliases[text];
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (text.includes(alias)) return canonical;
  }
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
  ]) {
    if (text.includes(canonical)) return canonical;
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
