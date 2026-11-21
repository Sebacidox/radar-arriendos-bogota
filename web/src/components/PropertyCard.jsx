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
  const semaforoHeadline = (() => {
    if (!activeEval) return 'Precio de referencia';
    if (activeEval.color === 'alerta_antifraude') {
      return `🔴 PRECIO SOSPECHOSAMENTE BAJO (-${pctAbs}%) · Revisa el Escudo`;
    }
    if (activeEval.color === 'verde') {
      return `🟢 OPORTUNIDAD REAL · ${pctAbs}% debajo de la mediana de ${benchmark.barrioLabel}`;
    }
    if (activeEval.color === 'rojo') {
      return `🔴 SOBREPRECIO NEGOCIABLE · ${pctAbs}% arriba de ${benchmark.barrioLabel}`;
    }
    if (pctAbs <= 2) {
      return `🟡 PRECIO DE MERCADO · Alineado con ${benchmark.barrioLabel}`;
    }
    const dir = (activeEval.diffPct || 0) < 0 ? 'debajo' : 'arriba';
    return `🟡 PRECIO DE MERCADO (${pctAbs}% ${dir} de ${benchmark.barrioLabel})`;
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
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isDiscarded ? 'border-stone-200 opacity-80' : 'border-stoneLine'
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
                      ? 'bg-amber-100 text-amberWarm'
                      : 'bg-stone-100 text-stone-700'
                }`}
              >
                {Number(listing.score).toFixed(1)} · {scoreInfo.label}
              </span>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
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

            <h2 className="mt-2 font-serif text-xl font-bold leading-snug text-ink">
              {listing.barrio || 'Bogotá Norte'}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" />
              <span className="truncate">
                {listing.direccion && listing.direccion !== 'No publicada'
                  ? listing.direccion
                  : `Dirección no publicada · Zona ${listing.zona}`}
              </span>
            </p>
          </div>

          {listing.origen === 'manual' && onDeleteManual && (
            <button
              type="button"
              onClick={() => onDeleteManual(listing)}
              title="Eliminar este aviso propio"
              className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-700"
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
          className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            SEMAFORO_STYLES[activeEval?.color || 'amarillo']
          }`}
        >
          {semaforoHeadline}
        </div>

        {/* Métricas físicas */}
        <div className="mt-3.5 grid grid-cols-4 gap-2 rounded-xl border border-stoneLine/80 bg-ivory/60 px-3 py-2.5 text-center text-xs">
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
          <div className="mt-4 rounded-xl border border-stoneLine bg-ivory/40 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-stone-600">Precio pedido</span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.precioVenta)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-stone-600">
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
            <div className="mt-2.5 flex items-baseline justify-between border-t border-stoneLine/70 pt-2 text-xs">
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
          <div className="mt-4 rounded-xl border border-stoneLine bg-ivory/40 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-stone-600">
                Canon + Admin
              </span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.canon + listing.admin)}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-stone-600">
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
                <span className="font-medium text-stone-700">
                  {formatCOP(utilitiesEst + evalArriendo.extraCalentador)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  {interlocutor === 'dueno_directo'
                    ? 'Trato directo (trámites entrada):'
                    : 'Trámites agencia prorrateados (12m):'}
                </span>
                <span className="font-medium text-stone-700">
                  {interlocutor === 'dueno_directo'
                    ? '$0'
                    : `+${formatCOP(evalArriendo.ingresoProrrateado)}`}
                </span>
              </div>
              <div className="flex justify-between border-t border-stoneLine/70 pt-1.5 font-bold text-sage">
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
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-sage"
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
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amberWarm"
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
                  className="rounded-md border border-stoneLine bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Botón principal Centro de Decisión (3 pasos) */}
        {onOpenDecision && (
          <button
            type="button"
            onClick={() => onOpenDecision(listing)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sage/90"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Analizar, Verificar y Ofertar</span>
          </button>
        )}

        {/* Acciones de estado (Sheets) */}
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-stoneLine pt-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onSetEstadoVisita(listing, isLiked ? '' : 'Nos gusta')
            }
            className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
              isLiked
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-stoneLine bg-white text-stone-700 hover:border-rose-200 hover:bg-rose-50/50'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-rose-600 text-rose-600' : ''}`} />
            <span>Nos gusta</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onSetEstadoVisita(listing, isScheduled ? '' : 'Agendar visita')
            }
            className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
              isScheduled
                ? 'border-sage bg-sage text-white'
                : 'border-stoneLine bg-white text-stone-700 hover:border-sage/40 hover:bg-emerald-50/50'
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Visita</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onSetEstadoVisita(listing, isDiscarded ? '' : 'Descartado')
            }
            className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
              isDiscarded
                ? 'border-stone-400 bg-stone-200 text-ink'
                : 'border-stoneLine bg-white text-stone-600 hover:border-stone-400 hover:bg-stone-100'
            }`}
          >
            <X className="h-3.5 w-3.5" />
            <span>{isDiscarded ? 'Restaurar' : 'Descartar'}</span>
          </button>
        </div>

        {/* Acciones secundarias */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => onToggleCompare(listing)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition ${
              isCompared
                ? 'bg-ink text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            <span>{isCompared ? 'En comparador' : 'Comparar'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-sage transition hover:bg-emerald-100"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp familia</span>
            </a>

            {streetViewUrl && (
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 font-semibold text-stone-700 transition hover:bg-stone-200"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Street View</span>
              </a>
            )}

            {primaryLink && (
              <a
                href={primaryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-stoneLine px-2.5 py-1.5 font-semibold text-ink transition hover:bg-stone-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Portal</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
