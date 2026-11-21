import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from 'recharts';
import { TrendingDown, Clock, CheckCircle2 } from 'lucide-react';
import { formatCOP, formatCompactCOP, isListingUnavailable } from '../utils/formatters';

export default function ReportsView({
  arriendos,
  ventas,
  resumenBarrios,
  resumenBarriosVentas,
  historicoCompleto,
  historicoVentas,
  onSelectProperty,
}) {
  const [mode, setMode] = useState('arriendo');

  const isVenta = mode === 'venta';
  const activeList = useMemo(
    () =>
      (isVenta ? ventas : arriendos).filter(
        (x) => x.estadoVisita !== 'Descartado' && !isListingUnavailable(x)
      ),
    [isVenta, ventas, arriendos]
  );
  const resumenList = isVenta ? resumenBarriosVentas : resumenBarrios;
  const histList = isVenta ? historicoVentas : historicoCompleto;

  // 1. ¿Dónde rinde más el presupuesto? (Precio promedio por m² por barrio)
  const budgetChartData = useMemo(() => {
    return [...resumenList]
      .filter((r) => r.promedioM2 > 0)
      .sort((a, b) => a.promedioM2 - b.promedioM2)
      .slice(0, 12)
      .map((r) => ({
        barrio: r.barrio,
        promedioM2: Math.round(r.promedioM2),
        ofertas: r.ofertasActivas,
      }));
  }, [resumenList]);

  const bestBarrio = budgetChartData[0];

  // 2. Mapa de Oportunidades (Área vs Precio Total)
  const { belowAvgPoints, aboveAvgPoints, overallAvgM2, referenceLineData } = useMemo(() => {
    const valid = activeList.filter((x) => x.area > 0 && x.totalMensual > 0);
    const avg =
      valid.length > 0
        ? valid.reduce((acc, x) => acc + x.costoM2, 0) / valid.length
        : 0;

    const below = [];
    const above = [];
    let minArea = Infinity;
    let maxArea = -Infinity;

    for (const item of valid) {
      if (item.area < minArea) minArea = item.area;
      if (item.area > maxArea) maxArea = item.area;
      const point = {
        x: item.area,
        y: isVenta ? item.precioVenta : item.totalMensual,
        costoM2: item.costoM2,
        barrio: item.barrio,
        listing: item,
      };
      if (item.costoM2 <= avg) below.push(point);
      else above.push(point);
    }

    const refLine =
      valid.length > 0 && avg > 0
        ? [
            { x: Math.max(60, Math.floor(minArea - 2)), y: Math.round(avg * Math.max(60, Math.floor(minArea - 2))) },
            { x: Math.ceil(maxArea + 2), y: Math.round(avg * Math.ceil(maxArea + 2)) },
          ]
        : [];

    return {
      belowAvgPoints: below,
      aboveAvgPoints: above,
      overallAvgM2: avg,
      referenceLineData: refLine,
    };
  }, [activeList, isVenta]);

  // 3. Radar de Negociación
  const negotiationStats = useMemo(() => {
    const over21 = activeList.filter((x) => x.diasEnMercado >= 21);
    const pctOver21 =
      activeList.length > 0 ? Math.round((over21.length / activeList.length) * 100) : 0;

    const dropsFromActive = activeList
      .filter((x) => x.estado.toUpperCase().includes('BAJÓ'))
      .map((x) => ({
        id: x.id,
        barrio: x.barrio,
        estado: x.estado,
        precio: isVenta ? x.precioVenta : x.totalMensual,
        area: x.area,
        enlace: x.enlaces?.[0] || '',
        listing: x,
      }));

    const dropsFromHist = histList
      .filter(
        (h) =>
          h.ahorroCop > 0 ||
          h.cambiosPrecio.toUpperCase().includes('BAJA_PRECIO')
      )
      .map((h) => ({
        id: `hist-${h.fingerprint}`,
        barrio: h.barrio,
        estado:
          h.ahorroCop > 0
            ? `Bajó ${formatCOP(h.ahorroCop)}`
            : 'Baja registrada',
        precio: h.totalActual,
        area: h.area,
        enlace: h.enlaces?.[0] || '',
        listing: activeList.find((a) => a.fingerprint === h.fingerprint) || null,
      }));

    const seen = new Set();
    const combinedDrops = [];
    for (const d of [...dropsFromActive, ...dropsFromHist]) {
      const key = `${d.barrio}-${d.precio}-${d.area}`;
      if (!seen.has(key)) {
        seen.add(key);
        combinedDrops.push(d);
      }
    }

    return {
      over21Count: over21.length,
      pctOver21,
      recentDrops: combinedDrops.slice(0, 8),
    };
  }, [activeList, histList, isVenta]);

  // 4. Radiografía de Requisitos
  const requirementsData = useMemo(() => {
    const total = activeList.length || 1;
    const orientalPct = Math.round(
      (activeList.filter((x) => x.zona === 'Oriental').length / total) * 100
    );
    const openKitchenPct = Math.round(
      (activeList.filter((x) => x.cocinaAbierta).length / total) * 100
    );
    const balconyPct = Math.round(
      (activeList.filter((x) => x.balcon).length / total) * 100
    );
    const allThreePct = Math.round(
      (activeList.filter(
        (x) => x.zona === 'Oriental' && x.cocinaAbierta && x.balcon
      ).length /
        total) *
        100
    );
    return {
      bars: [
        { name: 'Zona Oriental', pct: orientalPct },
        { name: 'Cocina Abierta', pct: openKitchenPct },
        { name: 'Con Balcón', pct: balconyPct },
        { name: 'Cumplen los 3', pct: allThreePct },
      ],
      orientalPct,
      openKitchenPct,
      balconyPct,
      allThreePct,
    };
  }, [activeList]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-stoneLine bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-ink">
            Panorama del Mercado
          </h2>
          <p className="mt-0.5 text-sm text-stone-600">
            Lectura clara de precios, oportunidades y margen de negociación en Bogotá Norte.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('arriendo')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              !isVenta
                ? 'bg-sage text-white shadow-sm'
                : 'border border-stoneLine bg-ivory text-stone-700 hover:bg-stone-100'
            }`}
          >
            Arriendos ({arriendos.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('venta')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              isVenta
                ? 'bg-sage text-white shadow-sm'
                : 'border border-stoneLine bg-ivory text-stone-700 hover:bg-stone-100'
            }`}
          >
            Ventas ({ventas.length})
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfica 1 */}
        <section className="rounded-2xl border border-stoneLine bg-white p-5 shadow-sm">
          <h3 className="font-serif text-lg font-bold text-ink">
            1. ¿Dónde rinde más el presupuesto?
          </h3>
          <p className="mb-4 text-xs text-stone-500">
            Precio promedio por metro cuadrado según barrio (menor valor = más área por tu dinero)
          </p>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={budgetChartData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatCompactCOP(v)}
                  tick={{ fontSize: 11, fill: '#57534E' }}
                />
                <YAxis
                  dataKey="barrio"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11, fill: '#1C1917' }}
                />
                <Tooltip
                  formatter={(v) => [`${formatCOP(v)} / m²`, 'Promedio $/m²']}
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#E7E5E4',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="promedioM2" radius={[0, 6, 6, 0]}>
                  {budgetChartData.map((entry, idx) => (
                    <Cell
                      key={entry.barrio}
                      fill={idx < 3 ? '#2E5E4E' : '#78716C'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 rounded-xl bg-ivory p-3 text-xs leading-relaxed text-stone-700">
            {bestBarrio
              ? `Conclusión: Hoy ${bestBarrio.barrio} ofrece el mejor rendimiento de presupuesto con un promedio de ${formatCOP(bestBarrio.promedioM2)}/m² (${bestBarrio.ofertas} oferta(s) activa(s)).`
              : 'No hay suficientes datos agrupados por barrio para comparar todavía.'}
          </p>
        </section>

        {/* Gráfica 2 */}
        <section className="rounded-2xl border border-stoneLine bg-white p-5 shadow-sm">
          <h3 className="font-serif text-lg font-bold text-ink">
            2. Mapa de Oportunidades (Área vs. Precio)
          </h3>
          <p className="mb-2 text-xs text-stone-500">
            La recta punteada marca el promedio ({formatCOP(overallAvgM2)}/m²). Todo punto por debajo está a mejor precio que el promedio; haz clic en cualquier punto para ver el inmueble.
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] font-medium text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sage" /> Debajo de la línea (oportunidad)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Encima de la línea
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-ink" /> Recta promedio $/m²
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Área"
                  unit=" m²"
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tick={{ fontSize: 11, fill: '#57534E' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Precio"
                  tickFormatter={(v) => formatCompactCOP(v)}
                  tick={{ fontSize: 11, fill: '#57534E' }}
                />
                <ZAxis range={[60, 110]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length || !payload[0]?.payload?.listing) {
                      return null;
                    }
                    const p = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-stoneLine bg-white p-2.5 text-xs shadow-lg">
                        <p className="font-serif font-bold text-ink">{p.barrio}</p>
                        <p className="text-stone-600">
                          {p.x} m² · {formatCOP(p.y)}
                        </p>
                        <p className="font-semibold text-sage">
                          {formatCOP(p.costoM2)} / m²
                        </p>
                      </div>
                    );
                  }}
                />
                {referenceLineData.length === 2 && (
                  <Scatter
                    name="Recta promedio $/m²"
                    data={referenceLineData}
                    line={{ stroke: '#1C1917', strokeWidth: 2, strokeDasharray: '6 4' }}
                    shape={() => <g />}
                    isAnimationActive={false}
                  />
                )}
                <Scatter
                  name="Por debajo del promedio"
                  data={belowAvgPoints}
                  fill="#2E5E4E"
                  cursor="pointer"
                  onClick={(point) => {
                    if (point?.listing) onSelectProperty(point.listing);
                  }}
                />
                <Scatter
                  name="Por encima del promedio"
                  data={aboveAvgPoints}
                  fill="#D97706"
                  cursor="pointer"
                  onClick={(point) => {
                    if (point?.listing) onSelectProperty(point.listing);
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 rounded-xl bg-ivory p-3 text-xs leading-relaxed text-stone-700">
            Conclusión: Hay <strong className="text-sage">{belowAvgPoints.length}</strong> apartamentos
            en verde con mejor relación área/precio que el promedio del sector ({formatCOP(overallAvgM2)}/m²).
          </p>
        </section>

        {/* Gráfica 3 / Radar de Negociación */}
        <section className="rounded-2xl border border-stoneLine bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-serif text-lg font-bold text-ink">
                3. Radar de Negociación
              </h3>
              <p className="text-xs text-stone-500">
                Inmuebles con más de 21 días publicados y bajas de precio detectadas
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amberWarm">
              <Clock className="h-3.5 w-3.5" />
              {negotiationStats.pctOver21}% (+21 días)
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-stoneLine bg-ivory p-4">
              <p className="text-xs text-stone-600">Llevan 21+ días publicados</p>
              <p className="mt-1 font-serif text-2xl font-bold text-amberWarm">
                {negotiationStats.over21Count} de {activeList.length}
              </p>
              <p className="mt-1 text-[11px] text-stone-500">
                Mayor probabilidad de aceptar contraoferta
              </p>
            </div>
            <div className="rounded-xl border border-stoneLine bg-ivory p-4">
              <p className="text-xs text-stone-600">Bajas de precio recientes</p>
              <p className="mt-1 font-serif text-2xl font-bold text-sage">
                {negotiationStats.recentDrops.length}
              </p>
              <p className="mt-1 text-[11px] text-stone-500">
                Detectadas frente a corridas anteriores
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-1">
            {negotiationStats.recentDrops.length > 0 ? (
              negotiationStats.recentDrops.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-xl border border-stoneLine px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-sage" />
                    <div>
                      <p className="font-semibold text-ink">
                        {d.barrio} · {d.area} m²
                      </p>
                      <p className="text-[11px] text-sage">{d.estado}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-ink">{formatCOP(d.precio)}</p>
                    {d.listing && (
                      <button
                        type="button"
                        onClick={() => onSelectProperty(d.listing)}
                        className="text-[11px] font-semibold text-sage underline"
                      >
                        Ver ficha
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-stoneLine p-4 text-center text-xs text-stone-500">
                Aún no se registran rebajas de precio en el historial reciente; el radar las destacará automáticamente en las próximas corridas semanales.
              </p>
            )}
          </div>

          <p className="mt-3 rounded-xl bg-ivory p-3 text-xs leading-relaxed text-stone-700">
            Conclusión: Un <strong>{negotiationStats.pctOver21}%</strong> de la oferta activa supera los 21 días en el mercado, lo que abre margen para negociar canon o cuota de cierre.
          </p>
        </section>

        {/* Gráfica 4 */}
        <section className="rounded-2xl border border-stoneLine bg-white p-5 shadow-sm">
          <h3 className="font-serif text-lg font-bold text-ink">
            4. Radiografía de Requisitos
          </h3>
          <p className="mb-4 text-xs text-stone-500">
            Porcentaje de apartamentos dentro de presupuesto que cumplen tus preferencias ideales
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={requirementsData.bars}
                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#1C1917' }}
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#57534E' }}
                />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Cumplimiento']}
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#E7E5E4',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {requirementsData.bars.map((entry, idx) => (
                    <Cell
                      key={entry.name}
                      fill={idx === 3 ? '#B45309' : '#2E5E4E'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 flex items-start gap-2 rounded-xl bg-ivory p-3 text-xs leading-relaxed text-stone-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
            <span>
              Conclusión: De {activeList.length} opciones activas, el{' '}
              <strong>{requirementsData.orientalPct}%</strong> está en Zona Oriental, el{' '}
              <strong>{requirementsData.openKitchenPct}%</strong> tiene cocina abierta y el{' '}
              <strong>{requirementsData.balconyPct}%</strong> tiene balcón. Solo el{' '}
              <strong>{requirementsData.allThreePct}%</strong> reúne las tres características juntas.
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}
