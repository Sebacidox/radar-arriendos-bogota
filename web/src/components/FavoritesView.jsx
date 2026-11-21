import React, { useEffect, useState } from 'react';
import {
  Printer,
  Save,
  Heart,
  Phone,
  ExternalLink,
  Eye,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  CHECKLIST_ITEMS,
  buildStreetViewUrl,
  formatCOP,
} from '../utils/formatters';

export default function FavoritesView({
  favorites,
  onSaveVisitDetails,
  onSetEstadoVisita,
  savingId,
}) {
  if (favorites.length === 0) {
    return (
      <div className="rounded-2xl border border-stoneLine bg-white p-10 text-center shadow-sm">
        <Heart className="mx-auto mb-3 h-10 w-10 text-stone-300" />
        <h2 className="font-serif text-xl font-bold text-ink">
          Aún no hay apartamentos en Favoritos
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
          Marca cualquier inmueble en <strong>Arriendos</strong> o <strong>Ventas</strong>{' '}
          como <strong>Nos gusta</strong> o <strong>Visita</strong> para preparar aquí tu
          checklist presencial y notas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 rounded-2xl border border-stoneLine bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink">
            Modo Visita Presencial ({favorites.length})
          </h2>
          <p className="mt-0.5 text-sm text-stone-600">
            Marca los 5 puntos clave en cada visita y guarda tus notas directamente en Google Sheets.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sage/90"
        >
          <Printer className="h-4 w-4" />
          <span>Imprimir / Guardar PDF</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {favorites.map((item) => (
          <FavoriteVisitCard
            key={item.id}
            listing={item}
            onSaveVisitDetails={onSaveVisitDetails}
            onSetEstadoVisita={onSetEstadoVisita}
            isSaving={savingId === item.id}
          />
        ))}
      </div>
    </div>
  );
}

function FavoriteVisitCard({
  listing,
  onSaveVisitDetails,
  onSetEstadoVisita,
  isSaving,
}) {
  const [notes, setNotes] = useState(listing.notasPersonales || '');
  const [checklist, setChecklist] = useState(listing.checklistVisita);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setNotes(listing.notasPersonales || '');
    setChecklist(listing.checklistVisita);
  }, [listing.notasPersonales, listing.checklistVisita]);

  const toggleCheck = (key) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
    setSavedNotice(false);
  };

  const completedCount = CHECKLIST_ITEMS.filter((c) => checklist[c.key]).length;
  const streetViewUrl = buildStreetViewUrl(listing.lat, listing.lng);

  const handleSave = async () => {
    const ok = await onSaveVisitDetails(listing, notes, checklist);
    if (ok) {
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    }
  };

  return (
    <article className="print-card flex flex-col rounded-2xl border border-stoneLine bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stoneLine pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage/10 px-2.5 py-0.5 text-xs font-bold text-sage">
              {listing.operacion === 'venta' ? 'Venta' : 'Arriendo'}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                listing.estadoVisita === 'Agendar visita'
                  ? 'bg-emerald-100 text-sage'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {listing.estadoVisita === 'Agendar visita' ? (
                <Phone className="h-3 w-3" />
              ) : (
                <Heart className="h-3 w-3 fill-rose-600" />
              )}
              {listing.estadoVisita}
            </span>
            <span className="text-xs font-semibold text-stone-500">
              Puntuación: {Number(listing.score).toFixed(1)}/10
            </span>
          </div>

          <h3 className="mt-2 font-serif text-lg font-bold text-ink">
            {listing.barrio} ·{' '}
            {listing.operacion === 'venta'
              ? formatCOP(listing.precioVenta)
              : `${formatCOP(listing.totalMensual)}/mes`}
          </h3>
          <p className="text-xs text-stone-600">
            {listing.direccion !== 'No publicada' ? listing.direccion : `Zona ${listing.zona}`} ·{' '}
            {listing.area} m² · {listing.hab} hab · {listing.banos} baños · {listing.garajes} gar. · Estrato{' '}
            {listing.estrato}
          </p>
        </div>

        <div className="no-print flex items-center gap-2">
          {streetViewUrl && (
            <a
              href={streetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-stoneLine px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-stone-50"
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
              className="inline-flex items-center gap-1 rounded-lg border border-stoneLine px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-stone-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Portal
            </a>
          )}
        </div>
      </div>

      {/* Checklist de 5 puntos */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Checklist de visita presencial
          </h4>
          <span className="text-xs font-semibold text-sage">
            {completedCount} / {CHECKLIST_ITEMS.length} listos
          </span>
        </div>

        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const checked = Boolean(checklist[item.key]);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => toggleCheck(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs transition ${
                    checked
                      ? 'border-emerald-200 bg-emerald-50/70 text-sage font-semibold'
                      : 'border-stoneLine bg-ivory/60 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-sage" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-stone-400" />
                  )}
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Notas personales */}
      <div className="mt-4">
        <label
          htmlFor={`notes-${listing.id}`}
          className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-600"
        >
          Notas personales de la visita
        </label>
        <textarea
          id={`notes-${listing.id}`}
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSavedNotice(false);
          }}
          placeholder="Ej. Portería amable, buena luz en la sala, preguntar si aceptan mascota..."
          className="w-full rounded-xl border border-stoneLine bg-ivory p-3 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
        />
      </div>

      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onSetEstadoVisita(
                listing,
                listing.estadoVisita === 'Agendar visita' ? 'Nos gusta' : 'Agendar visita'
              )
            }
            className="rounded-xl border border-stoneLine px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            {listing.estadoVisita === 'Agendar visita'
              ? 'Pasar a Nos gusta'
              : 'Marcar para Visita'}
          </button>
          <button
            type="button"
            onClick={() => onSetEstadoVisita(listing, '')}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-ink"
          >
            Quitar
          </button>
        </div>

        <div className="flex items-center gap-2">
          {savedNotice && (
            <span className="text-xs font-semibold text-sage">¡Guardado!</span>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sage/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Guardando...' : 'Guardar en Sheets'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
