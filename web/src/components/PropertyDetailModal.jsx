import React from 'react';
import { X, ExternalLink, Eye, Heart, MapPin, ShieldCheck } from 'lucide-react';
import { buildStreetViewUrl, formatCOP } from '../utils/formatters';

export default function PropertyDetailModal({
  listing,
  onClose,
  onToggleFavorite,
  onOpenDecision,
}) {
  if (!listing) return null;

  const streetViewUrl = buildStreetViewUrl(listing.lat, listing.lng);
  const isFav =
    listing.estadoVisita === 'Nos gusta' || listing.estadoVisita === 'Agendar visita';

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-stoneLine bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-stoneLine bg-ivory px-5 py-4">
          <div>
            <span className="rounded-full bg-sage/10 px-2.5 py-0.5 text-xs font-bold text-sage">
              {listing.operacion === 'venta' ? 'Venta' : 'Arriendo'} · Puntuación{' '}
              {Number(listing.score).toFixed(1)}
            </span>
            <h3 className="mt-1.5 font-serif text-xl font-bold text-ink">{listing.barrio}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
              <MapPin className="h-3.5 w-3.5" />
              {listing.direccion !== 'No publicada' ? listing.direccion : `Zona ${listing.zona}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stoneLine bg-white p-1.5 text-stone-500 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm">
          {listing.fotos?.[0] && (
            <img
              src={listing.fotos[0]}
              alt={listing.barrio}
              className="h-44 w-full rounded-xl object-cover"
            />
          )}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-stoneLine bg-ivory/70 p-3.5 text-xs">
            <div>
              <p className="text-stone-500">Precio</p>
              <p className="font-serif text-base font-bold text-ink">
                {listing.operacion === 'venta'
                  ? formatCOP(listing.precioVenta)
                  : `${formatCOP(listing.totalMensual)}/mes`}
              </p>
            </div>
            <div>
              <p className="text-stone-500">Valor por m²</p>
              <p className="font-serif text-base font-bold text-ink">
                {formatCOP(listing.costoM2)}/m²
              </p>
            </div>
            <div>
              <p className="text-stone-500">Espacio</p>
              <p className="font-semibold text-ink">
                {listing.area} m² · {listing.hab} hab · {listing.banos} baños · {listing.garajes} gar.
              </p>
            </div>
            <div>
              <p className="text-stone-500">Estrato y zona</p>
              <p className="font-semibold text-ink">
                Estrato {listing.estrato} · Zona {listing.zona}
              </p>
            </div>
          </div>

          {listing.etiquetasConfort?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {listing.etiquetasConfort.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-stoneLine bg-ivory px-2.5 py-1 text-xs font-medium text-stone-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onToggleFavorite(listing, isFav ? '' : 'Nos gusta')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                isFav
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-stoneLine bg-white text-ink hover:bg-stone-50'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-rose-600' : ''}`} />
              {isFav ? 'En Favoritos' : 'Guardar en Favoritos'}
            </button>

            <div className="flex flex-wrap gap-2">
              {onOpenDecision && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDecision(listing);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-sage px-3.5 py-2 text-xs font-bold text-white hover:bg-sage/90"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Analizar y Ofertar
                </button>
              )}
              {streetViewUrl && (
                <a
                  href={streetViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-stoneLine px-3 py-2 text-xs font-semibold text-ink hover:bg-stone-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Street View
                </a>
              )}
              {listing.enlaces?.[0] && (
                <a
                  href={listing.enlaces[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-stoneLine bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-stone-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver anuncio
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
