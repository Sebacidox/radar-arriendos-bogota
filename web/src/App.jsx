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
import DecisionCenterModal from './components/DecisionCenterModal';
import ManualListingModal from './components/ManualListingModal';
import {
  deleteManualListingInSheets,
  fetchRadarData,
  loadLocalManualListings,
  saveLocalManualListings,
  saveManualListingInSheets,
  submitMejora,
  updateListingInSheets,
} from './services/api';
import {
  isListingUnavailable,
  mergeChecklistAndExtras,
} from './utils/formatters';
import { BARRIOS_DATA_META } from './utils/valuationEngine';

function diffDaysFromIso(isoDate) {
  if (!isoDate) return 0;
  const parsed = Date.parse(String(isoDate).slice(0, 10));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function enrichAndMergeData(raw) {
  const histArrMap = new Map(
    (raw.historicoCompleto || []).map((h) => [h.fingerprint, h])
  );
  const histVenMap = new Map(
    (raw.historicoVentas || []).map((h) => [h.fingerprint, h])
  );

  const enrichItem = (item, histMap) => {
    const hist = histMap.get(item.fingerprint);
    const firstSeenAt = hist?.fechaPrimera || item.firstSeenAt || item.fechaDeteccion || '';
    const dias = Math.max(
      Number(item.diasEnMercado) || 0,
      Number(hist?.diasEnMercado) || 0,
      diffDaysFromIso(firstSeenAt)
    );
    let priceHistory = item.priceHistory || [];
    const currentAsk = item.operacion === 'venta' ? item.precioVenta : item.canon;
    if (priceHistory.length === 0 && hist && Number(hist.ahorroCop) > 0 && currentAsk > 0) {
      priceHistory = [
        {
          date: firstSeenAt || item.fechaDeteccion,
          price: currentAsk + Number(hist.ahorroCop),
          admin: item.admin,
          source: item.fuente || 'Radar',
        },
        {
          date: hist.fechaUltima || item.fechaDeteccion,
          price: currentAsk,
          admin: item.admin,
          source: item.fuente || 'Radar',
        },
      ];
    }
    return {
      ...item,
      origen: item.origen || 'radar',
      firstSeenAt,
      diasEnMercado: dias,
      priceHistory,
    };
  };

  const localManual = loadLocalManualListings();
  const remoteManual = raw.misAvisos || [];
  const mergedManualMap = new Map();
  for (const item of remoteManual) {
    mergedManualMap.set(item.fingerprint, item);
  }
  for (const localItem of localManual) {
    const remote = mergedManualMap.get(localItem.fingerprint);
    if (!remote) {
      mergedManualMap.set(localItem.fingerprint, localItem);
    } else {
      mergedManualMap.set(localItem.fingerprint, {
        ...remote,
        fotos: remote.fotos?.length ? remote.fotos : localItem.fotos || [],
        meta: { ...(localItem.meta || {}), ...(remote.meta || {}) },
        priceHistory: remote.priceHistory?.length
          ? remote.priceHistory
          : localItem.priceHistory || [],
        legalShield: remote.legalShield || localItem.legalShield || null,
      });
    }
  }

  const manualAll = Array.from(mergedManualMap.values());
  const manualArr = manualAll.filter((m) => m.operacion !== 'venta');
  const manualVen = manualAll.filter((m) => m.operacion === 'venta');

  return {
    ...raw,
    arriendos: [
      ...manualArr,
      ...(raw.arriendos || []).map((item) => enrichItem(item, histArrMap)),
    ],
    ventas: [
      ...manualVen,
      ...(raw.ventas || []).map((item) => enrichItem(item, histVenMap)),
    ],
    ajustesArriendos: (raw.ajustesArriendos || []).map((item) =>
      enrichItem(item, histArrMap)
    ),
    ajustesVentas: (raw.ajustesVentas || []).map((item) =>
      enrichItem(item, histVenMap)
    ),
  };
}

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
    ajustesArriendos: [],
    ajustesVentas: [],
    resumenBarrios: [],
    resumenBarriosVentas: [],
    resumenAjustesArriendos: [],
    resumenAjustesVentas: [],
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
    arriendo_exactos: makeDefaultFilters(),
    arriendo_ajustes: makeDefaultFilters(),
    venta_exactos: makeDefaultFilters(),
    venta_ajustes: makeDefaultFilters(),
  });
  const [sectionByOp, setSectionByOp] = useState({
    arriendo: 'exactos',
    venta: 'exactos',
  });
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [decisionListingId, setDecisionListingId] = useState('');
  const [manualModalOpen, setManualModalOpen] = useState(false);

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
      setData(enrichAndMergeData(result));
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
    setData((prev) => {
      const mapFn = (item) => (item.id === targetId ? { ...item, ...patch } : item);
      const nextArriendos = prev.arriendos.map(mapFn);
      const nextVentas = prev.ventas.map(mapFn);
      const nextAjustesArr = (prev.ajustesArriendos || []).map(mapFn);
      const nextAjustesVta = (prev.ajustesVentas || []).map(mapFn);
      const updated = [
        ...nextArriendos,
        ...nextVentas,
        ...nextAjustesArr,
        ...nextAjustesVta,
      ].find((x) => x.id === targetId);
      if (updated?.origen === 'manual') {
        const localAll = loadLocalManualListings();
        const exists = localAll.some(
          (m) => m.id === updated.id || m.fingerprint === updated.fingerprint
        );
        const nextLocal = exists
          ? localAll.map((m) =>
              m.id === updated.id || m.fingerprint === updated.fingerprint ? updated : m
            )
          : [updated, ...localAll];
        saveLocalManualListings(nextLocal);
      }
      return {
        ...prev,
        arriendos: nextArriendos,
        ventas: nextVentas,
        ajustesArriendos: nextAjustesArr,
        ajustesVentas: nextAjustesVta,
      };
    });
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
        if (listing.origen === 'manual') {
          const label = nextEstado ? `Marcado como "${nextEstado}" (en este dispositivo)` : 'Estado limpiado';
          showToast(`${listing.barrio}: ${label}`, 'success');
        } else {
          patchLocalListing(listing.id, { estadoVisita: prevEstado });
          showToast(err?.message || 'Error guardando en Google Sheets', 'error');
        }
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
      const serializedChecklist = mergeChecklistAndExtras(checklistVisita, {
        legalShield: listing.legalShield,
        priceHistory: listing.priceHistory,
        meta: listing.meta,
      });

      patchLocalListing(listing.id, { notasPersonales, checklistVisita });
      setSavingId(listing.id);
      try {
        await updateListingInSheets({
          sheetName: listing.sheetName,
          fingerprint: listing.fingerprint,
          notasPersonales,
          checklistVisita: serializedChecklist,
        });
        showToast(`Notas y checklist guardados en ${listing.barrio}`, 'success');
        return true;
      } catch (err) {
        if (listing.origen === 'manual') {
          showToast(`Notas guardadas localmente en ${listing.barrio}`, 'success');
          return true;
        }
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

  const handleSaveListingExtras = useCallback(
    async (listing, nextExtras) => {
      const patch = {
        legalShield: nextExtras.legalShield,
        priceHistory: nextExtras.priceHistory,
        meta: nextExtras.meta,
      };

      const hist = nextExtras.priceHistory;
      if (listing.origen === 'manual' && Array.isArray(hist) && hist.length > 0) {
        const latestPrice = Number(hist[hist.length - 1]?.price) || 0;
        if (latestPrice > 0) {
          if (listing.operacion === 'venta') {
            patch.precioVenta = latestPrice;
            patch.totalMensual = latestPrice;
            patch.costoM2 = listing.area > 0 ? Math.round(latestPrice / listing.area) : 0;
          } else {
            patch.canon = latestPrice;
            patch.totalMensual = latestPrice + (listing.admin || 0);
            patch.costoM2 = listing.area > 0 ? Math.round(patch.totalMensual / listing.area) : 0;
          }
        }
      }

      const prevState = {
        legalShield: listing.legalShield,
        priceHistory: listing.priceHistory,
        meta: listing.meta,
      };

      patchLocalListing(listing.id, patch);
      setSavingId(listing.id);
      try {
        const serialized = mergeChecklistAndExtras(listing.checklistVisita, nextExtras);
        await updateListingInSheets({
          sheetName: listing.sheetName,
          fingerprint: listing.fingerprint,
          checklistVisita: serialized,
        });
        showToast(`Análisis y escudo guardados en ${listing.barrio}`, 'success');
        return true;
      } catch (err) {
        if (listing.origen === 'manual') {
          showToast(`Ajustes guardados localmente en ${listing.barrio}`, 'success');
          return true;
        }
        patchLocalListing(listing.id, prevState);
        showToast(err?.message || 'No se pudieron guardar los cambios en Sheets', 'error');
        return false;
      } finally {
        setSavingId('');
      }
    },
    [patchLocalListing, showToast]
  );

  const handleAddManualListing = useCallback(
    async (newListing) => {
      const prevLocal = loadLocalManualListings();
      saveLocalManualListings([newListing, ...prevLocal]);

      setData((prev) => ({
        ...prev,
        arriendos:
          newListing.operacion === 'venta'
            ? prev.arriendos
            : [newListing, ...prev.arriendos],
        ventas:
          newListing.operacion === 'venta' ? [newListing, ...prev.ventas] : prev.ventas,
      }));

      setManualModalOpen(false);
      setActiveTab(newListing.operacion === 'venta' ? 'ventas' : 'arriendos');
      setDecisionListingId(newListing.id);

      try {
        await saveManualListingInSheets(newListing);
        showToast(`Aviso propio en ${newListing.barrio} guardado en Sheets`, 'success');
      } catch {
        showToast(`Aviso en ${newListing.barrio} evaluado y guardado en este dispositivo`, 'success');
      }
    },
    [showToast]
  );

  const handleDeleteManualListing = useCallback(
    async (listing) => {
      const nextLocal = loadLocalManualListings().filter(
        (m) => m.id !== listing.id && m.fingerprint !== listing.fingerprint
      );
      saveLocalManualListings(nextLocal);

      setData((prev) => ({
        ...prev,
        arriendos: prev.arriendos.filter((x) => x.id !== listing.id),
        ventas: prev.ventas.filter((x) => x.id !== listing.id),
      }));
      if (decisionListingId === listing.id) setDecisionListingId('');
      showToast(`Aviso en ${listing.barrio} eliminado`, 'success');

      try {
        await deleteManualListingInSheets(listing.fingerprint);
      } catch {
        // Ignorar si Apps Script aún no tiene la acción deleteManualListing
      }
    },
    [decisionListingId, showToast]
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
    () => [
      ...data.arriendos,
      ...data.ventas,
      ...(data.ajustesArriendos || []),
      ...(data.ajustesVentas || []),
    ],
    [data.arriendos, data.ventas, data.ajustesArriendos, data.ajustesVentas]
  );

  const decisionListing = useMemo(
    () => allListings.find((item) => item.id === decisionListingId) || null,
    [allListings, decisionListingId]
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
  const currentSection = sectionByOp[currentOp] || 'exactos';
  const isAjustesSection = currentSection === 'ajustes';
  const filterKey = `${currentOp}_${currentSection}`;
  const currentFilters = filtersByOp[filterKey] || makeDefaultFilters();

  const setCurrentSection = useCallback(
    (nextSection) => {
      setSectionByOp((prev) => ({ ...prev, [currentOp]: nextSection }));
    },
    [currentOp]
  );
  const setCurrentFilters = useCallback(
    (nextFilters) => {
      setFiltersByOp((prev) => ({ ...prev, [filterKey]: nextFilters }));
    },
    [filterKey]
  );
  const resetCurrentFilters = useCallback(() => {
    setFiltersByOp((prev) => ({ ...prev, [filterKey]: makeDefaultFilters() }));
  }, [filterKey]);

  const exactosList = activeTab === 'ventas' ? data.ventas : data.arriendos;
  const ajustesList =
    activeTab === 'ventas' ? data.ajustesVentas || [] : data.ajustesArriendos || [];
  const currentList = isAjustesSection ? ajustesList : exactosList;

  const currentResumen =
    activeTab === 'ventas'
      ? isAjustesSection && (data.resumenAjustesVentas || []).length > 0
        ? data.resumenAjustesVentas
        : data.resumenBarriosVentas
      : isAjustesSection && (data.resumenAjustesArriendos || []).length > 0
        ? data.resumenAjustesArriendos
        : data.resumenBarrios;

  const exactosActiveCount = useMemo(
    () =>
      exactosList.filter(
        (x) => x.estadoVisita !== 'Descartado' && !isListingUnavailable(x)
      ).length,
    [exactosList]
  );
  const ajustesActiveCount = useMemo(
    () =>
      ajustesList.filter(
        (x) => x.estadoVisita !== 'Descartado' && !isListingUnavailable(x)
      ).length,
    [ajustesList]
  );

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
          return (
            (b.origen === 'manual' ? 1 : 0) - (a.origen === 'manual' ? 1 : 0) ||
            b.score - a.score ||
            getPrice(a) - getPrice(b)
          );
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
            {/* Selector Opción A: Requisitos exactos vs Ajustes razonables */}
            <div className="no-print mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex w-full rounded-2xl border border-stone-200/80 bg-white p-1 shadow-[0_2px_10px_-4px_rgba(28,25,23,0.05)] sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCurrentSection('exactos')}
                  className={`flex-1 min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold transition sm:flex-initial ${
                    !isAjustesSection
                      ? 'bg-sage text-white shadow-sm'
                      : 'text-stone-700 hover:bg-ivory hover:text-ink'
                  }`}
                >
                  Cumplen 100% ({exactosActiveCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentSection('ajustes')}
                  className={`flex-1 min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold transition sm:flex-initial ${
                    isAjustesSection
                      ? 'bg-amberWarm text-white shadow-sm'
                      : 'text-stone-700 hover:bg-ivory hover:text-ink'
                  }`}
                >
                  Ajustes razonables ({ajustesActiveCount})
                </button>
              </div>

              {isAjustesSection && (
                <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2 text-xs text-stone-700">
                  Márgenes flexibles: <strong>65–69 m²</strong>, hasta{' '}
                  <strong>{currentOp === 'venta' ? '$850M' : '$4.2M'}</strong> o hasta{' '}
                  <strong>9 km</strong> de Gloria, Ángela y Beatriz (máx. 2 ajustes; siempre con ascensor, garaje, 2–3 hab, ≥2 baños y estrato 3–5).
                </p>
              )}
            </div>

            <FilterBar
              filters={currentFilters}
              onChange={setCurrentFilters}
              onReset={resetCurrentFilters}
              totalCount={currentList.filter((x) => !isListingUnavailable(x)).length}
              filteredCount={visibleListings.length}
              operacion={currentOp}
              isAjustes={isAjustesSection}
              onOpenManualModal={() => setManualModalOpen(true)}
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
                    onOpenDecision={(x) => setDecisionListingId(x.id)}
                    onDeleteManual={handleDeleteManualListing}
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
                        onOpenDecision={(x) => setDecisionListingId(x.id)}
                        onDeleteManual={handleDeleteManualListing}
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
                        onOpenDecision={(x) => setDecisionListingId(x.id)}
                        onDeleteManual={handleDeleteManualListing}
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
            onOpenDecision={(x) => setDecisionListingId(x.id)}
          />
        ) : activeTab === 'mapa' ? (
          <MapView
            arriendos={data.arriendos}
            ventas={data.ventas}
            ajustesArriendos={data.ajustesArriendos}
            ajustesVentas={data.ajustesVentas}
          />
        ) : activeTab === 'informes' ? (
          <ReportsView
            arriendos={data.arriendos}
            ventas={data.ventas}
            ajustesArriendos={data.ajustesArriendos}
            ajustesVentas={data.ajustesVentas}
            resumenBarrios={data.resumenBarrios}
            resumenBarriosVentas={data.resumenBarriosVentas}
            resumenAjustesArriendos={data.resumenAjustesArriendos}
            resumenAjustesVentas={data.resumenAjustesVentas}
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

      <footer className="no-print mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-[11px] text-stone-500 sm:px-6 lg:px-8">
        {BARRIOS_DATA_META.attribution}
      </footer>

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
          onOpenDecision={(x) => setDecisionListingId(x.id)}
          onToggleFavorite={(listing, nextEstado) => {
            handleSetEstadoVisita(listing, nextEstado);
            setSelectedProperty((curr) =>
              curr ? { ...curr, estadoVisita: nextEstado } : null
            );
          }}
        />
      )}

      {decisionListing && (
        <DecisionCenterModal
          listing={decisionListing}
          resumenList={
            decisionListing.operacion === 'venta'
              ? [...(data.resumenBarriosVentas || []), ...(data.resumenAjustesVentas || [])]
              : [...(data.resumenBarrios || []), ...(data.resumenAjustesArriendos || [])]
          }
          allListings={
            decisionListing.operacion === 'venta'
              ? [...data.ventas, ...(data.ajustesVentas || [])]
              : [...data.arriendos, ...(data.ajustesArriendos || [])]
          }
          onClose={() => setDecisionListingId('')}
          onSaveListingExtras={handleSaveListingExtras}
          saving={savingId === decisionListing.id}
        />
      )}

      {manualModalOpen && (
        <ManualListingModal
          defaultOperacion={currentOp}
          onClose={() => setManualModalOpen(false)}
          onSaveManualListing={handleAddManualListing}
        />
      )}
    </div>
  );
}
