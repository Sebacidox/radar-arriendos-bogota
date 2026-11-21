import React from 'react';
import {
  Building2,
  Heart,
  Home,
  MapPin,
  BarChart3,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react';

const TABS = [
  { id: 'arriendos', label: 'Arriendos', icon: Home },
  { id: 'ventas', label: 'Ventas', icon: Building2 },
  { id: 'favoritos', label: 'Favoritos', icon: Heart },
  { id: 'mapa', label: 'Mapa', icon: MapPin },
  { id: 'informes', label: 'Informes', icon: BarChart3 },
  { id: 'mejoras', label: 'Mejoras', icon: MessageSquarePlus },
];

export default function Header({
  activeTab,
  onTabChange,
  lastUpdated,
  loading,
  onRefresh,
  largeText,
  onToggleLargeText,
  favoritesCount,
  pendingMejorasCount = 0,
}) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-stoneLine bg-ivory/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sage">
              Bogotá Norte · Calle 100 a 153
            </p>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Radar Inmobiliario Familiar
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lastUpdated && (
              <span className="inline-flex items-center rounded-full border border-stoneLine bg-white px-3 py-1.5 text-xs font-medium text-stone-600">
                Actualizado: <strong className="ml-1 text-ink">{lastUpdated}</strong>
              </span>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="Recargar datos desde Google Sheets"
              className="inline-flex items-center gap-1.5 rounded-full border border-stoneLine bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-sage/40 hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sage' : ''}`} />
              <span>Recargar</span>
            </button>

            <button
              type="button"
              onClick={onToggleLargeText}
              aria-pressed={largeText}
              title="Alternar tamaño de letra estándar o grande (+20%)"
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                largeText
                  ? 'border-sage bg-sage text-white'
                  : 'border-stoneLine bg-white text-ink hover:border-sage/40'
              }`}
            >
              <span className="opacity-80">A</span>
              <span>/</span>
              <span className="text-sm">A+</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Secciones principales"
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-sage text-white shadow-sm'
                    : 'border border-stoneLine bg-white text-stone-700 hover:border-sage/40 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.id === 'favoritos' && favoritesCount > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-sage/10 text-sage'
                    }`}
                  >
                    {favoritesCount}
                  </span>
                )}
                {tab.id === 'mejoras' && pendingMejorasCount > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {pendingMejorasCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
