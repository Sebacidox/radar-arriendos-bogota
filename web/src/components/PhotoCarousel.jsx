import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Building2, Sparkles, TrendingDown, Clock } from 'lucide-react';

export default function PhotoCarousel({ listing }) {
  const [index, setIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState({});

  const validFotos = (listing.fotos || []).filter((u) => !failedUrls[u]);
  const currentUrl = validFotos[index] || validFotos[0] || '';
  const total = validFotos.length;

  const isNuevo = listing.estado.toUpperCase().startsWith('NUEVO');
  const isBajo = listing.estado.toUpperCase().includes('BAJÓ');
  const isNegotiable = Number(listing.diasEnMercado) >= 21;

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
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        {isNuevo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Sparkles className="h-3 w-3" />
            Nuevo esta semana
          </span>
        )}
        {isBajo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <TrendingDown className="h-3 w-3" />
            Bajó de precio
          </span>
        )}
        {isNegotiable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amberWarm px-2.5 py-1 text-xs font-semibold text-white shadow">
            <Clock className="h-3 w-3" />
            21+ días — Margen para negociar
          </span>
        )}
      </div>

      {/* Fuente */}
      {listing.fuente && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          {listing.fuente}
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
