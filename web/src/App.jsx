import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import PropertyCard from './components/PropertyCard';
import CompareModal from './components/CompareModal';
import FavoritesView from './components/FavoritesView';
import MapView from './components/MapView';
import ReportsView from './components/ReportsView';
import MejorasView from './components/MejorasView';
import PropertyDetailModal from './components/PropertyDetailModal';
import { fetchRadarData, submitMejora, updateListingInSheets } from './services/api';
import { isListingUnavailable } from './utils/formatters';

function makeDefaultFilters() {
  return {
    search: '',
    onlyNew: false,
    onlyOriental: false,
    onlyBalcon: false,
    onlyOpenKitchen: false,
    sortBy: 'score_desc',
    maxPrice: '',
    minArea: '',
    minScore: '',
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('arriendos');
  const [data, setData] = useState({
    lastUpdated: '',
    arriendos: [],
    ventas: [],
    resumenBarrios: [],
    resumenBarriosVentas: [],
    historicoCompleto: [],
    historicoVentas: [],
    mejoras: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [toast, setToast] = useState(null);

  const [largeText, setLargeText] = useState(() => {
    try {
      return localStorage.getItem('radar_large_text') === 'true';
    } catch {
      return false;
    }
  });

  const [filtersByOp, setFiltersByOp] = useState({
    arriendo: makeDefaultFilters(),
    venta: makeDefaultFilters(),
  });
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    if (largeText) root.classList.add('text-large');
    else root.classList.remove('text-large');
    try {
      localStorage.setItem('radar_large_text', String(largeText));
    } catch {
      // Ignorar si localStorage está restringido
    }
  }, [largeText]);

  const showToast = useCallback((message, tone = 'success') => {
    setToast({ message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchRadarData();
      setData(result);
    } catch (err) {
      setError(err?.message || 'Error al cargar los datos de Google Sheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const patchLocalListing = useCallback((targetId, patch) => {
    setData((prev) => ({
      ...prev,
      arriendos: prev.arriendos.map((item) =>
        item.id === targetId ? { ...item, ...patch } : item
      ),
      ventas: prev.ventas.map((item) =>
        item.id === targetId ? { ...item, ...patch } : item
      ),
    }));
  }, []);

  const handleSetEstadoVisita = useCallback(
    async (listing, nextEstado) => {
      const prevEstado = listing.estadoVisita;
      patchLocalListing(listing.id, { estadoVisita: nextEstado });
      setSavingId(listing.id);
      try {
        await updateListingInSheets({
          sheetName: listing.sheetName,
          fingerprint: listing.fingerprint,
          estadoVisita: nextEstado,
        });
        const label = nextEstado ? `Marcado como "${nextEstado}"` : 'Estado limpiado';
        showToast(`${listing.barrio}: ${label}`, 'success');
      } catch (err) {
        patchLocalListing(listing.id, { estadoVisita: prevEstado });
        showToast(err?.message || 'Error guardando en Google Sheets', 'error');
      } finally {
        setSavingId('');
      }
    },
    [patchLocalListing, showToast]
  );

  const handleSaveVisitDetails = useCallback(
    async (listing, notasPersonales, checklistVisita) => {
      const prevNotas = listing.notasPersonales;
      const prevChecklist = listing.checklistVisita;
      patchLocalListing(listing.id, { notasPersonales, checklistVisita });
      setSavingId(listing.id);
      try {
        await updateListingInSheets({
          sheetName: listing.sheetName,
          fingerprint: listing.fingerprint,
          notasPersonales,
          checklistVisita,
        });
        showToast(`Notas y checklist guardados en ${listing.barrio}`, 'success');
        return true;
      } catch (err) {
        patchLocalListing(listing.id, {
          notasPersonales: prevNotas,
          checklistVisita: prevChecklist,
        });
        showToast(err?.message || 'No se pudieron guardar las notas', 'error');
        return false;
      } finally {
        setSavingId('');
      }
    },
    [patchLocalListing, showToast]
  );

  const handleToggleCompare = useCallback(
    (listing) => {
      setCompareIds((prev) => {
        if (prev.includes(listing.id)) {
          return prev.filter((id) => id !== listing.id);
        }
        if (prev.length >= 3) {
          showToast('Puedes comparar máximo 3 apartamentos a la vez', 'error');
          return prev;
        }
        return [...prev, listing.id];
      });
    },
    [showToast]
  );

  const handleSubmitMejora = useCallback(
    async ({ autor, tipo, seccion, descripcion }) => {
      const result = await submitMejora({ autor, tipo, seccion, descripcion });
      if (result?.mejora?.descripcion) {
        setData((prev) => ({
          ...prev,
          mejoras: [result.mejora, ...(prev.mejoras || [])],
        }));
      }
      showToast('Mejora enviada correctamente', 'success');
      return result;
    },
    [showToast]
  );

  const pendingMejorasCount = useMemo(
    () =>
      (data.mejoras || []).filter((m) => {
        const est = String(m.estado || 'Pendiente').toLowerCase();
        return est !== 'resuelto' && est !== 'resuelta' && est !== 'listo';
      }).length,
    [data.mejoras]
  );

  const allListings = useMemo(
    () => [...data.arriendos, ...data.ventas],
    [data.arriendos, data.ventas]
  );

  const compareItems = useMemo(
    () => allListings.filter((item) => compareIds.includes(item.id)),
    [allListings, compareIds]
  );

  const favorites = useMemo(
    () =>
      allListings.filter(
        (item) =>
          item.estadoVisita === 'Nos gusta' || item.estadoVisita === 'Agendar visita'
      ),
    [allListings]
  );

  const currentOp = activeTab === 'ventas' ? 'venta' : 'arriendo';
  const currentFilters = filtersByOp[currentOp];
  const setCurrentFilters = useCallback(
    (nextFilters) => {
      setFiltersByOp((prev) => ({ ...prev, [currentOp]: nextFilters }));
    },
    [currentOp]
  );
  const resetCurrentFilters = useCallback(() => {
    setFiltersByOp((prev) => ({ ...prev, [currentOp]: makeDefaultFilters() }));
  }, [currentOp]);

  const currentList = activeTab === 'ventas' ? data.ventas : data.arriendos;
  const currentResumen =
    activeTab === 'ventas' ? data.resumenBarriosVentas : data.resumenBarrios;

  const { visibleListings, unavailableListings, discardedListings } = useMemo(() => {
    const q = currentFilters.search.trim().toLowerCase();
    const maxP = currentFilters.maxPrice !== '' ? Number(currentFilters.maxPrice) : null;
    const minA = currentFilters.minArea !== '' ? Number(currentFilters.minArea) : null;
    const minS = currentFilters.minScore !== '' ? Number(currentFilters.minScore) : null;

    const matchesFilters = (item) => {
      if (currentFilters.onlyNew && !item.estado.toUpperCase().startsWith('NUEVO')) {
        return false;
      }
      if (currentFilters.onlyOriental && item.zona !== 'Oriental') return false;
      if (currentFilters.onlyBalcon && !item.balcon) return false;
      if (currentFilters.onlyOpenKitchen && !item.cocinaAbierta) return false;

      const priceVal = item.operacion === 'venta' ? item.precioVenta : item.totalMensual;
      if (maxP !== null && priceVal > maxP) return false;
      if (minA !== null && item.area < minA) return false;
      if (minS !== null && item.score < minS) return false;

      if (q) {
        const hay = `${item.barrio} ${item.direccion} ${item.zona}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };

    const getPrice = (x) => (x.operacion === 'venta' ? x.precioVenta : x.totalMensual);
    const sortFn = (a, b) => {
      switch (currentFilters.sortBy) {
        case 'score_asc':
          return a.score - b.score || getPrice(a) - getPrice(b);
        case 'price_asc':
          return getPrice(a) - getPrice(b) || b.score - a.score;
        case 'price_desc':
          return getPrice(b) - getPrice(a) || b.score - a.score;
        case 'area_desc':
          return b.area - a.area || b.score - a.score;
        case 'area_asc':
          return a.area - b.area || b.score - a.score;
        case 'score_desc':
        default:
          return b.score - a.score || getPrice(a) - getPrice(b);
      }
    };

    const filtered = currentList.filter(matchesFilters).sort(sortFn);
    return {
      visibleListings: filtered.filter(
        (x) => x.estadoVisita !== 'Descartado' && !isListingUnavailable(x)
      ),
      unavailableListings: filtered.filter(
        (x) => x.estadoVisita !== 'Descartado' && isListingUnavailable(x)
      ),
      discardedListings: filtered.filter((x) => x.estadoVisita === 'Descartado'),
    };
  }, [currentList, currentFilters]);

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        lastUpdated={data.lastUpdated}
        loading={loading}
        onRefresh={loadData}
        largeText={largeText}
        onToggleLargeText={() => setLargeText((v) => !v)}
        favoritesCount={favorites.length}
        pendingMejorasCount={pendingMejorasCount}
      />

      {/* Toast flotante */}
      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50">
          <div
            className={`rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg ${
              toast.tone === 'error' ? 'bg-amberWarm' : 'bg-sage'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Barra flotante de comparador */}
      {compareItems.length > 0 && (
        <div className="no-print fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-stoneLine bg-ink px-4 py-2.5 text-xs text-white shadow-xl">
            <span className="font-semibold">
              {compareItems.length} seleccionado(s) para comparar
            </span>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-3 py-1.5 font-bold text-white hover:bg-sage/90"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Ver comparación
            </button>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-stone-300 underline hover:text-white"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading && data.arriendos.length === 0 && data.ventas.length === 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-96 animate-pulse rounded-2xl border border-stoneLine bg-white p-5"
              >
                <div className="h-44 rounded-xl bg-stone-200" />
                <div className="mt-4 h-5 w-2/3 rounded bg-stone-200" />
                <div className="mt-2 h-4 w-1/2 rounded bg-stone-100" />
                <div className="mt-6 h-20 rounded-xl bg-stone-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amberWarm" />
            <h2 className="font-serif text-xl font-bold text-ink">
              No pudimos cargar los apartamentos
            </h2>
            <p className="mt-1 text-sm text-stone-600">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sage px-4 py-2.5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Intentar de nuevo
            </button>
          </div>
        ) : activeTab === 'arriendos' || activeTab === 'ventas' ? (
          <>
            <FilterBar
              filters={currentFilters}
              onChange={setCurrentFilters}
              onReset={resetCurrentFilters}
              totalCount={currentList.filter((x) => !isListingUnavailable(x)).length}
              filteredCount={visibleListings.length}
              operacion={currentOp}
            />

            {visibleListings.length === 0 ? (
              <div className="rounded-2xl border border-stoneLine bg-white p-10 text-center">
                <p className="font-serif text-lg font-bold text-ink">
                  No hay apartamentos que coincidan con esos filtros
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Prueba desactivando algún filtro para ver más opciones.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {visibleListings.map((item) => (
                  <PropertyCard
                    key={item.id}
                    listing={item}
                    resumenList={currentResumen}
                    allListings={currentList}
                    onSetEstadoVisita={handleSetEstadoVisita}
                    isCompared={compareIds.includes(item.id)}
                    onToggleCompare={handleToggleCompare}
                    savingId={savingId}
                  />
                ))}
              </div>
            )}

            {unavailableListings.length > 0 && (
              <section className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-4">
                <button
                  type="button"
                  onClick={() => setShowUnavailable((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-red-800 hover:text-red-900"
                >
                  <span>Ya no disponibles en el portal ({unavailableListings.length})</span>
                  {showUnavailable ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showUnavailable && (
                  <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {unavailableListings.map((item) => (
                      <PropertyCard
                        key={item.id}
                        listing={item}
                        resumenList={currentResumen}
                        allListings={currentList}
                        onSetEstadoVisita={handleSetEstadoVisita}
                        isCompared={compareIds.includes(item.id)}
                        onToggleCompare={handleToggleCompare}
                        savingId={savingId}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {discardedListings.length > 0 && (
              <section className="mt-10 rounded-2xl border border-stoneLine bg-white/70 p-4">
                <button
                  type="button"
                  onClick={() => setShowDiscarded((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-stone-600 hover:text-ink"
                >
                  <span>Descartados ({discardedListings.length})</span>
                  {showDiscarded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showDiscarded && (
                  <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {discardedListings.map((item) => (
                      <PropertyCard
                        key={item.id}
                        listing={item}
                        resumenList={currentResumen}
                        allListings={currentList}
                        onSetEstadoVisita={handleSetEstadoVisita}
                        isCompared={compareIds.includes(item.id)}
                        onToggleCompare={handleToggleCompare}
                        savingId={savingId}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : activeTab === 'favoritos' ? (
          <FavoritesView
            favorites={favorites}
            onSaveVisitDetails={handleSaveVisitDetails}
            onSetEstadoVisita={handleSetEstadoVisita}
            savingId={savingId}
          />
        ) : activeTab === 'mapa' ? (
          <MapView arriendos={data.arriendos} ventas={data.ventas} />
        ) : activeTab === 'informes' ? (
          <ReportsView
            arriendos={data.arriendos}
            ventas={data.ventas}
            resumenBarrios={data.resumenBarrios}
            resumenBarriosVentas={data.resumenBarriosVentas}
            historicoCompleto={data.historicoCompleto}
            historicoVentas={data.historicoVentas}
            onSelectProperty={setSelectedProperty}
          />
        ) : (
          <MejorasView
            mejoras={data.mejoras}
            onSubmitMejora={handleSubmitMejora}
          />
        )}
      </main>

      {compareOpen && (
        <CompareModal
          items={compareItems}
          onClose={() => setCompareOpen(false)}
          onRemove={(item) =>
            setCompareIds((prev) => prev.filter((id) => id !== item.id))
          }
        />
      )}

      {selectedProperty && (
        <PropertyDetailModal
          listing={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onToggleFavorite={(listing, nextEstado) => {
            handleSetEstadoVisita(listing, nextEstado);
            setSelectedProperty((curr) =>
              curr ? { ...curr, estadoVisita: nextEstado } : null
            );
          }}
        />
      )}
    </div>
  );
}
