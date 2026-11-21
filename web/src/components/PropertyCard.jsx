import React from 'react';
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
} from 'lucide-react';
import PhotoCarousel from './PhotoCarousel';
import SaleSimulator from './SaleSimulator';
import {
  buildStreetViewUrl,
  buildWhatsAppUrl,
  computeOpportunityBadge,
  estimateUtilitiesByStratum,
  formatCOP,
  getScoreDescriptor,
  isListingUnavailable,
} from '../utils/formatters';

export default function PropertyCard({
  listing,
  resumenList,
  allListings,
  onSetEstadoVisita,
  isCompared,
  onToggleCompare,
  savingId,
}) {
  const scoreInfo = getScoreDescriptor(listing.score);
  const opportunity = computeOpportunityBadge(listing, resumenList, allListings);
  const isVenta = listing.operacion === 'venta';

  const utilitiesEst = estimateUtilitiesByStratum(listing.estrato);
  const flujoMensualEst = listing.totalMensual + utilitiesEst;

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

  // Semáforo de requisitos
  const greenPills = [
    listing.zona === 'Oriental' ? 'Zona Oriental' : null,
    listing.balcon ? 'Con balcón / terraza' : null,
    listing.cocinaAbierta ? 'Cocina abierta' : null,
    `${listing.area} m² · ${listing.hab} hab · ${listing.banos} baños · ${listing.garajes} gar.`,
  ].filter(Boolean);

  const amberPills = [
    listing.zona !== 'Oriental' ? 'Zona Occidental' : null,
    !listing.cocinaAbierta ? 'Cocina cerrada' : null,
    !listing.balcon ? 'Sin balcón especificado' : null,
    listing.adminEstimada ? 'Admin estimada' : null,
    hasMainRoadAlert ? 'Vía principal / posible ruido' : null,
  ].filter(Boolean);

  const extraComfortTags = listing.etiquetasConfort.filter(
    (t) => !t.toLowerCase().includes('vía principal')
  );

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isDiscarded ? 'border-stone-200 opacity-80' : 'border-stoneLine'
      }`}
    >
      <PhotoCarousel listing={listing} />

      <div className="flex flex-1 flex-col p-5">
        {/* Encabezado: Score + Oportunidad */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
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
                Estrato {listing.estrato}
              </span>
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
        </div>

        {/* Alerta de no disponibilidad confirmada */}
        {isUnavailable && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
            Este apartamento ya no figura disponible en el portal.
          </div>
        )}

        {/* Sello de oportunidad */}
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${
            opportunity.tone === 'savings'
              ? 'bg-emerald-50 text-sage border border-emerald-200'
              : opportunity.tone === 'premium'
                ? 'bg-amber-50 text-amberWarm border border-amber-200'
                : 'bg-stone-50 text-stone-700 border border-stoneLine'
          }`}
        >
          {opportunity.text}
        </div>

        {/* Métricas físicas */}
        <div className="mt-3.5 grid grid-cols-4 gap-2 rounded-xl border border-stoneLine/80 bg-ivory/60 px-3 py-2.5 text-center text-xs">
          <div className="flex flex-col items-center">
            <Maximize2 className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.area} m²</span>
          </div>
          <div className="flex flex-col items-center">
            <BedDouble className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.hab} hab</span>
          </div>
          <div className="flex flex-col items-center">
            <Bath className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.banos} baños</span>
          </div>
          <div className="flex flex-col items-center">
            <Car className="mb-1 h-3.5 w-3.5 text-sage" />
            <span className="font-bold text-ink">{listing.garajes} gar.</span>
          </div>
        </div>

        {/* Desglose financiero inteligente */}
        {isVenta ? (
          <div className="mt-4 rounded-xl border border-stoneLine bg-ivory/40 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-stone-600">Precio de venta</span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.precioVenta)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-stone-600">
              <span>Valor por m²:</span>
              <span className="text-right font-semibold text-ink">
                {formatCOP(listing.costoM2)}/m²
              </span>
              <span>
                Admin mensual{listing.adminEstimada ? ' (est.)' : ''}:
              </span>
              <span className="text-right font-semibold text-ink">
                {formatCOP(listing.admin)}
              </span>
              <span>Antigüedad:</span>
              <span className="text-right font-semibold text-ink">
                {listing.antiguedad}
              </span>
            </div>
            <SaleSimulator precioVenta={listing.precioVenta} />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-stoneLine bg-ivory/40 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-stone-600">
                Total mensual (Canon + Admin)
              </span>
              <span className="font-serif text-xl font-bold text-ink">
                {formatCOP(listing.totalMensual)}
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
                <span>Servicios est. (Estrato {listing.estrato}):</span>
                <span className="font-medium text-stone-700">{formatCOP(utilitiesEst)}</span>
              </div>
              <div className="flex justify-between border-t border-stoneLine/70 pt-1.5 font-semibold text-sage">
                <span>Flujo mensual estimado:</span>
                <span>{formatCOP(flujoMensualEst)}</span>
              </div>
            </div>
          </div>
        )}

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

        {/* Acciones de estado (Sheets) */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-stoneLine pt-4">
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
              <span>WhatsApp</span>
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
