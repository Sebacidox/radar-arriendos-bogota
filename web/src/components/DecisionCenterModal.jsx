import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  MessageCircle,
  Minus,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  X,
} from 'lucide-react';
import { estimateUtilitiesByStratum, formatCOP } from '../utils/formatters';
import {
  BARRIOS_DATA_META,
  computePreciseOffer2026,
  defaultLegalShield,
  evaluateArriendo2026,
  evaluateCompra2026,
  evaluateLegalRisk,
  getPortalDuplicationRate,
  inferInterlocutor,
  resolveBarrioBenchmark,
} from '../utils/valuationEngine';
import {
  OFFICIAL_LINKS,
  buildDuplicateSearchUrl,
  buildGoogleLensUrl,
  buildNegotiationWhatsAppUrl,
  fetchIdecaParcelInfo,
  fetchMortgageRates2026,
  normalizeWhatsAppDigits,
} from '../utils/externalLinks';

const REMODELACION_OPTIONS = [
  { id: 'listo', label: 'Listo para vivir', hint: '$0' },
  { id: 'cosmetica', label: 'Pintura / detalles', hint: '~$80k–$150k/m²' },
  { id: 'parcial', label: 'Arreglos medios', hint: '~$23M (cocina/baño)' },
  { id: 'integral', label: 'Para remodelar', hint: '~$1,35M/m²' },
];

export default function DecisionCenterModal({
  listing,
  resumenList = [],
  allListings = [],
  onClose,
  onSaveListingExtras,
  saving = false,
}) {
  const isVenta = listing?.operacion === 'venta';
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentAskedPrice = isVenta ? listing?.precioVenta || 0 : listing?.canon || 0;

  const [step, setStep] = useState(1);
  const [interlocutor, setInterlocutor] = useState(() => inferInterlocutor(listing));
  const [calentador, setCalentador] = useState(() => listing?.meta?.calentador || 'gas');
  const [avaluoCatastral, setAvaluoCatastral] = useState(() =>
    listing?.meta?.avaluoCatastral ? String(listing.meta.avaluoCatastral) : ''
  );
  const [estadoRemodelacion, setEstadoRemodelacion] = useState(
    () => listing?.meta?.estadoRemodelacion || 'listo'
  );
  const [modalidadPago, setModalidadPago] = useState(
    () => listing?.meta?.modalidadPago || 'contado'
  );
  const [beneficencia5050, setBeneficencia5050] = useState(
    () => listing?.meta?.beneficencia5050 !== false
  );
  const [arriendoEquivalente, setArriendoEquivalente] = useState(() =>
    listing?.meta?.arriendoEquivalente ? String(listing.meta.arriendoEquivalente) : ''
  );

  const [shield, setShield] = useState(() => defaultLegalShield(listing));
  const [priceHistory, setPriceHistory] = useState(() => {
    if (Array.isArray(listing?.priceHistory) && listing.priceHistory.length > 0) {
      return listing.priceHistory;
    }
    if (currentAskedPrice > 0) {
      return [
        {
          date: listing?.firstSeenAt || listing?.fechaDeteccion || todayIso,
          price: currentAskedPrice,
          admin: listing?.admin || 0,
          source: listing?.fuente || 'Radar',
        },
      ];
    }
    return [];
  });
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [newPriceInput, setNewPriceInput] = useState('');

  const [palanca, setPalanca] = useState(() => {
    if (!isVenta) return 'entrada_inmediata';
    const mod = listing?.meta?.modalidadPago || 'contado';
    if (mod === 'contado') return 'contado';
    return 'credito_preaprobado';
  });
  const [customOffer, setCustomOffer] = useState(null);
  const [telefono, setTelefono] = useState(() => listing?.meta?.telefono || '');
  const [customMessage, setCustomMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  const [idecaInfo, setIdecaInfo] = useState(null);
  const [ratesInfo, setRatesInfo] = useState(() => ({
    ...BARRIOS_DATA_META.tasasFallback2026,
    fromApi: false,
  }));

  // Reset modal internal state if user opens a different property
  useEffect(() => {
    if (!listing) return;
    setStep(1);
    setInterlocutor(inferInterlocutor(listing));
    setCalentador(listing.meta?.calentador || 'gas');
    setAvaluoCatastral(listing.meta?.avaluoCatastral ? String(listing.meta.avaluoCatastral) : '');
    setEstadoRemodelacion(listing.meta?.estadoRemodelacion || 'listo');
    setModalidadPago(listing.meta?.modalidadPago || 'contado');
    setBeneficencia5050(listing.meta?.beneficencia5050 !== false);
    setArriendoEquivalente(
      listing.meta?.arriendoEquivalente ? String(listing.meta.arriendoEquivalente) : ''
    );
    setShield(defaultLegalShield(listing));
    const ask = listing.operacion === 'venta' ? listing.precioVenta : listing.canon;
    setPriceHistory(
      Array.isArray(listing.priceHistory) && listing.priceHistory.length > 0
        ? listing.priceHistory
        : ask > 0
          ? [
              {
                date: listing.firstSeenAt || listing.fechaDeteccion || todayIso,
                price: ask,
                admin: listing.admin || 0,
                source: listing.fuente || 'Radar',
              },
            ]
          : []
    );
    setShowAddPrice(false);
    setNewPriceInput('');
    setCustomOffer(null);
    setTelefono(listing.meta?.telefono || '');
    setCustomMessage(null);
    setIdecaInfo(null);
    setPalanca(
      listing.operacion === 'venta'
        ? (listing.meta?.modalidadPago || 'contado') === 'contado'
          ? 'contado'
          : 'credito_preaprobado'
        : 'entrada_inmediata'
    );
  }, [listing?.id]);

  // Carga no bloqueante de APIs públicas (IDECA + datos.gov.co)
  useEffect(() => {
    if (!listing) return;
    let active = true;

    if (listing.lat && listing.lng) {
      fetchIdecaParcelInfo(listing.lat, listing.lng).then((info) => {
        if (active && info) setIdecaInfo(info);
      });
    }
    if (listing.operacion === 'venta') {
      fetchMortgageRates2026().then((r) => {
        if (active && r) setRatesInfo(r);
      });
    }
    return () => {
      active = false;
    };
  }, [listing?.id, listing?.lat, listing?.lng, listing?.operacion]);

  const benchmark = useMemo(
    () =>
      listing
        ? resolveBarrioBenchmark(listing.barrio, listing.operacion, resumenList, allListings)
        : null,
    [listing, resumenList, allListings]
  );

  const estratoReal = idecaInfo?.estratoOficial || listing?.meta?.estratoOficial || listing?.estrato || 4;
  const utilitiesEst = estimateUtilitiesByStratum(estratoReal);

  const latestPrice =
    priceHistory.length > 0
      ? Number(priceHistory[priceHistory.length - 1]?.price) || currentAskedPrice
      : currentAskedPrice;

  const evalArriendo = useMemo(() => {
    if (!listing || isVenta || !benchmark) return null;
    return evaluateArriendo2026({
      canon: latestPrice,
      admin: listing.admin,
      areaM2: listing.area,
      estrato: estratoReal,
      interlocutor,
      medianaBarrioCmnM2: benchmark.medianaM2,
      calentador,
      avaluoCatastral: Number(avaluoCatastral) || 0,
      serviciosBaseEstrato: utilitiesEst,
    });
  }, [
    listing,
    isVenta,
    benchmark,
    latestPrice,
    estratoReal,
    interlocutor,
    calentador,
    avaluoCatastral,
    utilitiesEst,
  ]);

  const evalCompra = useMemo(() => {
    if (!listing || !isVenta || !benchmark) return null;
    return evaluateCompra2026({
      precioOferta: latestPrice,
      areaM2: listing.area,
      adminMensual: listing.admin,
      adminMedianaBarrio: benchmark.adminMediana,
      medianaBarrioVentaM2: benchmark.medianaM2,
      estadoRemodelacion,
      modalidadPago,
      beneficencia5050,
      tasaFnaEA: ratesInfo.fnaEA,
      tasaPromedioEA: ratesInfo.promedioNoVisEA,
      arriendoEquivalenteMensual: Number(arriendoEquivalente) || 0,
    });
  }, [
    listing,
    isVenta,
    benchmark,
    latestPrice,
    estadoRemodelacion,
    modalidadPago,
    beneficencia5050,
    ratesInfo,
    arriendoEquivalente,
  ]);

  const legalRisk = useMemo(
    () => evaluateLegalRisk(listing?.operacion || 'arriendo', shield),
    [listing?.operacion, shield]
  );

  const offerCalc = useMemo(() => {
    if (!listing || !benchmark) {
      return { ofertaSugerida: 0, pasoAjuste: 25_000, ahorroCop: 0, ahorroPct: 0 };
    }
    const medianaEq = benchmark.medianaM2 * (listing.area || 0);
    return computePreciseOffer2026({
      operacion: listing.operacion,
      precioPedido: latestPrice,
      precioMedianaBarrioEquivalente: medianaEq,
      interlocutor,
      diasEnMercado: listing.diasEnMercado || 0,
      palanca,
      costoRemodelacionEstimado: evalCompra?.costoRemodelacion || 18_000_000,
    });
  }, [listing, benchmark, latestPrice, interlocutor, palanca, evalCompra?.costoRemodelacion]);

  const activeOffer = customOffer !== null ? customOffer : offerCalc.ofertaSugerida;
  const activeSavingsCop = Math.max(0, latestPrice - activeOffer);
  const activeSavingsPct =
    latestPrice > 0 ? Math.round((activeSavingsCop / latestPrice) * 1000) / 10 : 0;

  const waPayload = useMemo(() => {
    if (!listing) return { text: '', url: 'https://wa.me/' };
    return buildNegotiationWhatsAppUrl({
      telefono,
      operacion: listing.operacion,
      interlocutor,
      barrio: listing.barrio || 'Bogotá Norte',
      adminMensual: listing.admin || 0,
      ofertaSugerida: activeOffer,
      palanca,
      costoRemodelacion:
        palanca === 'necesita_arreglos' ? evalCompra?.costoRemodelacion || 18_000_000 : 0,
      diasEnMercado: listing.diasEnMercado || 0,
    });
  }, [listing, telefono, interlocutor, activeOffer, palanca, evalCompra?.costoRemodelacion]);

  const messageText = customMessage !== null ? customMessage : waPayload.text;
  const finalWaUrl = useMemo(() => {
    const digits = normalizeWhatsAppDigits(telefono);
    const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(messageText)}`;
  }, [telefono, messageText]);

  if (!listing) return null;

  const buildCurrentExtras = (overrideHistory, overrideShield) => ({
    legalShield: overrideShield || { ...shield, updatedAt: new Date().toISOString() },
    priceHistory: overrideHistory || priceHistory,
    meta: {
      ...(listing.meta || {}),
      interlocutor,
      calentador,
      avaluoCatastral: Number(avaluoCatastral) || 0,
      estadoRemodelacion,
      modalidadPago,
      beneficencia5050,
      arriendoEquivalente: Number(arriendoEquivalente) || 0,
      telefono: telefono.trim(),
      estratoOficial: idecaInfo?.estratoOficial || listing.meta?.estratoOficial || null,
    },
  });

  const handleSaveExtrasClick = async () => {
    if (!onSaveListingExtras) return;
    const stampedShield = { ...shield, updatedAt: new Date().toISOString() };
    setShield(stampedShield);
    await onSaveListingExtras(listing, buildCurrentExtras(priceHistory, stampedShield));
  };

  const handleAddPricePoint = async () => {
    const clean = Number(String(newPriceInput).replace(/[^\d]/g, ''));
    if (!Number.isFinite(clean) || clean <= 0) return;
    const updatedHistory = [
      ...priceHistory,
      { date: todayIso, price: clean, admin: listing.admin || 0, source: 'Manual' },
    ];
    setPriceHistory(updatedHistory);
    setNewPriceInput('');
    setShowAddPrice(false);
    setCustomOffer(null);
    if (onSaveListingExtras) {
      await onSaveListingExtras(listing, buildCurrentExtras(updatedHistory, shield));
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignorar si clipboard no está permitido
    }
  };

  const dupRate = getPortalDuplicationRate(listing.fuente);
  const duplicateSearchUrl = buildDuplicateSearchUrl({
    barrio: listing.barrio,
    areaM2: listing.area,
    adminMensual: listing.admin,
    operacion: listing.operacion,
  });
  const googleLensUrl = buildGoogleLensUrl(
    (listing.fotos || []).find((f) => String(f).startsWith('http'))
  );

  const dias = Number(listing.diasEnMercado) || 0;
  const highMarginAge = isVenta ? dias >= 90 : dias >= 30;
  const firstSeenLabel =
    listing.firstSeenAt || listing.fechaDeteccion || priceHistory[0]?.date || todayIso;

  const firstHistPrice = Number(priceHistory[0]?.price) || latestPrice;
  const histDropPct =
    priceHistory.length >= 2 && firstHistPrice > 0 && latestPrice < firstHistPrice
      ? Math.round(((firstHistPrice - latestPrice) / firstHistPrice) * 1000) / 10
      : 0;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stoneLine bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="border-b border-stoneLine bg-ivory px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sage/10 px-2.5 py-0.5 text-xs font-bold text-sage">
                  {isVenta ? 'Compra' : 'Arriendo'} · {listing.area} m²
                </span>
                {listing.origen === 'manual' && (
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800">
                    Aviso propio
                  </span>
                )}
                {legalRisk.blocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Alerta Escudo Legal
                  </span>
                )}
              </div>
              <h2
                id="decision-modal-title"
                className="mt-1 font-serif text-xl font-bold text-ink"
              >
                {listing.barrio || 'Bogotá Norte'} · {formatCOP(latestPrice)}
                {!isVenta ? '/mes' : ''}
              </h2>
              <p className="text-xs text-stone-500">
                {listing.direccion && listing.direccion !== 'No publicada'
                  ? listing.direccion
                  : `Zona ${listing.zona}`}{' '}
                · Estrato {estratoReal}
                {idecaInfo?.estratoOficial ? ' (verificado en Catastro IDECA ✓)' : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar análisis"
              className="rounded-xl border border-stoneLine bg-white p-1.5 text-stone-500 hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navegación 3 Pasos */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { id: 1, label: '1. Precio Real y Duplicados' },
              { id: 2, label: '2. Escudo Anti-Estafa' },
              { id: 3, label: '3. Oferta WhatsApp' },
            ].map((tab) => {
              const active = step === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    active
                      ? 'border-sage bg-sage text-white shadow-sm'
                      : 'border-stoneLine bg-white text-stone-700 hover:border-sage/40 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          {/* ======================= PASO 1 ======================= */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Veredicto Semáforo */}
              {(() => {
                const ev = isVenta ? evalCompra : evalArriendo;
                const pctAbs = Math.round(Math.abs(ev?.diffPct || 0) * 100);
                const boxTone =
                  ev?.color === 'verde'
                    ? 'border-emerald-200 bg-emerald-50 text-sage'
                    : ev?.color === 'alerta_antifraude'
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : ev?.color === 'rojo'
                        ? 'border-amber-200 bg-amber-50 text-amberWarm'
                        : 'border-stoneLine bg-ivory text-ink';
                return (
                  <div className={`rounded-2xl border p-4 ${boxTone}`}>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                      Semáforo de Precio Real 2026
                    </p>
                    <p className="mt-0.5 text-base font-bold">
                      {ev?.veredicto} ({pctAbs}% {(ev?.diffPct || 0) <= 0 ? 'por debajo' : 'por encima'} de la mediana de {benchmark?.barrioLabel})
                    </p>
                    <p className="mt-1 text-xs opacity-90">
                      Mediana del sector: {formatCOP(benchmark?.medianaM2)}/m² (rango P25–P75:{' '}
                      {formatCOP(benchmark?.p25M2)} a {formatCOP(benchmark?.p75M2)}/m²).
                      {idecaInfo?.valorRefM2
                        ? ` Valor referencia suelo IDECA: ${formatCOP(idecaInfo.valorRefM2)}/m².`
                        : ''}
                    </p>
                    {idecaInfo?.estratoOficial &&
                      listing.estrato > 0 &&
                      idecaInfo.estratoOficial !== listing.estrato && (
                        <p className="mt-2 rounded-lg bg-amber-100/80 px-2.5 py-1.5 text-xs font-semibold text-amberWarm">
                          ⚠️ Ojo: el anuncio dice Estrato {listing.estrato}, pero Catastro
                          Bogotá (IDECA) reporta Estrato {idecaInfo.estratoOficial}.
                        </p>
                      )}
                  </div>
                );
              })()}

              {/* Ajustes rápidos */}
              <div className="rounded-2xl border border-stoneLine bg-ivory/60 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Ajusta en 2 toques según lo que te contaron
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">¿Quién ofrece el inmueble?</span>
                  <div className="flex gap-2">
                    {[
                      { id: 'dueno_directo', label: 'Dueño Directo' },
                      { id: 'inmobiliaria', label: 'Inmobiliaria' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setInterlocutor(opt.id);
                          setShield((prev) => ({
                            ...prev,
                            esInmobiliaria: opt.id === 'inmobiliaria',
                          }));
                          setCustomOffer(null);
                          setCustomMessage(null);
                        }}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          interlocutor === opt.id
                            ? 'border-sage bg-sage text-white'
                            : 'border-stoneLine bg-white text-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!isVenta ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">Tipo de calentador:</span>
                      <div className="flex gap-2">
                        {[
                          { id: 'gas', label: 'Gas natural' },
                          { id: 'electrico', label: 'Eléctrico (+$60k/mes)' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setCalentador(opt.id)}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                              calentador === opt.id
                                ? 'border-ink bg-ink text-white'
                                : 'border-stoneLine bg-white text-stone-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="text-xs font-medium text-stone-600">
                        Avalúo catastral del recibo Predial (opcional, verifica tope Art. 18 Ley 820):
                      </label>
                      <input
                        type="number"
                        value={avaluoCatastral}
                        onChange={(e) => setAvaluoCatastral(e.target.value)}
                        placeholder="Ej. 240000000"
                        className="w-44 rounded-xl border border-stoneLine bg-white px-3 py-1.5 text-xs text-ink"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="mb-1.5 block text-xs font-semibold text-ink">
                        Estado físico del apartamento:
                      </span>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {REMODELACION_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setEstadoRemodelacion(opt.id);
                              setCustomOffer(null);
                              setCustomMessage(null);
                            }}
                            className={`rounded-xl border p-2 text-left transition ${
                              estadoRemodelacion === opt.id
                                ? 'border-sage bg-sage/10 ring-1 ring-sage'
                                : 'border-stoneLine bg-white hover:border-sage/40'
                            }`}
                          >
                            <div className="text-xs font-bold text-ink">{opt.label}</div>
                            <div className="text-[11px] text-stone-500">{opt.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">Forma de pago:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'contado', label: 'Contado' },
                          { id: 'credito_fna', label: `Crédito FNA (${(ratesInfo.fnaEA * 100).toFixed(2)}%)` },
                          { id: 'credito_privado', label: `Banco (${(ratesInfo.promedioNoVisEA * 100).toFixed(2)}%)` },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setModalidadPago(opt.id);
                              setPalanca(opt.id === 'contado' ? 'contado' : 'credito_preaprobado');
                              setCustomOffer(null);
                              setCustomMessage(null);
                            }}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                              modalidadPago === opt.id
                                ? 'border-sage bg-sage text-white'
                                : 'border-stoneLine bg-white text-stone-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs font-semibold text-ink">
                        Impuesto de registro (beneficencia 1%):
                      </span>
                      <button
                        type="button"
                        onClick={() => setBeneficencia5050((v) => !v)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          beneficencia5050
                            ? 'border-emerald-300 bg-emerald-50 text-sage'
                            : 'border-amber-300 bg-amber-50 text-amberWarm'
                        }`}
                      >
                        {beneficencia5050
                          ? 'Reparto legal 50/50 (ahorras mitad)'
                          : 'Costumbre 100% comprador'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="text-xs font-medium text-stone-600">
                        Arriendo típico en el edificio (opcional, chequeo &lt; 0,45%/mes):
                      </label>
                      <input
                        type="number"
                        value={arriendoEquivalente}
                        onChange={(e) => setArriendoEquivalente(e.target.value)}
                        placeholder="Ej. 2400000"
                        className="w-44 rounded-xl border border-stoneLine bg-white px-3 py-1.5 text-xs text-ink"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Desglose financiero detallado */}
              {!isVenta && evalArriendo && (
                <div className="rounded-2xl border border-stoneLine bg-white p-4">
                  <h3 className="font-serif text-base font-bold text-ink">
                    Desglose mensual real (Bogotá 2026)
                  </h3>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-stone-600">Canon base + Administración</dt>
                      <dd className="font-semibold text-ink">
                        {formatCOP(latestPrice)} + {formatCOP(listing.admin)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-600">
                        {interlocutor === 'dueno_directo'
                          ? 'Costos no reembolsables de ingreso (Trato directo)'
                          : 'Estudio + derechos de contrato (~33% canon, prorrateado 12m)'}
                      </dt>
                      <dd className="font-semibold text-ink">
                        {interlocutor === 'dueno_directo'
                          ? '$0'
                          : `+${formatCOP(evalArriendo.ingresoProrrateado)}/mes (${formatCOP(evalArriendo.costosIngresoNoReembolsables)} iniciales)`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-600">
                        Servicios estimados (Estrato {estratoReal}
                        {evalArriendo.extraCalentador > 0 ? ' + calentador eléctrico' : ', gas'})
                      </dt>
                      <dd className="font-semibold text-ink">
                        {formatCOP(evalArriendo.serviciosBase + evalArriendo.extraCalentador)}/mes
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-stoneLine pt-2 text-sm font-bold text-sage">
                      <dt>Flujo total mensual de bolsillo</dt>
                      <dd>{formatCOP(evalArriendo.flujoBolsilloMensual)}/mes</dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-xl bg-ivory p-3 text-xs text-stone-700">
                    <strong>Palanca de vacancia:</strong> Cada mes vacío le cuesta al propietario{' '}
                    <strong>{formatCOP(evalArriendo.costoMesVacioPropietario)}</strong> (canon +
                    admin + servicios básicos ={' '}
                    <strong>{(evalArriendo.pctVacanciaAnual * 100).toFixed(1)}%</strong> de su
                    ingreso anual).
                  </div>

                  {evalArriendo.superaTopeLegal && (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amberWarm">
                      ⚠️ Alerta Art. 18 Ley 820: El canon supera el tope legal del 2% del avalúo
                      catastral ({formatCOP(evalArriendo.canonMaximoLegal)}).
                    </div>
                  )}
                </div>
              )}

              {isVenta && evalCompra && (
                <div className="rounded-2xl border border-stoneLine bg-white p-4">
                  <h3 className="font-serif text-base font-bold text-ink">
                    Desglose exacto de cierre y costo real (Bogotá 2026)
                  </h3>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-stone-600">Precio pedido</dt>
                      <dd className="font-semibold text-ink">{formatCOP(latestPrice)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-600">Notaría comprador (mitad 50% + copias)</dt>
                      <dd className="font-semibold text-ink">
                        {formatCOP(evalCompra.notariaComprador)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-600">
                        Beneficencia / Imp. registro (
                        {beneficencia5050 ? '50/50 legal' : '100% comprador'})
                      </dt>
                      <dd className="font-semibold text-ink">
                        {formatCOP(evalCompra.beneficenciaComprador)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-600">
                        Derechos ORIP + 2% sist. + Certificado de Tradición ($23k)
                      </dt>
                      <dd className="font-semibold text-ink">
                        {formatCOP(evalCompra.registroOripCv)}
                      </dd>
                    </div>
                    {evalCompra.timbreComprador > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-stone-600">Impuesto de timbre (exceso &gt; 20.000 UVT)</dt>
                        <dd className="font-semibold text-amberWarm">
                          {formatCOP(evalCompra.timbreComprador)}
                        </dd>
                      </div>
                    )}
                    {evalCompra.costosExtraHipoteca > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-stone-600">
                          Costos extra escritura de hipoteca (70% tarifa + registro{' '}
                          {modalidadPago === 'credito_fna' ? '0,5% FNA' : '1% banco'})
                        </dt>
                        <dd className="font-semibold text-amberWarm">
                          {formatCOP(evalCompra.costosExtraHipoteca)}
                        </dd>
                      </div>
                    )}
                    {evalCompra.costoRemodelacion > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-stone-600">Presupuesto estimado de obra/arreglos</dt>
                        <dd className="font-semibold text-ink">
                          {formatCOP(evalCompra.costoRemodelacion)}
                        </dd>
                      </div>
                    )}
                    {evalCompra.capitalizacionAdmin10a > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-stone-600">
                          Sobrecosto de admin (+{formatCOP(evalCompra.deltaAdminMensual)}/mes × 10 años)
                        </dt>
                        <dd className="font-semibold text-amberWarm">
                          {formatCOP(evalCompra.capitalizacionAdmin10a)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-stoneLine pt-2 text-sm font-bold text-sage">
                      <dt>Precio Real Comparativo (PRC total)</dt>
                      <dd>{formatCOP(evalCompra.prc)}</dd>
                    </div>
                  </dl>

                  {evalCompra.saltoTacticoOrip && (
                    <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amberWarm">
                      <strong>💡 Alerta táctica ORIP:</strong> El precio supera por poco el umbral
                      tarifario de {formatCOP(evalCompra.saltoTacticoOrip.umbral)}. Si cierras en{' '}
                      <strong>{formatCOP(evalCompra.saltoTacticoOrip.precioObjetivo)}</strong>,
                      baja la tarifa sobre <em>toda</em> la escritura y ahorras{' '}
                      <strong>~{formatCOP(evalCompra.saltoTacticoOrip.ahorroOrip)}</strong> en
                      registro.
                    </div>
                  )}

                  {evalCompra.montoCredito > 0 && (
                    <div className="mt-3 rounded-xl bg-ivory p-3 text-xs text-stone-700">
                      <strong>Cuota fija estimada (70% a 20 años, sin seguros):</strong> FNA{' '}
                      <strong>{formatCOP(evalCompra.cuotaFna)}/mes</strong> vs. Promedio bancos{' '}
                      <strong>{formatCOP(evalCompra.cuotaPromedio)}/mes</strong> (ahorro de{' '}
                      <span className="font-bold text-sage">
                        {formatCOP(evalCompra.ahorroMensualFnaVsPromedio)}/mes
                      </span>
                      ).
                    </div>
                  )}

                  {evalCompra.alertaSobreprecioVsRenta && (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amberWarm">
                      ⚠️ Relación arriendo/venta baja (
                      {(evalCompra.ratioRentaVenta * 100).toFixed(2)}% mensual, menor al 0,45%):
                      indica posible sobreprecio frente a lo que renta el edificio.
                    </div>
                  )}
                </div>
              )}

              {/* Reloj de Vitrina y Cazador de Duplicados */}
              <div className="rounded-2xl border border-stoneLine bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-serif text-base font-bold text-ink">
                    <Clock className="h-4 w-4 text-sage" />
                    Reloj de Vitrina y Cazador de Duplicados
                  </h3>
                  {highMarginAge && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-sage">
                      {dias} días · Alto margen para ofertar
                    </span>
                  )}
                </div>

                <div className="grid gap-2 text-xs text-stone-600 sm:grid-cols-2">
                  <p>
                    Primer avistamiento: <strong className="text-ink">{firstSeenLabel}</strong> (
                    <strong className="text-ink">{dias}</strong> días en seguimiento)
                  </p>
                  {listing.fuente && (
                    <p>
                      Portal: <strong className="text-ink">{listing.fuente}</strong>
                      {dupRate > 0
                        ? ` (${Math.round(dupRate * 100)}% suele estar repetido)`
                        : ''}
                    </p>
                  )}
                </div>

                {priceHistory.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-stone-600">Historial:</span>
                    {priceHistory.map((pt, i) => (
                      <span
                        key={`${pt.date}-${i}`}
                        className="rounded-lg border border-stoneLine bg-ivory px-2.5 py-1 font-medium text-ink"
                      >
                        {formatCOP(pt.price)} ({pt.date})
                      </span>
                    ))}
                    {histDropPct > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 font-bold text-sage">
                        <TrendingDown className="h-3.5 w-3.5" />
                        Bajó {histDropPct}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAddPrice((v) => !v)}
                      className="rounded-lg border border-dashed border-sage px-2.5 py-1 font-semibold text-sage hover:bg-emerald-50"
                    >
                      + Anotar rebaja
                    </button>
                  </div>
                )}

                {showAddPrice && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ivory p-2.5">
                    <input
                      type="number"
                      value={newPriceInput}
                      onChange={(e) => setNewPriceInput(e.target.value)}
                      placeholder={
                        isVenta ? 'Nuevo precio (ej. 485000000)' : 'Nuevo canon (ej. 2550000)'
                      }
                      className="flex-1 rounded-lg border border-stoneLine bg-white px-3 py-1.5 text-xs text-ink"
                    />
                    <button
                      type="button"
                      onClick={handleAddPricePoint}
                      disabled={saving}
                      className="rounded-lg bg-sage px-3 py-1.5 text-xs font-bold text-white hover:bg-sage/90"
                    >
                      Guardar precio
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={duplicateSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sage bg-emerald-50 px-3 py-2 text-xs font-bold text-sage transition hover:bg-emerald-100"
                  >
                    <Search className="h-3.5 w-3.5" />
                    ¿Está más barato en otro portal?
                  </a>

                  <a
                    href={googleLensUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stoneLine bg-ivory px-3 py-2 text-xs font-semibold text-ink transition hover:bg-stone-100"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Buscar foto en Google Lens
                  </a>

                  {isVenta && (
                    <a
                      href={OFFICIAL_LINKS.HABIMETRO_BOGOTA}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stoneLine bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-stone-50"
                    >
                      <Building2 className="h-3.5 w-3.5 text-sage" />
                      Comparar en Habimetro (gratis)
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveExtrasClick}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stoneLine bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-stone-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Guardar ajustes
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-4 py-2.5 text-xs font-bold text-white hover:bg-sage/90"
                >
                  Siguiente: Escudo Anti-Estafa
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ======================= PASO 2 ======================= */}
          {step === 2 && (
            <div className="space-y-4">
              {legalRisk.blocked && (
                <div
                  role="alert"
                  className="rounded-2xl border-2 border-red-600 bg-red-600 p-4 text-white shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" />
                    <div className="space-y-1 text-xs">
                      <p className="text-sm font-extrabold uppercase tracking-wide">
                        ¡ALTO! POSIBLE ESTAFA O COBRO ILEGAL EN BOGOTÁ
                      </p>
                      {legalRisk.criticalAlerts.map((msg) => (
                        <p key={msg} className="leading-relaxed text-white/95">
                          • {msg}
                        </p>
                      ))}
                      <p className="pt-1 font-bold underline">
                        No transfieras dinero ni envíes copias de cédula o extractos por chat.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isVenta ? (
                <div className="space-y-3">
                  <LegalSwitchRow
                    label="1. ¿Te piden dinero, 'reserva' o fotos de tu cédula ANTES de ver el apartamento por dentro?"
                    hint="Principal modalidad de estafa digital en Bogotá (hasta $2M en falsos anticipos en 2026)."
                    value={shield.pideDineroODocsPreVisita}
                    dangerOnYes
                    onChange={(val) =>
                      setShield((s) => ({ ...s, pideDineroODocsPreVisita: val }))
                    }
                  />
                  <LegalSwitchRow
                    label="2. ¿Te exigen depósito en efectivo o mes de garantía para el arrendador?"
                    hint="Prohibido por Art. 16 Ley 820 de 2003 (multas de Hábitat). Único legal (Art. 15): garantía de servicios a favor de la empresa, nunca al dueño."
                    value={shield.pideDepositoEfectivo}
                    dangerOnYes
                    onChange={(val) =>
                      setShield((s) => ({ ...s, pideDepositoEfectivo: val }))
                    }
                  />
                  <LegalSwitchRow
                    label="3. ¿Se arrienda por medio de inmobiliaria?"
                    hint="Toda inmobiliaria que administre ≥5 inmuebles debe tener Matrícula de Arrendador vigente (Art. 28 Ley 820)."
                    value={shield.esInmobiliaria}
                    onChange={(val) => {
                      setShield((s) => ({ ...s, esInmobiliaria: val }));
                      setInterlocutor(val ? 'inmobiliaria' : 'dueno_directo');
                    }}
                    actionSlot={
                      shield.esInmobiliaria && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-stoneLine/70 pt-2">
                          <a
                            href={OFFICIAL_LINKS.HABITAT_MATRICULA_ARRENDADOR}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-sage ring-1 ring-sage/30 hover:bg-emerald-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Verificar Matrícula en Hábitat Bogotá
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setShield((s) => ({
                                ...s,
                                matriculaHabitatVerificada: !s.matriculaHabitatVerificada,
                              }))
                            }
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                              shield.matriculaHabitatVerificada
                                ? 'bg-sage text-white'
                                : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {shield.matriculaHabitatVerificada
                              ? '✓ Matrícula verificada'
                              : 'Marcar como verificada'}
                          </button>
                        </div>
                      )
                    }
                  />
                  <LegalSwitchRow
                    label="4. ¿Los ingresos para el estudio de arriendo son solo de pensión?"
                    hint="Art. 134 num. 5 Ley 100: las pensiones son inembargables y aseguradoras (Sura / El Libertador) suelen rechazar sin rentas adicionales."
                    value={shield.ingresosSoloPension}
                    onChange={(val) =>
                      setShield((s) => ({ ...s, ingresosSoloPension: val }))
                    }
                    actionSlot={
                      shield.ingresosSoloPension && (
                        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amberWarm">
                          <strong>Alternativas recomendadas para pensionados:</strong> prioriza{' '}
                          <strong>propietario directo</strong>, incluye a un hijo con ingresos
                          embargables como coarrendatario, o consulta por CDT pignorado / póliza
                          digital sin codeudor.
                        </div>
                      )
                    }
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <LegalSwitchRow
                    label="1. ¿Ya descargaste TÚ mismo el Certificado de Tradición y Libertad (< 30 días)?"
                    hint="Evita estafas de suplantación o bandas que arriendan aptos para venderlos. Cuesta $23.000 directo en Supernotariado."
                    value={shield.ctlDescargadoPropio}
                    positiveOnYes
                    onChange={(val) =>
                      setShield((s) => ({ ...s, ctlDescargadoPropio: val }))
                    }
                    actionSlot={
                      <div className="mt-2">
                        <a
                          href={OFFICIAL_LINKS.SUPERNOTARIADO_CTL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-sage ring-1 ring-sage/30 hover:bg-emerald-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ir a Supernotariado (CTL $23.000 en línea)
                        </a>
                      </div>
                    }
                  />
                  <LegalSwitchRow
                    label="2. ¿Revisaste el último recibo del Predial y el Acta de la última Asamblea?"
                    hint="Confirma si hay cuotas extraordinarias de fachada/ascensor. Recuerda: el avalúo catastral es 60%–80% del comercial (nunca lo multipliques × 2)."
                    value={shield.predialYActaRevisados}
                    positiveOnYes
                    onChange={(val) =>
                      setShield((s) => ({ ...s, predialYActaRevisados: val }))
                    }
                  />
                  <LegalSwitchRow
                    label='3. ¿La promesa dice textualmente "arras confirmatorias" e incluye salida sin multa si niegan crédito o avalúo?'
                    hint={`Por Art. 1861 C.C., si solo dice "arras" se presume retracto. En este inmueble arriesgarías el 10% (${formatCOP(Math.round(latestPrice * 0.1))}). Evita remates judiciales.`}
                    value={shield.promesaBlindadaArrasConfirmatorias}
                    positiveOnYes
                    onChange={(val) =>
                      setShield((s) => ({
                        ...s,
                        promesaBlindadaArrasConfirmatorias: val,
                      }))
                    }
                  />
                </div>
              )}

              {legalRisk.warnings.length > 0 && !legalRisk.blocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amberWarm space-y-1">
                  {legalRisk.warnings.map((w) => (
                    <p key={w}>• {w}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveExtrasClick}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sage bg-emerald-50 px-4 py-2 text-xs font-bold text-sage hover:bg-emerald-100"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {saving ? 'Guardando...' : 'Guardar verificación'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-4 py-2.5 text-xs font-bold text-white hover:bg-sage/90"
                >
                  Siguiente: Armar Oferta por WhatsApp
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ======================= PASO 3 ======================= */}
          {step === 3 && (
            <div className="space-y-4">
              {legalRisk.blocked && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-800">
                  🛑 Recuerda: El Escudo Anti-Estafa detectó una alerta crítica en el Paso 2. No
                  envíes documentos ni dinero antes de validar en persona.
                </div>
              )}

              <div className="rounded-2xl border border-stoneLine bg-ivory/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">1. ¿Con quién hablas?</span>
                  <div className="flex gap-2">
                    {[
                      { id: 'dueno_directo', label: 'Dueño Directo' },
                      { id: 'inmobiliaria', label: 'Inmobiliaria / Agente' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setInterlocutor(opt.id);
                          setCustomOffer(null);
                          setCustomMessage(null);
                        }}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          interlocutor === opt.id
                            ? 'border-sage bg-sage text-white'
                            : 'border-stoneLine bg-white text-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-bold text-ink">
                    2. Tu carta fuerte (concesión a cambio del descuento):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(isVenta
                      ? [
                          { id: 'contado', label: 'Pago de contado' },
                          { id: 'credito_preaprobado', label: 'Crédito preaprobado' },
                          { id: 'necesita_arreglos', label: 'Necesita arreglos' },
                        ]
                      : [
                          { id: 'entrada_inmediata', label: 'Entrada inmediata + papeles listos' },
                          { id: 'necesita_arreglos', label: 'Días de gracia / arreglos' },
                        ]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setPalanca(opt.id);
                          setCustomOffer(null);
                          setCustomMessage(null);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          palanca === opt.id
                            ? 'border-ink bg-ink text-white'
                            : 'border-stoneLine bg-white text-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Monto con precisión moderada */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-sage">
                  Oferta sugerida (precisión moderada, múltiplos de{' '}
                  {formatCOP(offerCalc.pasoAjuste)})
                </p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomOffer(Math.max(0, activeOffer - offerCalc.pasoAjuste));
                      setCustomMessage(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-stoneLine bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-stone-100"
                  >
                    <Minus className="h-3.5 w-3.5" />
                    {isVenta ? '$500k' : '$25k'}
                  </button>

                  <span className="font-serif text-2xl font-bold text-ink">
                    {formatCOP(activeOffer)}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomOffer(activeOffer + offerCalc.pasoAjuste);
                      setCustomMessage(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-stoneLine bg-white px-3 py-2 text-xs font-bold text-ink hover:bg-stone-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isVenta ? '$500k' : '$25k'}
                  </button>
                </div>

                <p className="mt-2 text-xs font-semibold text-sage">
                  Ahorro planteado frente al precio pedido: {formatCOP(activeSavingsCop)} (-
                  {activeSavingsPct}%)
                  {isVenta
                    ? ` · +${formatCOP(Math.round(activeOffer * 0.005))} por pedir 50/50 en beneficencia`
                    : ''}
                </p>
              </div>

              {/* Teléfono opcional + Mensaje editable */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink">
                    Mensaje listo para WhatsApp (puedes ajustarlo antes de enviar):
                  </label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="WhatsApp del dueño/asesor (opcional)"
                    className="w-60 rounded-xl border border-stoneLine bg-ivory px-3 py-1.5 text-xs text-ink"
                  />
                </div>
                <textarea
                  rows={5}
                  value={messageText}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full rounded-xl border border-stoneLine bg-ivory p-3.5 text-xs leading-relaxed text-ink focus:border-sage focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stoneLine bg-white px-4 py-2.5 text-xs font-bold text-ink hover:bg-stone-50"
                >
                  {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Texto copiado' : 'Copiar texto'}
                </button>

                <a
                  href={finalWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (onSaveListingExtras) {
                      onSaveListingExtras(listing, buildCurrentExtras(priceHistory, shield));
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-sage px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sage/90"
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar propuesta por WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegalSwitchRow({
  label,
  hint,
  value,
  dangerOnYes = false,
  positiveOnYes = false,
  onChange,
  actionSlot,
}) {
  const yesActiveClass = dangerOnYes
    ? 'border-red-600 bg-red-600 text-white'
    : positiveOnYes
      ? 'border-sage bg-sage text-white'
      : 'border-ink bg-ink text-white';

  const noActiveClass = dangerOnYes
    ? 'border-emerald-300 bg-emerald-50 text-sage'
    : 'border-stoneLine bg-stone-100 text-ink';

  return (
    <div className="rounded-2xl border border-stoneLine bg-ivory/60 p-3.5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold text-ink">{label}</p>
          <p className="text-[11px] leading-relaxed text-stone-600">{hint}</p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onChange(true)}
            aria-pressed={Boolean(value)}
            className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition ${
              value ? yesActiveClass : 'border-stoneLine bg-white text-stone-600'
            }`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            aria-pressed={!value}
            className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition ${
              !value ? noActiveClass : 'border-stoneLine bg-white text-stone-600'
            }`}
          >
            {!value && dangerOnYes && <CheckCircle2 className="h-3.5 w-3.5" />}
            No
          </button>
        </div>
      </div>
      {actionSlot}
    </div>
  );
}
