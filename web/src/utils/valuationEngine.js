import barriosData from '../data/barrios_bogota_2026.json';
import { estimateUtilitiesByStratum, normalizeBarrioKey } from './formatters';

export const BARRIOS_DATA_META = barriosData.metadata;
export const BARRIOS_CATALOG = barriosData.barrios;

export const BOGOTA_2026 = {
  UVT: 52_374,
  TIMBRE_UMBRAL_UVT: 20_000, // $1.047.480.000
  TIMBRE_TECHO_UVT: 50_000,
  TIMBRE_TASA: 0.015, // 1,5% sobre exceso
  CTL_ONLINE_COP: 23_000, // Certificado de Tradición y Libertad 2026
  NOTARIA_CV_TASA_TOTAL: 0.003 * 1.19, // ~0,357% total (50% comprador + copias)
  NOTARIA_COPIAS_ESTIMADO: 120_000,
  BENEFICENCIA_TASA: 0.01, // 1% Ordenanza 039 de 2020 (50/50 supletivo = 0,5%)
  HIPOTECA_DESCUENTO_VIVIENDA: 0.7, // 70% de tarifa ordinaria en notaría y registro
  HIPOTECA_BENEFICENCIA_PRIVADO: 0.01,
  HIPOTECA_BENEFICENCIA_FNA: 0.005, // 0,5% entidad pública (FNA)
  ORIP_SISTEMATIZACION: 0.02, // +2% sistematización sobre derechos ORIP
  ORIP_TRAMOS: [
    { max: 192_780_000, rate: 0.00911 },
    { max: 334_150_000, rate: 0.01131 },
    { max: 494_800_000, rate: 0.01260 },
    { max: Infinity, rate: 0.01333 },
  ],
  CALENTADOR_ELECTRICO_EXTRA_MES: 60_000, // Rango $40k–$80k/mes
  INGRESO_INMOBILIARIA_PCT: 0.33, // Punto medio de 28%–38% de un canon
  REMODELACION_POR_M2: {
    listo: 0,
    cosmetica: 115_000, // $80k–$150k/m²
    parcial_fijo: 23_000_000, // $18M–$28M (cocina + 1 baño + pintura)
    integral: 1_350_000, // $900k–$1.8M/m²
  },
  DIAS_VITRINA_ALTO_MARGEN: { arriendo: 30, venta: 90 },
  DUPLICACION_PORTALES: {
    houm: 0.968,
    'domus red': 0.776,
    ciencuadras: 0.504,
    fincaraiz: 0.320,
    rentola: 0.303,
    metrocuadrado: 0.160,
    mercadolibre: 0.105,
  },
};

export function roundToMultiple(value, step) {
  if (!Number.isFinite(value) || value <= 0 || !step) return 0;
  return Math.round(value / step) * step;
}

/** Infiere si el anuncio es de dueño directo o inmobiliaria. */
export function inferInterlocutor(listing) {
  const saved = listing?.meta?.interlocutor;
  if (saved === 'dueno_directo' || saved === 'inmobiliaria') return saved;
  const tags = Array.isArray(listing?.etiquetasConfort) ? listing.etiquetasConfort : [];
  const hasTratoDirecto = tags.some((t) =>
    String(t).toLowerCase().includes('trato directo')
  );
  if (hasTratoDirecto) return 'dueno_directo';
  return 'inmobiliaria';
}

/** Obtiene el porcentaje histórico de duplicación para un portal en Bogotá (2026). */
export function getPortalDuplicationRate(fuente) {
  if (!fuente) return 0;
  const norm = String(fuente)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  for (const [portal, rate] of Object.entries(BOGOTA_2026.DUPLICACION_PORTALES)) {
    if (norm.includes(portal)) return rate;
  }
  return 0;
}

/**
 * Resuelve el referente de mercado por barrio en cascada segura:
 * 1) JSON estático (Aptologia nov. 2026)
 * 2) Resumen_Barrios de Google Sheets
 * 3) Mediana del mismo barrio dentro del inventario actual
 * 4) Medianas agregadas de Bogotá 2026
 */
export function resolveBarrioBenchmark(barrio, operacion, resumenList = [], allListings = []) {
  const isVenta = operacion === 'venta';
  const key = normalizeBarrioKey(barrio);
  const catalogEntry = key ? BARRIOS_CATALOG[key] : null;

  if (catalogEntry) {
    const slice = isVenta ? catalogEntry.venta : catalogEntry.arriendo;
    if (slice?.medianaM2 > 0) {
      return {
        source: 'json',
        barrioLabel: catalogEntry.nombre || barrio || 'Bogotá',
        medianaM2: slice.medianaM2,
        p25M2: slice.p25M2 || Math.round(slice.medianaM2 * 0.85),
        p75M2: slice.p75M2 || Math.round(slice.medianaM2 * 1.15),
        adminMediana: slice.adminMediana || 420_000,
        pctDuenoDirecto: slice.pctDuenoDirecto ?? 0.09,
        estratoTipico: catalogEntry.estratoTipico || 4,
      };
    }
  }

  const sheetMatch = (resumenList || []).find(
    (r) => normalizeBarrioKey(r.barrio) === key && Number(r.promedioM2) > 0
  );
  if (sheetMatch) {
    const avgM2 = Number(sheetMatch.promedioM2);
    const adminEst = isVenta
      ? Number(sheetMatch.promedioSecundario) || 450_000
      : Math.max(0, Number(sheetMatch.promedioSecundario) - Number(sheetMatch.promedioPrincipal)) ||
        420_000;
    return {
      source: 'sheets',
      barrioLabel: sheetMatch.barrio || barrio || 'el sector',
      medianaM2: avgM2,
      p25M2: Math.round(avgM2 * 0.86),
      p75M2: Math.round(avgM2 * 1.14),
      adminMediana: adminEst,
      pctDuenoDirecto: 0.09,
      estratoTipico: 4,
    };
  }

  const sameBarrio = (allListings || []).filter(
    (item) => normalizeBarrioKey(item.barrio) === key && Number(item.costoM2) > 0
  );
  if (sameBarrio.length >= 2) {
    const sortedM2 = sameBarrio.map((x) => Number(x.costoM2)).sort((a, b) => a - b);
    const mid = Math.floor(sortedM2.length / 2);
    const medianaM2 =
      sortedM2.length % 2 === 0
        ? Math.round((sortedM2[mid - 1] + sortedM2[mid]) / 2)
        : sortedM2[mid];
    const sortedAdmin = sameBarrio
      .map((x) => Number(x.admin) || 0)
      .filter((a) => a > 0)
      .sort((a, b) => a - b);
    const adminMediana =
      sortedAdmin.length > 0 ? sortedAdmin[Math.floor(sortedAdmin.length / 2)] : 420_000;
    return {
      source: 'listings',
      barrioLabel: barrio || 'el sector',
      medianaM2,
      p25M2: Math.round(medianaM2 * 0.86),
      p75M2: Math.round(medianaM2 * 1.14),
      adminMediana,
      pctDuenoDirecto: 0.09,
      estratoTipico: 4,
    };
  }

  const bogotaFallback = isVenta
    ? BARRIOS_DATA_META.bogotaMedians.ventaM2
    : BARRIOS_DATA_META.bogotaMedians.arriendoCmnM2;
  return {
    source: 'bogota',
    barrioLabel: barrio || 'Bogotá',
    medianaM2: bogotaFallback,
    p25M2: Math.round(bogotaFallback * 0.85),
    p75M2: Math.round(bogotaFallback * 1.15),
    adminMediana: isVenta ? 450_000 : 420_000,
    pctDuenoDirecto: 0.09,
    estratoTipico: 4,
  };
}

/** 1A. Costo Mensual Normalizado y Semáforo — ARRIENDO (Bogotá 2026) */
export function evaluateArriendo2026(params) {
  const canon = Math.max(0, Number(params.canon) || 0);
  const admin = Math.max(0, Number(params.admin) || 0);
  const areaM2 = Math.max(0, Number(params.areaM2) || 0);
  const estrato = Number(params.estrato) || 4;
  const interlocutor = params.interlocutor === 'dueno_directo' ? 'dueno_directo' : 'inmobiliaria';
  const medianaBarrioCmnM2 = Number(params.medianaBarrioCmnM2) || BARRIOS_DATA_META.bogotaMedians.arriendoCmnM2;
  const parqueadero = Math.max(0, Number(params.parqueaderoExtra) || 0);
  const serviciosBase =
    Number(params.serviciosBaseEstrato) || estimateUtilitiesByStratum(estrato);

  const costosIngreso =
    interlocutor === 'inmobiliaria'
      ? Math.round(canon * BOGOTA_2026.INGRESO_INMOBILIARIA_PCT)
      : 0;
  const ingresoProrrateado = Math.round(costosIngreso / 12);
  const extraCalentador =
    params.calentador === 'electrico' ? BOGOTA_2026.CALENTADOR_ELECTRICO_EXTRA_MES : 0;

  const costoMensualNormalizado = canon + admin + parqueadero + ingresoProrrateado;
  const cmnM2 = areaM2 > 0 ? Math.round(costoMensualNormalizado / areaM2) : 0;
  const flujoBolsilloMensual = costoMensualNormalizado + serviciosBase + extraCalentador;

  const diffPct =
    medianaBarrioCmnM2 > 0 && cmnM2 > 0
      ? (cmnM2 - medianaBarrioCmnM2) / medianaBarrioCmnM2
      : 0;

  let color = 'amarillo';
  let veredicto = 'Precio de mercado';
  if (cmnM2 > 0 && diffPct < -0.25) {
    color = 'alerta_antifraude';
    veredicto = 'Precio inusualmente bajo — Activa el Escudo Anti-Estafa';
  } else if (cmnM2 > 0 && diffPct <= -0.1) {
    color = 'verde';
    veredicto = 'Oportunidad real frente al sector';
  } else if (cmnM2 > 0 && diffPct >= 0.08) {
    color = 'rojo';
    veredicto = 'Sobreprecio negociable';
  }

  let superaTopeLegal = false;
  let canonMaximoLegal = null;
  const avaluoCat = Number(params.avaluoCatastral) || 0;
  const valorCom = Number(params.valorComercialEstimado) || 0;
  if (avaluoCat > 0 || valorCom > 0) {
    const limites = [];
    if (valorCom > 0) limites.push(valorCom * 0.01);
    if (avaluoCat > 0) limites.push(avaluoCat * 0.02);
    canonMaximoLegal = Math.round(Math.min(...limites));
    superaTopeLegal = canon > canonMaximoLegal;
  }

  const costoMesVacioPropietario = canon + admin + 60_000;
  const pctVacanciaAnual = canon > 0 ? costoMesVacioPropietario / (canon * 12) : 0;

  return {
    cmnM2,
    costoMensualNormalizado,
    costosIngresoNoReembolsables: costosIngreso,
    ingresoProrrateado,
    extraCalentador,
    serviciosBase,
    flujoBolsilloMensual,
    diffPct,
    color,
    veredicto,
    canonMaximoLegal,
    superaTopeLegal,
    costoMesVacioPropietario,
    pctVacanciaAnual,
  };
}

/** 1B. Derechos ORIP exactos 2026 (no marginales) + detección de salto de tramo */
export function calculateOrip2026(monto) {
  const safeMonto = Math.max(0, Number(monto) || 0);
  const tramo =
    BOGOTA_2026.ORIP_TRAMOS.find((t) => safeMonto <= t.max) ??
    BOGOTA_2026.ORIP_TRAMOS[BOGOTA_2026.ORIP_TRAMOS.length - 1];
  const derechosBase = Math.round(safeMonto * tramo.rate);
  const sistematizacion = Math.round(derechosBase * BOGOTA_2026.ORIP_SISTEMATIZACION);
  const totalOrip = derechosBase + sistematizacion;

  const umbralesPrevios = [192_780_000, 334_150_000, 494_800_000];
  let saltoTactico = null;
  for (const umbral of umbralesPrevios) {
    if (safeMonto > umbral && safeMonto <= umbral * 1.04) {
      const precioObjetivo = Math.floor((umbral - 300_000) / 500_000) * 500_000;
      const tramoInferior = BOGOTA_2026.ORIP_TRAMOS.find((t) => precioObjetivo <= t.max);
      const oripInferior = Math.round(
        precioObjetivo * tramoInferior.rate * (1 + BOGOTA_2026.ORIP_SISTEMATIZACION)
      );
      saltoTactico = {
        umbral,
        precioObjetivo,
        ahorroOrip: Math.max(0, totalOrip - oripInferior),
      };
    }
  }

  return {
    rate: tramo.rate,
    derechosBase,
    sistematizacion,
    totalOrip,
    saltoTactico,
  };
}

/** 1C. Gastos de cierre, PRC y cuota hipotecaria 2026 — COMPRAVENTA */
export function evaluateCompra2026(params) {
  const P = Math.max(0, Number(params.precioOferta) || 0);
  const areaM2 = Math.max(0, Number(params.areaM2) || 0);
  const adminMensual = Math.max(0, Number(params.adminMensual) || 0);
  const adminMedianaBarrio = Math.max(0, Number(params.adminMedianaBarrio) || 450_000);
  const medianaBarrioVentaM2 =
    Number(params.medianaBarrioVentaM2) || BARRIOS_DATA_META.bogotaMedians.ventaM2;
  const estadoRemodelacion = params.estadoRemodelacion || 'listo';
  const modalidadPago = params.modalidadPago || 'contado';
  const beneficencia5050 = params.beneficencia5050 !== false;

  let costoRemodelacion = 0;
  if (estadoRemodelacion === 'cosmetica') {
    costoRemodelacion = Math.round(areaM2 * BOGOTA_2026.REMODELACION_POR_M2.cosmetica);
  } else if (estadoRemodelacion === 'parcial') {
    costoRemodelacion = BOGOTA_2026.REMODELACION_POR_M2.parcial_fijo;
  } else if (estadoRemodelacion === 'integral') {
    costoRemodelacion = Math.round(areaM2 * BOGOTA_2026.REMODELACION_POR_M2.integral);
  }

  const notariaComprador = Math.round(
    P * BOGOTA_2026.NOTARIA_CV_TASA_TOTAL * 0.5 + BOGOTA_2026.NOTARIA_COPIAS_ESTIMADO
  );
  const beneficenciaComprador = Math.round(
    P * BOGOTA_2026.BENEFICENCIA_TASA * (beneficencia5050 ? 0.5 : 1.0)
  );
  const ahorroBeneficencia5050 = Math.round(P * BOGOTA_2026.BENEFICENCIA_TASA * 0.5);
  const oripCv = calculateOrip2026(P);
  const registroOripCv = oripCv.totalOrip + BOGOTA_2026.CTL_ONLINE_COP;

  const umbralTimbre = BOGOTA_2026.TIMBRE_UMBRAL_UVT * BOGOTA_2026.UVT;
  const techoTimbre = BOGOTA_2026.TIMBRE_TECHO_UVT * BOGOTA_2026.UVT;
  const baseTimbre = Math.max(0, Math.min(P, techoTimbre) - umbralTimbre);
  const timbreComprador = Math.round(baseTimbre * BOGOTA_2026.TIMBRE_TASA * 0.5);

  const pctFin = modalidadPago === 'contado' ? 0 : params.pctFinanciacion ?? 0.7;
  const montoCredito = Math.round(P * pctFin);
  let costosExtraHipoteca = 0;
  if (montoCredito > 0) {
    const oripHip =
      calculateOrip2026(montoCredito).totalOrip * BOGOTA_2026.HIPOTECA_DESCUENTO_VIVIENDA;
    const notariaHip =
      montoCredito *
      BOGOTA_2026.NOTARIA_CV_TASA_TOTAL *
      BOGOTA_2026.HIPOTECA_DESCUENTO_VIVIENDA;
    const tasaImpHip =
      modalidadPago === 'credito_fna'
        ? BOGOTA_2026.HIPOTECA_BENEFICENCIA_FNA
        : BOGOTA_2026.HIPOTECA_BENEFICENCIA_PRIVADO;
    costosExtraHipoteca = Math.round(oripHip + notariaHip + montoCredito * tasaImpHip);
  }

  const costosCierreTotales =
    notariaComprador +
    beneficenciaComprador +
    registroOripCv +
    timbreComprador +
    costosExtraHipoteca;

  const deltaAdminMensual = Math.max(0, adminMensual - adminMedianaBarrio);
  const capitalizacionAdmin10a = Math.round(deltaAdminMensual * 12 * 10);

  const prc = P + costoRemodelacion + costosCierreTotales + capitalizacionAdmin10a;
  const prcM2 = areaM2 > 0 ? Math.round(prc / areaM2) : 0;
  const precioPedidoM2 = areaM2 > 0 ? Math.round(P / areaM2) : 0;
  const diffPct =
    medianaBarrioVentaM2 > 0 && precioPedidoM2 > 0
      ? (precioPedidoM2 - medianaBarrioVentaM2) / medianaBarrioVentaM2
      : 0;

  let color = 'amarillo';
  let veredicto = 'Precio de mercado';
  if (precioPedidoM2 > 0 && diffPct < -0.25) {
    color = 'alerta_antifraude';
    veredicto = 'Precio inusualmente bajo — Verifica CTL y titularidad';
  } else if (precioPedidoM2 > 0 && diffPct <= -0.08) {
    color = 'verde';
    veredicto = 'Oportunidad frente al barrio';
  } else if (precioPedidoM2 > 0 && diffPct >= 0.08) {
    color = 'rojo';
    veredicto = 'Sobreprecio negociable';
  }

  const nMeses = (params.plazoAnios ?? 20) * 12;
  const cuotaMensual = (monto, ea) => {
    if (monto <= 0 || ea <= 0) return 0;
    const rm = Math.pow(1 + ea, 1 / 12) - 1;
    return Math.round((monto * rm) / (1 - Math.pow(1 + rm, -nMeses)));
  };
  const tasaFna = params.tasaFnaEA ?? BARRIOS_DATA_META.tasasFallback2026.fnaEA;
  const tasaProm = params.tasaPromedioEA ?? BARRIOS_DATA_META.tasasFallback2026.promedioNoVisEA;
  const cuotaFna = cuotaMensual(montoCredito, tasaFna);
  const cuotaPromedio = cuotaMensual(montoCredito, tasaProm);

  const ratioRentaVenta =
    params.arriendoEquivalenteMensual && P > 0
      ? params.arriendoEquivalenteMensual / P
      : null;
  const alertaSobreprecioVsRenta = ratioRentaVenta !== null && ratioRentaVenta < 0.0045;

  return {
    prc,
    prcM2,
    precioPedidoM2,
    costoRemodelacion,
    deltaAdminMensual,
    capitalizacionAdmin10a,
    notariaComprador,
    beneficenciaComprador,
    ahorroBeneficencia5050,
    registroOripCv,
    timbreComprador,
    costosExtraHipoteca,
    costosCierreTotales,
    saltoTacticoOrip: oripCv.saltoTactico,
    montoCredito,
    cuotaFna,
    cuotaPromedio,
    ahorroMensualFnaVsPromedio: Math.max(0, cuotaPromedio - cuotaFna),
    diffPct,
    color,
    veredicto,
    ratioRentaVenta,
    alertaSobreprecioVsRenta,
  };
}

/** 4. Generador de Oferta con Precisión Moderada ($25.000 arriendo / $500.000 compra) */
export function computePreciseOffer2026(params) {
  const precioPedido = Math.max(0, Number(params.precioPedido) || 0);
  const medianaEq = Math.max(0, Number(params.precioMedianaBarrioEquivalente) || 0);
  const anclaBase = medianaEq > 0 ? Math.min(precioPedido, medianaEq) : precioPedido;
  const dias = Number(params.diasEnMercado) || 0;
  const interlocutor =
    params.interlocutor === 'dueno_directo' ? 'dueno_directo' : 'inmobiliaria';

  if (params.operacion === 'arriendo') {
    let pctDescuento = interlocutor === 'dueno_directo' ? 0.05 : 0.02;
    if (dias > 30) pctDescuento += interlocutor === 'dueno_directo' ? 0.025 : 0.02;
    if (dias > 60) pctDescuento += 0.015;
    if (params.palanca === 'entrada_inmediata') pctDescuento += 0.01;
    pctDescuento = Math.min(pctDescuento, interlocutor === 'dueno_directo' ? 0.09 : 0.05);

    const crudo = Math.max(anclaBase * (1 - pctDescuento), precioPedido * 0.85);
    const ofertaSugerida = roundToMultiple(crudo, 25_000);
    return {
      ofertaSugerida,
      pasoAjuste: 25_000,
      ahorroCop: Math.max(0, precioPedido - ofertaSugerida),
      ahorroPct: precioPedido > 0 ? (precioPedido - ofertaSugerida) / precioPedido : 0,
    };
  }

  const remodelacion =
    params.palanca === 'necesita_arreglos'
      ? Number(params.costoRemodelacionEstimado) || 18_000_000
      : 0;
  let pctAjuste = 0.035;
  if (dias > 90) pctAjuste += 0.03;
  if (params.palanca === 'contado') pctAjuste += 0.05;
  if (params.palanca === 'credito_preaprobado') pctAjuste += 0.015;
  pctAjuste = Math.min(pctAjuste, 0.12);

  let crudo = anclaBase * (1 - pctAjuste) - remodelacion;
  crudo = Math.max(crudo, precioPedido * 0.8);

  let ofertaSugerida = roundToMultiple(crudo, 500_000);
  const oripCheck = calculateOrip2026(ofertaSugerida);
  if (oripCheck.saltoTactico) {
    ofertaSugerida = oripCheck.saltoTactico.precioObjetivo;
  }

  return {
    ofertaSugerida,
    pasoAjuste: 500_000,
    ahorroCop: Math.max(0, precioPedido - ofertaSugerida),
    ahorroPct: precioPedido > 0 ? (precioPedido - ofertaSugerida) / precioPedido : 0,
  };
}

export function defaultLegalShield(listing) {
  const saved = listing?.legalShield || {};
  const isInmob = inferInterlocutor(listing) === 'inmobiliaria';
  return {
    pideDineroODocsPreVisita: Boolean(saved.pideDineroODocsPreVisita),
    pideDepositoEfectivo: Boolean(saved.pideDepositoEfectivo),
    esInmobiliaria:
      saved.esInmobiliaria !== undefined ? Boolean(saved.esInmobiliaria) : isInmob,
    matriculaHabitatVerificada: Boolean(saved.matriculaHabitatVerificada),
    ingresosSoloPension: Boolean(saved.ingresosSoloPension),
    ctlDescargadoPropio: Boolean(saved.ctlDescargadoPropio),
    predialYActaRevisados: Boolean(saved.predialYActaRevisados),
    promesaBlindadaArrasConfirmatorias: Boolean(saved.promesaBlindadaArrasConfirmatorias),
    updatedAt: saved.updatedAt || '',
  };
}

/** Evalúa alertas bloqueantes y progreso del Escudo Anti-Estafa y Legal. */
export function evaluateLegalRisk(operacion, shield) {
  const s = shield || {};
  const criticalAlerts = [];
  const warnings = [];

  if (operacion === 'venta') {
    if (!s.ctlDescargadoPropio) {
      warnings.push(
        'Aún no has descargado personalmente el Certificado de Tradición y Libertad ($23.000 online).'
      );
    }
    if (!s.predialYActaRevisados) {
      warnings.push(
        'Falta revisar el último recibo del Predial y el Acta de Asamblea (cuotas extraordinarias).'
      );
    }
    if (!s.promesaBlindadaArrasConfirmatorias) {
      warnings.push(
        'Verifica antes de firmar que la promesa diga "arras confirmatorias" (Art. 1861 C.C.) y tenga cláusula de salida sin multa.'
      );
    }
    const completedChecks =
      Number(Boolean(s.ctlDescargadoPropio)) +
      Number(Boolean(s.predialYActaRevisados)) +
      Number(Boolean(s.promesaBlindadaArrasConfirmatorias));
    return {
      blocked: false,
      criticalAlerts,
      warnings,
      completedChecks,
      totalChecks: 3,
      isVerified: Boolean(s.updatedAt) && completedChecks === 3,
    };
  }

  // Arriendo
  if (s.pideDineroODocsPreVisita) {
    criticalAlerts.push(
      '¡ALTO! Pedir dinero, reserva o fotos de tu cédula antes de ver el apartamento por dentro es la modalidad #1 de estafa en Bogotá (2026).'
    );
  }
  if (s.pideDepositoEfectivo) {
    criticalAlerts.push(
      '¡COBRO ILEGAL! El Art. 16 de la Ley 820 de 2003 prohíbe exigir depósitos en efectivo (aun llamados "anticipo" o "reserva"). La única excepción (Art. 15) es garantía de servicios a favor de la empresa prestadora, nunca al arrendador.'
    );
  }
  if (s.esInmobiliaria && !s.matriculaHabitatVerificada) {
    warnings.push(
      'Falta verificar la Matrícula de Arrendador vigente de esta inmobiliaria en la Secretaría Distrital del Hábitat (Art. 28 Ley 820).'
    );
  }
  if (s.ingresosSoloPension) {
    warnings.push(
      'OJO PENSIONADOS (Art. 134 num. 5 Ley 100): Las mesadas pensionales son inembargables y aseguradoras como Sura o El Libertador suelen rechazar sin rentas adicionales. Prioriza dueño directo, coarrendatario familiar con ingresos embargables o CDT pignorado.'
    );
  }

  const safeVisited = Boolean(s.updatedAt);
  const completedChecks =
    (safeVisited && !s.pideDineroODocsPreVisita ? 1 : 0) +
    (safeVisited && !s.pideDepositoEfectivo ? 1 : 0) +
    (!s.esInmobiliaria || s.matriculaHabitatVerificada ? 1 : 0);

  return {
    blocked: criticalAlerts.length > 0,
    criticalAlerts,
    warnings,
    completedChecks,
    totalChecks: 3,
    isVerified:
      safeVisited &&
      criticalAlerts.length === 0 &&
      (!s.esInmobiliaria || s.matriculaHabitatVerificada),
  };
}
