import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { ExternalLink, Eye } from 'lucide-react';
import { buildStreetViewUrl, formatCOP } from '../utils/formatters';

const AUTO_NORTE_LINE = [
  [4.6835, -74.0485],
  [4.7365, -74.0485],
];

function createScorePin(score, operacion) {
  const s = Number(score) || 0;
  let bg = '#57534E';
  if (s >= 8.5) bg = '#2E5E4E';
  else if (s >= 6.5) bg = '#B45309';

  const ring = operacion === 'venta' ? '2px solid #FFFFFF' : '2px solid #FEF3C7';
  const html = `
    <div style="
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      background: ${bg};
      color: #ffffff;
      border: ${ring};
      box-shadow: 0 3px 10px rgba(0,0,0,0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 11px;
      font-family: 'Plus Jakarta Sans', sans-serif;
    ">${s.toFixed(1)}</div>
  `;
  return L.divIcon({
    html,
    className: 'custom-radar-pin',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

export default function MapView({ arriendos, ventas }) {
  const [mode, setMode] = useState('todos');

  const markers = useMemo(() => {
    const pool =
      mode === 'arriendos'
        ? arriendos
        : mode === 'ventas'
          ? ventas
          : [...arriendos, ...ventas];
    return pool.filter(
      (item) =>
        item.estadoVisita !== 'Descartado' &&
        item.lat !== null &&
        item.lng !== null &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
    );
  }, [arriendos, ventas, mode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-stoneLine bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink">
            Mapa del Norte de Bogotá (Calle 100 a 153)
          </h2>
          <p className="text-xs text-stone-600">
            La línea punteada señala la Autopista Norte: a la derecha está la{' '}
            <strong>Zona Oriental</strong> y a la izquierda la <strong>Zona Occidental</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'todos', label: `Todos (${arriendos.length + ventas.length})` },
            { id: 'arriendos', label: `Arriendos (${arriendos.length})` },
            { id: 'ventas', label: `Ventas (${ventas.length})` },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                mode === opt.id
                  ? 'bg-sage text-white'
                  : 'border border-stoneLine bg-ivory text-stone-700 hover:bg-stone-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sage" /> Puntaje 8.5 – 10 (Excelente)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amberWarm" /> Puntaje 6.5 – 8.4 (Buena)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-stone-600" /> Puntaje &lt; 6.5 (Básica)
        </span>
      </div>

      <div className="h-[560px] w-full overflow-hidden rounded-2xl border border-stoneLine bg-white shadow-sm">
        <MapContainer
          center={[4.711, -74.048]}
          zoom={13}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          <Polyline
            positions={AUTO_NORTE_LINE}
            pathOptions={{
              color: '#2E5E4E',
              weight: 2.5,
              dashArray: '8 8',
              opacity: 0.75,
            }}
          />

          {markers.map((item) => {
            const sv = buildStreetViewUrl(item.lat, item.lng);
            return (
              <Marker
                key={item.id}
                position={[item.lat, item.lng]}
                icon={createScorePin(item.score, item.operacion)}
              >
                <Popup maxWidth={270}>
                  <div className="space-y-2 p-0.5 text-xs text-ink">
                    {item.fotos?.[0] && (
                      <img
                        src={item.fotos[0]}
                        alt={item.barrio}
                        className="h-28 w-full rounded-lg object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-sage/10 px-2 py-0.5 font-bold text-sage">
                        {item.operacion === 'venta' ? 'Venta' : 'Arriendo'}
                      </span>
                      <span className="font-bold text-ink">
                        Score {Number(item.score).toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <p className="font-serif text-sm font-bold text-ink">{item.barrio}</p>
                      <p className="text-[11px] text-stone-500">
                        {item.direccion !== 'No publicada'
                          ? item.direccion
                          : `Zona ${item.zona}`}
                      </p>
                    </div>
                    <p className="font-bold text-sage">
                      {item.operacion === 'venta'
                        ? formatCOP(item.precioVenta)
                        : `${formatCOP(item.totalMensual)}/mes`}
                    </p>
                    <p className="text-[11px] text-stone-600">
                      {item.area} m² · {item.hab} hab · {item.banos} baños · {item.garajes} gar.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.enlaces?.[0] && (
                        <a
                          href={item.enlaces[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-sage px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver anuncio
                        </a>
                      )}
                      {sv && (
                        <a
                          href={sv}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-stoneLine bg-white px-2.5 py-1 text-[11px] font-semibold text-ink"
                        >
                          <Eye className="h-3 w-3" />
                          Street View
                        </a>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
