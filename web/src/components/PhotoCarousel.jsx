import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Building2,
  Sparkles,
  TrendingDown,
  Clock,
  AlertOctagon,
} from 'lucide-react';
import { isListingUnavailable } from '../utils/formatters';
import {
  BOGOTA_2026,
  getPortalDuplicationRate,
} from '../utils/valuationEngine';

export default function PhotoCarousel({ listing }) {
  const [index, setIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState({});

  const validFotos = (listing.fotos || []).filter((u) => !failedUrls[u]);
  const currentUrl = validFotos[index] || validFotos[0] || '';
  const total = validFotos.length;

  const isUnavailable = isListingUnavailable(listing);
  const isManual = listing.origen === 'manual';
  const isNuevo =
    !isUnavailable && !isManual && listing.estado.toUpperCase().startsWith('NUEVO');

  const history = Array.isArray(listing.priceHistory) ? listing.priceHistory : [];
  let dropPct = 0;
  if (history.length >= 2) {
    const firstP = Number(history[0]?.price) || 0;
    const lastP = Number(history[history.length - 1]?.price) || 0;
    if (firstP > 0 && lastP > 0 && lastP < firstP) {
      dropPct = Math.round(((firstP - lastP) / firstP) * 100);
    }
  }
  const isBajo =
    !isUnavailable && (dropPct > 0 || listing.estado.toUpperCase().includes('BAJÓ'));

  const dias = Number(listing.diasEnMercado) || 0;
  const highMarginThreshold =
    listing.operacion === 'venta'
      ? BOGOTA_2026.DIAS_VITRINA_ALTO_MARGEN.venta
      : BOGOTA_2026.DIAS_VITRINA_ALTO_MARGEN.arriendo;
  const isHighMargin = !isUnavailable && dias >= highMarginThreshold;
  const isModerateAge =
    !isUnavailable && !isHighMargin && listing.operacion === 'arriendo' && dias >= 21;

  const dupRate = getPortalDuplicationRate(listing.fuente);

  const handlePrev = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((prev) => (prev - 1 + total) % total);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    if (total <= 1) return;
    setIndex((prev) => (prev + 1) % total);
  };

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-t-2xl bg-stone-100">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={`Apartamento en ${listing.barrio}`}
          loading="lazy"
          onError={() => {
            setFailedUrls((prev) => ({ ...prev, [currentUrl]: true }));
            setIndex(0);
          }}
          className="h-full w-full object-cover transition duration-300"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-stone-100 via-ivory to-stone-200 px-4 text-center">
          <Building2 className="mb-2 h-10 w-10 text-sage/60" />
          <p className="font-serif text-sm font-semibold text-ink">
            {listing.barrio || 'Bogotá Norte'}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            Foto no disponible temporalmente · Ver en portal
          </p>
        </div>
      )}

      {/* Etiquetas flotantes */}
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[68%] flex-wrap gap-1.5">
        {isUnavailable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <AlertOctagon className="h-3 w-3" />
            Ya no disponible en el portal
          </span>
        )}
        {isManual && !isUnavailable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-700 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Sparkles className="h-3 w-3" />
            Aviso propio
          </span>
        )}
        {isNuevo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Sparkles className="h-3 w-3" />
            Nuevo esta semana
          </span>
        )}
        {isBajo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <TrendingDown className="h-3 w-3" />
            {dropPct > 0 ? `Bajó ${dropPct}%` : 'Bajó de precio'}
          </span>
        )}
        {isHighMargin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-800 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Clock className="h-3 w-3" />
            {dias} días en vitrina · Alto margen
          </span>
        )}
        {isModerateAge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amberWarm px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Clock className="h-3 w-3" />
            {dias} días publicado
          </span>
        )}
      </div>

      {/* Fuente */}
      {listing.fuente && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          {listing.fuente}
          {dupRate >= 0.3 ? ` · ${Math.round(dupRate * 100)}% rep.` : ''}
        </span>
      )}

      {/* Flechas del carrusel */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Foto anterior"
            className="absolute left-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition hover:bg-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Foto siguiente"
            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition hover:bg-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="pointer-events-none absolute bottom-2.5 right-3 rounded-full bg-ink/75 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {(index % total) + 1} / {total}
          </span>
        </>
      )}
    </div>
  );
}
