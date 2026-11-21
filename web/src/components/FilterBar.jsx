import React from 'react';
import {
  Search,
  Sparkles,
  Compass,
  Sun,
  UtensilsCrossed,
  RotateCcw,
  ArrowUpDown,
  PlusCircle,
} from 'lucide-react';

const SORT_LABELS = {
  score_desc: 'Mayor calificación primero',
  score_asc: 'Menor calificación primero',
  price_asc: 'Precio: menor a mayor',
  price_desc: 'Precio: mayor a menor',
  area_desc: 'Metraje: mayor a menor',
  area_asc: 'Metraje: menor a mayor',
};

const PRICE_OPTIONS_ARRIENDO = [
  { value: '', label: 'Cualquier precio (hasta $3.5M)' },
  { value: '2800000', label: 'Hasta $2.800.000' },
  { value: '3000000', label: 'Hasta $3.000.000' },
  { value: '3200000', label: 'Hasta $3.200.000' },
  { value: '3500000', label: 'Hasta $3.500.000' },
];

const PRICE_OPTIONS_VENTA = [
  { value: '', label: 'Cualquier precio (hasta $800M)' },
  { value: '500000000', label: 'Hasta $500 millones' },
  { value: '600000000', label: 'Hasta $600 millones' },
  { value: '700000000', label: 'Hasta $700 millones' },
  { value: '800000000', label: 'Hasta $800 millones' },
];

const AREA_OPTIONS = [
  { value: '', label: 'Cualquier metraje (> 70 m²)' },
  { value: '75', label: 'Desde 75 m²' },
  { value: '80', label: 'Desde 80 m²' },
  { value: '90', label: 'Desde 90 m²' },
  { value: '100', label: 'Desde 100 m²' },
];

const SCORE_OPTIONS = [
  { value: '', label: 'Todas las calificaciones' },
  { value: '6', label: '6.0 o más (Buena)' },
  { value: '7.5', label: '7.5 o más (Muy buena)' },
  { value: '9', label: '9.0 o más (Excelente)' },
];

export default function FilterBar({
  filters,
  onChange,
  onReset,
  totalCount,
  filteredCount,
  operacion,
  onOpenManualModal,
}) {
  const toggleFlag = (key) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  const priceOptions =
    operacion === 'venta' ? PRICE_OPTIONS_VENTA : PRICE_OPTIONS_ARRIENDO;

  const hasActiveFilters =
    filters.onlyNew ||
    filters.onlyOriental ||
    filters.onlyBalcon ||
    filters.onlyOpenKitchen ||
    filters.search.trim() !== '' ||
    filters.maxPrice !== '' ||
    filters.minArea !== '' ||
    filters.minScore !== '' ||
    filters.sortBy !== 'score_desc';

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
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}

          {onOpenManualModal && (
            <button
              type="button"
              onClick={onOpenManualModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sage bg-sage/10 px-3.5 py-2 text-xs font-bold text-sage transition hover:bg-sage hover:text-white"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>+ Evaluar aviso propio</span>
            </button>
          )}
        </div>
      </div>

      {/* Controles claros de ordenamiento y filtros por precio, metraje y calificación */}
      <div className="mt-4 grid gap-3 border-t border-stoneLine/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="filter-sort"
            className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-stone-500"
          >
            <ArrowUpDown className="h-3 w-3 text-sage" />
            Ordenar por
          </label>
          <select
            id="filter-sort"
            value={filters.sortBy}
            onChange={(e) => onChange({ ...filters, sortBy: e.target.value })}
            className="w-full rounded-xl border border-stoneLine bg-ivory px-3 py-2 text-xs font-semibold text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
          >
            {Object.entries(SORT_LABELS).map(([val, text]) => (
              <option key={val} value={val}>
                {text}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-max-price"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-stone-500"
          >
            Precio máximo
          </label>
          <select
            id="filter-max-price"
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className="w-full rounded-xl border border-stoneLine bg-ivory px-3 py-2 text-xs font-semibold text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
          >
            {priceOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-min-area"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-stone-500"
          >
            Metraje mínimo
          </label>
          <select
            id="filter-min-area"
            value={filters.minArea}
            onChange={(e) => onChange({ ...filters, minArea: e.target.value })}
            className="w-full rounded-xl border border-stoneLine bg-ivory px-3 py-2 text-xs font-semibold text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
          >
            {AREA_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-min-score"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-stone-500"
          >
            Calificación mínima
          </label>
          <select
            id="filter-min-score"
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: e.target.value })}
            className="w-full rounded-xl border border-stoneLine bg-ivory px-3 py-2 text-xs font-semibold text-ink focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/15"
          >
            {SCORE_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stoneLine/70 pt-3 text-xs text-stone-600">
        <span>
          Mostrando <strong className="text-ink">{filteredCount}</strong> de{' '}
          <strong className="text-ink">{totalCount}</strong>{' '}
          {operacion === 'venta' ? 'apartamentos en venta' : 'apartamentos en arriendo'}{' '}
          con ascensor y garaje
        </span>
        <span className="font-medium text-stone-500">
          Orden: {SORT_LABELS[filters.sortBy] || SORT_LABELS.score_desc}
        </span>
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
