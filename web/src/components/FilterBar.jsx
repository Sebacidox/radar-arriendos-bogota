import React from 'react';
import { Search, Sparkles, Compass, Sun, UtensilsCrossed, RotateCcw } from 'lucide-react';

export default function FilterBar({
  filters,
  onChange,
  totalCount,
  filteredCount,
  operacion,
}) {
  const toggleFlag = (key) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  const hasActiveFilters =
    filters.onlyNew ||
    filters.onlyOriental ||
    filters.onlyBalcon ||
    filters.onlyOpenKitchen ||
    filters.search.trim() !== '';

  return (
    <section className="no-print mb-6 rounded-2xl border border-stoneLine bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por barrio o dirección (ej. Cedritos, Contador, Colina)..."
            className="w-full rounded-xl border border-stoneLine bg-ivory py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={filters.onlyNew}
            onClick={() => toggleFlag('onlyNew')}
            icon={Sparkles}
            label="Solo nuevos"
          />
          <FilterChip
            active={filters.onlyOriental}
            onClick={() => toggleFlag('onlyOriental')}
            icon={Compass}
            label="Zona Oriental"
          />
          <FilterChip
            active={filters.onlyBalcon}
            onClick={() => toggleFlag('onlyBalcon')}
            icon={Sun}
            label="Con balcón"
          />
          <FilterChip
            active={filters.onlyOpenKitchen}
            onClick={() => toggleFlag('onlyOpenKitchen')}
            icon={UtensilsCrossed}
            label="Cocina abierta"
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  search: '',
                  onlyNew: false,
                  onlyOriental: false,
                  onlyBalcon: false,
                  onlyOpenKitchen: false,
                })
              }
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stoneLine/70 pt-3 text-xs text-stone-600">
        <span>
          Mostrando <strong className="text-ink">{filteredCount}</strong> de{' '}
          <strong className="text-ink">{totalCount}</strong>{' '}
          {operacion === 'venta' ? 'apartamentos en venta' : 'apartamentos en arriendo'}
          {' '}con ascensor y garaje
        </span>
        <span className="text-stone-500">Ordenados de mayor a menor puntuación</span>
      </div>
    </section>
  );
}

function FilterChip({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        active
          ? 'border-sage bg-sage text-white shadow-sm'
          : 'border-stoneLine bg-ivory text-stone-700 hover:border-sage/40 hover:bg-stone-100'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
