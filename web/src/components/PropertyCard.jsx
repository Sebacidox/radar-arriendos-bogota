import React, { useMemo } from 'react';
import {
  BedDouble,
  Bath,
  Car,
  Maximize2,
  MapPin,
  Heart,
  Phone,
  X,
  GitCompareArrows,
  MessageCircle,
  Eye,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import PhotoCarousel from './PhotoCarousel';
import SaleSimulator from './SaleSimulator';
import {
  buildStreetViewUrl,
  buildWhatsAppUrl,
  estimateUtilitiesByStratum,
  formatCOP,
  formatCompactCOP,
  formatTitleCase,
  getScoreDescriptor,
  isListingUnavailable,
} from '../utils/formatters';
import {
  BOGOTA_2026,
  evaluateArriendo2026,
  evaluateCompra2026,
  evaluateLegalRisk,
  inferInterlocutor,
  resolveBarrioBenchmark,
} from '../utils/valuationEngine';

const SEMAFORO_STYLES = {
  verde: 'border-emerald-200 bg-emerald-50 text-sage',
  amarillo: 'border-stoneLine bg-stone-50 text-stone-700',
  rojo: 'border-amber-200 bg-amber-50 text-amberWarm',
  alerta_antifraude: 'border-red-300 bg-red-50 text-red-800',
};

export default function PropertyCard({
  listing,
  resumenList,
  allListings,
  onSetEstadoVisita,
  isCompared,
  onToggleCompare,
  savingId,
  onOpenDecision,
  onDeleteManual,
}) {
  const scoreInfo = getScoreDescriptor(listing.score);
  const isVenta = listing.operacion === 'venta';

  const benchmark = useMemo(
    () => resolveBarrioBenchmark(listing.barrio, listing.operacion, resumenList, allListings),
    [listing.barrio, listing.operacion, resumenList, allListings]
  );
  const interlocutor = useMemo(() => inferInterlocutor(listing), [listing]);
  const utilitiesEst = estimateUtilitiesByStratum(listing.estrato);

  const evalArriendo = useMemo(() => {
    if (isVenta) return null;
    return evaluateArriendo2026({
      canon: listing.canon,
      admin: listing.admin,
      areaM2: listing.area,
      estrato: listing.estrato,
      interlocutor,
      medianaBarrioCmnM2: benchmark.medianaM2,
      calentador: listing.meta?.calentador || 'gas',
      avaluoCatastral: listing.meta?.avaluoCatastral || 0,
      serviciosBaseEstrato: utilitiesEst,
    });
  }, [isVenta, listing, interlocutor, benchmark.medianaM2, utilitiesEst]);

  const evalCompra = useMemo(() => {
    if (!isVenta) return null;
    return evaluateCompra2026({
      precioOferta: listing.precioVenta,
      areaM2: listing.area,
      adminMensual: listing.admin,
      adminMedianaBarrio: benchmark.adminMediana,
      medianaBarrioVentaM2: benchmark.medianaM2,
      estadoRemodelacion: listing.meta?.estadoRemodelacion || 'listo',
      modalidadPago: listing.meta?.modalidadPago || 'contado',
      beneficencia5050: listing.meta?.beneficencia5050 !== false,
    });
  }, [isVenta, listing, benchmark]);

  const legalRisk = useMemo(
    () =>
      listing.legalShield
        ? evaluateLegalRisk(listing.operacion, listing.legalShield)
        : null,
    [listing.operacion, listing.legalShield]
  );

  const activeEval = isVenta ? evalCompra : evalArriendo;
  const pctAbs = Math.round(Math.abs(activeEval?.diffPct || 0) * 100);
  const displayBarrio = formatTitleCase(listing.barrio) || 'Bogotá Norte';
  const benchmarkBarrioLabel = formatTitleCase(benchmark.barrioLabel) || 'el sector';
  const semaforoHeadline = (() => {
    if (!activeEval) return 'Precio de referencia';
    if (activeEval.color === 'alerta_antifraude') {
      return `🔴 Precio sospechosamente bajo (-${pctAbs}%) · Revisa el Escudo`;
    }
    if (activeEval.color === 'verde') {
      return `🟢 Oportunidad real · ${pctAbs}% debajo de la mediana de ${benchmarkBarrioLabel}`;
    }
    if (activeEval.color === 'rojo') {
      return `🔴 Sobreprecio negociable · ${pctAbs}% arriba de ${benchmarkBarrioLabel}`;
    }
    if (pctAbs <= 2) {
      return `🟡 Precio de mercado · Alineado con ${benchmarkBarrioLabel}`;
    }
    const dir = (activeEval.diffPct || 0) < 0 ? 'debajo' : 'arriba';
    return `🟡 Precio de mercado (${pctAbs}% ${dir} de ${benchmarkBarrioLabel})`;
  })();

  const streetViewUrl = buildStreetViewUrl(listing.lat, listing.lng);
  const whatsappUrl = buildWhatsAppUrl(listing);
  const primaryLink = listing.enlaces?.[0] || '';

  const isLiked = listing.estadoVisita === 'Nos gusta';
  const isScheduled = listing.estadoVisita === 'Agendar visita';
  const isDiscarded = listing.estadoVisita === 'Descartado';
  const isUnavailable = isListingUnavailable(listing);
  const isBusy = savingId === listing.id;

  const hasMainRoadAlert = listing.etiquetasConfort.some((t) =>
    t.toLowerCase().includes('vía principal')
  );

  const greenPills = [
    listing.zona === 'Oriental' ? 'Zona Oriental' : null,
    listing.balcon ? 'Con balcón / terraza' : null,
    listing.cocinaAbierta ? 'Cocina abierta' : null,
    `${listing.area} m² · ${listing.hab} hab · ${listing.banos} baños · ${listing.garajes} gar.`,
  ].filter(Boolean);

  const amberPills = [
    listing.zona !== 'Oriental' ? 'Zona Occidental' : null,
    !listing.cocinaAbierta && listing.origen !== 'manual' ? 'Cocina cerrada' : null,
    !listing.balcon && listing.origen !== 'manual' ? 'Sin balcón especificado' : null,
    listing.adminEstimada ? 'Admin estimada' : null,
    hasMainRoadAlert ? 'Vía principal / posible ruido' : null,
  ].filter(Boolean);

  const extraComfortTags = listing.etiquetasConfort.filter(
    (t) => !t.toLowerCase().includes('vía principal')
  );

  const savingsDirectoEntrada = Math.round(
    (listing.canon || 0) * BOGOTA_2026.INGRESO_INMOBILIARIA_PCT
  );
  const costoRealCompraConCierre = isVenta
    ? listing.precioVenta + (evalCompra?.costosCierreTotales || 0) + (evalCompra?.costoRemodelacion || 0)
    : 0;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition duration-200 ${
        isDiscarded
          ? 'border-stone-200/70 opacity-80 shadow-none'
          : 'border-stone-200/75 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] hover:shadow-[0_10px_28px_-8px_rgba(28,25,23,0.11)]'
      }`}
    >
      <PhotoCarousel listing={listing} />

      <div className="flex flex-1 flex-col p-5">
        {/* Encabezado */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${
                  scoreInfo.tone === 'sage'
                    ? 'bg-sage/12 text-sage'
                    : scoreInfo.tone === 'amber'
                      ? 'bg-amber-100/90 text-amberWarm'
                      : 'bg-stone-100 text-stone-700'
                }`}
              >
                {Number(listing.score).toFixed(1)} · {scoreInfo.label}
              </span>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                Estrato {listing.meta?.estratoOficial || listing.estrato}
                {listing.meta?.estratoOficial ? ' · IDECA ✓' : ''}
              </span>
              {legalRisk?.blocked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                  <ShieldAlert className="h-3 w-3" />
                  Alerta legal
                </span>
              )}
              {legalRisk?.isVerified && !legalRisk.blocked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-sage">
                  <ShieldCheck className="h-3 w-3" />
                  Escudo OK
                </span>
              )}
            </div>

            <h2 className="mt-2 font-serif text-xl font-bold leading-snug tracking-tight text-ink">
              {displayBarrio}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-700">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-500" />
              <span className="truncate">
                {listing.direccion && listing.direccion !== 'No publicada'
                  ? listing.direccion
                  : `Dirección no publicada · Zona ${listing.zona}`}
              </span>
            </p>
            {listing.categoriaFiltro === 'ajuste_razonable' &&
              listing.motivosAjuste?.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1 rounded-xl border border-amber-200/90 bg-amber-50/90 px-2.5 py-1.5 text-[11px] font-semibold text-amberWarm">
                  <span>Ajuste razonable:</span>
                  <span className="font-bold text-ink">
                    {listing.motivosAjuste.join(' · ')}
                  </span>
                </div>
              )}
          </div>

          {listing.origen === 'manual' && onDeleteManual && (
            <button
              type="button"
              onClick={() => onDeleteManual(listing)}
              title="Eliminar este aviso propio"
              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl text-stone-500 transition hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Alerta de no disponibilidad confirmada */}
        {isUnavailable && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            Este apartamento ya no figura disponible en el portal.
          </div>
        )}

        {/* Semáforo de Precio Real 2026 */}
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold leading-snug ${
            SEMAFORO_STYLES[activeEval?.color || 'amarillo']
          }`}
        >
          {semaforoHeadline}
        </div>

        {/* Métricas físicas */}
        <div className="mt-3.5 grid grid-cols-4 gap-2 rounded-xl border border-stone-200/65 bg-ivory/80 px-3 py-2.5 text-center text-xs">
          <div className="flex flex-col items-center">
            <Maximize2 className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.area} m²</span>
          </div>
          <div className="flex flex-col items-center">
            <BedDouble className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.hab || '-'} hab</span>
          </div>
          <div className="flex flex-col items-center">
            <Bath className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.banos || '-'} baños</span>
          </div>
          <div className="flex flex-col items-center">
            <Car className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.garajes ?? '-'} gar.</span>
          </div>
        </div>

        {/* Desglose financiero inteligente 2026 */}
        {isVenta && evalCompra ? (
          <div className="mt-4 rounded-xl border border-stone-200/65 bg-ivory/55 p-3.5 tabular-nums">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-stone-700">Precio pedido</span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.precioVenta)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-stone-700">
              <span>Valor por m²:</span>
              <span className="text-right font-semibold text-ink">
                {formatCOP(evalCompra.precioPedidoM2 || listing.costoM2)}/m²
              </span>
              <span>
                Admin{listing.adminEstimada ? ' (est.)' : ''}:
              </span>
              <span className="text-right font-semibold text-ink">
                {formatCOP(listing.admin)}
              </span>
              {evalCompra.capitalizacionAdmin10a > 0 && (
                <span className="col-span-2 text-[11px] font-medium text-amberWarm">
                  Admin +{formatCOP(evalCompra.deltaAdminMensual)}/mes frente al sector ≈{' '}
                  +{formatCompactCOP(evalCompra.capitalizacionAdmin10a)} en 10 años
                </span>
              )}
              <span>Cierre est. (50/50):</span>
              <span className="text-right font-semibold text-ink">
                {formatCOP(evalCompra.costosCierreTotales)}
                {evalCompra.saltoTacticoOrip ? ' ⚠️ ORIP' : ''}
              </span>
              <span>Antigüedad:</span>
              <span className="text-right font-semibold text-ink">
                {listing.antiguedad}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between border-t border-stone-200/70 pt-2 text-xs">
              <span className="font-bold text-sage">
                Costo real con cierre{evalCompra.costoRemodelacion > 0 ? ' y arreglos' : ''}:
              </span>
              <span className="font-bold text-sage">
                {formatCOP(costoRealCompraConCierre)}
              </span>
            </div>
            <SaleSimulator
              precioVenta={listing.precioVenta}
              areaM2={listing.area}
              admin={listing.admin}
              barrio={listing.barrio}
              resumenList={resumenList}
              allListings={allListings}
              onOpenDecision={onOpenDecision ? () => onOpenDecision(listing) : undefined}
            />
          </div>
        ) : evalArriendo ? (
          <div className="mt-4 rounded-xl border border-stone-200/65 bg-ivory/55 p-3.5 tabular-nums">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-stone-700">
                Canon + Admin
              </span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.canon + listing.admin)}
              </span>
            </div>
            {listing.canon + listing.admin > 3500000 && (
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                Excede objetivo de $3.5M (+{formatCOP(listing.canon + listing.admin - 3500000)} · penalizado en score)
              </p>
            )}
            <div className="mt-2 space-y-1 text-xs text-stone-700">
              <div className="flex justify-between">
                <span>Canon: {formatCOP(listing.canon)}</span>
                <span>
                  Admin{listing.adminEstimada ? ' (est.)' : ''}: {formatCOP(listing.admin)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  Servicios est. (E{listing.meta?.estratoOficial || listing.estrato}
                  {evalArriendo.extraCalentador > 0 ? ', eléctrico' : ', gas'}):
                </span>
                <span className="font-medium text-ink">
                  {formatCOP(utilitiesEst + evalArriendo.extraCalentador)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  {interlocutor === 'dueno_directo'
                    ? 'Trato directo (trámites entrada):'
                    : 'Trámites agencia prorrateados (12m):'}
                </span>
                <span className="font-medium text-ink">
                  {interlocutor === 'dueno_directo'
                    ? '$0'
                    : `+${formatCOP(evalArriendo.ingresoProrrateado)}`}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200/70 pt-1.5 font-bold text-sage">
                <span>Esto es lo que realmente te cuesta:</span>
                <span>{formatCOP(evalArriendo.flujoBolsilloMensual)}/mes</span>
              </div>
              {interlocutor === 'dueno_directo' && savingsDirectoEntrada > 0 && (
                <p className="text-[11px] font-medium text-sage">
                  Te ahorras ~{formatCOP(savingsDirectoEntrada)} en estudio y contrato.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* Semáforo de requisitos */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {greenPills.map((pill) => (
              <span
                key={pill}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-sage"
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {pill}
              </span>
            ))}
          </div>
          {amberPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {amberPills.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50/90 px-2.5 py-1 text-[11px] font-medium text-amberWarm"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {pill}
                </span>
              ))}
            </div>
          )}
          {extraComfortTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {extraComfortTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-stone-200/75 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Jerarquía de acciones en 3 niveles claros */}
        <div className="mt-auto space-y-2.5 pt-5">
          {/* Nivel 1: Botón principal único */}
          {onOpenDecision && (
            <button
              type="button"
              onClick={() => onOpenDecision(listing)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(46,94,78,0.32)] transition hover:bg-sage/90"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Analizar, Verificar y Ofertar</span>
            </button>
          )}

          {/* Nivel 2: Fila segmentada de decisión rápida */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200/80 bg-stone-50/85 p-1">
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onSetEstadoVisita(listing, isLiked ? '' : 'Nos gusta')
              }
              className={`inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                isLiked
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-stone-700 hover:bg-white hover:text-rose-700'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 shrink-0 ${isLiked ? 'fill-white text-white' : ''}`} />
              <span>Nos gusta</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onSetEstadoVisita(listing, isScheduled ? '' : 'Agendar visita')
              }
              className={`inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                isScheduled
                  ? 'bg-sage text-white shadow-sm'
                  : 'text-stone-700 hover:bg-white hover:text-sage'
              }`}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>Visita</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onSetEstadoVisita(listing, isDiscarded ? '' : 'Descartado')
              }
              className={`inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                isDiscarded
                  ? 'bg-ink text-white shadow-sm'
                  : 'text-stone-700 hover:bg-white hover:text-ink'
              }`}
            >
              <X className="h-3.5 w-3.5 shrink-0" />
              <span>{isDiscarded ? 'Restaurar' : 'Descartar'}</span>
            </button>
          </div>

          {/* Nivel 3: Barra inferior minimalista de utilidades en una sola línea */}
          <div className="flex items-center justify-between gap-1 border-t border-stone-200/60 pt-2 text-[11px]">
            <button
              type="button"
              onClick={() => onToggleCompare(listing)}
              className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2 py-1 font-semibold transition ${
                isCompared
                  ? 'bg-ink text-white'
                  : 'text-stone-700 hover:bg-stone-100 hover:text-ink'
              }`}
            >
              <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
              <span>{isCompared ? 'Comparando' : 'Comparar'}</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2 py-1 font-semibold text-sage transition hover:bg-emerald-50"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span>WhatsApp</span>
            </a>

            {streetViewUrl && (
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2 py-1 font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-ink"
              >
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span>Street View</span>
              </a>
            )}

            {primaryLink && (
              <a
                href={primaryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2 py-1 font-semibold text-ink transition hover:bg-stone-100"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span>Portal</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
