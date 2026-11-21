import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { ExternalLink, Eye, Home, HelpCircle } from 'lucide-react';
import {
  FAMILY_LOCATIONS,
  buildStreetViewUrl,
  formatCOP,
  formatTitleCase,
  haversineKm,
  isListingUnavailable,
} from '../utils/formatters';

const AUTO_NORTE_LINE = [
  [4.6835, -74.0485],
  [4.7365, -74.0485],
];

function createScorePin(score, operacion) {
  const s = Number(score) || 0;
  let bg = '#57534E';
  if (s >= 8.5) bg = '#2E5E4E';
  else if (s >= 6.5) bg = '#B45309';

  const outerRing = operacion === 'venta' ? 'rgba(255,255,255,0.92)' : 'rgba(254,243,199,0.95)';
  const html = `
    <div style="
      width: 36px;
      height: 36px;
      border-radius: 9999px;
      background: ${bg};
      color: #ffffff;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 0 2px ${outerRing}, 0 4px 12px rgba(28,25,23,0.28);
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
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function createFamilyPin(name) {
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-88%);">
      <div style="
        background:#6D28D9;
        color:#FFFFFF;
        border:2.5px solid #FFFFFF;
        border-radius:9999px;
        padding:3.5px 10px;
        font-size:11.5px;
        font-weight:700;
        white-space:nowrap;
        box-shadow:0 0 0 2px rgba(255,255,255,0.9), 0 6px 14px rgba(28,25,23,0.28);
        font-family:'Plus Jakarta Sans',sans-serif;
      ">★ ${name}</div>
      <div style="
        width:11px;
        height:11px;
        background:#6D28D9;
        border:2.5px solid #FFFFFF;
        border-radius:9999px;
        margin-top:3px;
        box-shadow:0 0 0 1.5px rgba(255,255,255,0.9), 0 3px 8px rgba(28,25,23,0.32);
      "></div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-radar-pin',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -36],
  });
}

export default function MapView({ arriendos, ventas }) {
  const [mode, setMode] = useState('todos');

  const activeArriendos = useMemo(
    () =>
      arriendos.filter(
        (item) => item.estadoVisita !== 'Descartado' && !isListingUnavailable(item)
      ),
    [arriendos]
  );

  const activeVentas = useMemo(
    () =>
      ventas.filter(
        (item) => item.estadoVisita !== 'Descartado' && !isListingUnavailable(item)
      ),
    [ventas]
  );

  const markers = useMemo(() => {
    const pool =
      mode === 'arriendos'
        ? activeArriendos
        : mode === 'ventas'
          ? activeVentas
          : [...activeArriendos, ...activeVentas];
    return pool.filter(
      (item) =>
        item.lat !== null &&
        item.lng !== null &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
    );
  }, [activeArriendos, activeVentas, mode]);

  const definedFamily = useMemo(
    () => FAMILY_LOCATIONS.filter((loc) => loc.defined),
    []
  );
  const beatrizLoc = useMemo(
    () => FAMILY_LOCATIONS.find((loc) => !loc.defined),
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200/75 bg-white p-4 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink">
            Mapa del Norte de Bogotá (Calle 100 a 153)
          </h2>
          <p className="mt-0.5 text-xs text-stone-700">
            La línea punteada señala la Autopista Norte: a la derecha está la{' '}
            <strong>Zona Oriental</strong> y a la izquierda la <strong>Zona Occidental</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'todos',
              label: `Todos (${activeArriendos.length + activeVentas.length})`,
            },
            { id: 'arriendos', label: `Arriendos (${activeArriendos.length})` },
            { id: 'ventas', label: `Ventas (${activeVentas.length})` },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                mode === opt.id
                  ? 'bg-sage text-white shadow-sm'
                  : 'border border-stone-200/80 bg-ivory text-stone-700 hover:bg-stone-100 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ubicaciones fijas de la familia */}
      <div className="rounded-2xl border border-purple-200/80 bg-white p-4 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)]">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-purple-900">
          Ubicaciones fijas de referencia familiar
        </p>
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {definedFamily.map((fam) => (
            <span
              key={fam.id}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200/80 bg-purple-50 px-3 py-1.5 font-semibold text-purple-900"
            >
              <Home className="h-3.5 w-3.5 text-purple-700" />
              <span>
                {fam.name}: {fam.address.replace(', Bogotá', '')}
              </span>
            </span>
          ))}
          {beatrizLoc && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amberWarm">
              <HelpCircle className="h-3.5 w-3.5" />
              <span>{beatrizLoc.address}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-1 text-xs font-medium text-stone-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-sage ring-2 ring-white shadow-sm" /> Puntaje 8.5 – 10 (Excelente)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amberWarm ring-2 ring-white shadow-sm" /> Puntaje 6.5 – 8.4 (Buena)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-stone-600 ring-2 ring-white shadow-sm" /> Puntaje &lt; 6.5 (Básica)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-purple-700 ring-2 ring-white shadow-sm" /> Puntos familiares (Gloria / Ángela / Beatriz)
        </span>
      </div>

      <div className="h-[560px] w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)]">
        <MapContainer
          center={[4.696, -74.054]}
          zoom={12}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
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

          {/* Pines fijos de Gloria, Ángela y Beatriz */}
          {definedFamily.map((fam) => {
            const famSv = buildStreetViewUrl(fam.lat, fam.lng);
            return (
              <Marker
                key={fam.id}
                position={[fam.lat, fam.lng]}
                icon={createFamilyPin(fam.name)}
                zIndexOffset={1000}
              >
                <Popup maxWidth={240}>
                  <div className="space-y-1.5 p-0.5 text-xs text-ink">
                    <span className="inline-block rounded bg-purple-100 px-2 py-0.5 font-bold text-purple-900">
                      {fam.estimated ? 'Referencia familiar (estimada)' : 'Referencia familiar'}
                    </span>
                    <p className="font-serif text-sm font-bold text-ink">{fam.name}</p>
                    <p className="text-stone-600">{fam.address}</p>
                    {famSv && (
                      <a
                        href={famSv}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 rounded-md border border-stoneLine bg-white px-2.5 py-1 text-[11px] font-semibold text-ink"
                      >
                        <Eye className="h-3 w-3" />
                        Ver cuadra (Street View)
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {markers.map((item) => {
            const sv = buildStreetViewUrl(item.lat, item.lng);
            const distances = definedFamily
              .map((fam) => {
                const km = haversineKm(item.lat, item.lng, fam.lat, fam.lng);
                return km !== null ? `A ${km} km de ${fam.name}` : null;
              })
              .filter(Boolean);

            return (
              <Marker
                key={item.id}
                position={[item.lat, item.lng]}
                icon={createScorePin(item.score, item.operacion)}
              >
                <Popup maxWidth={280}>
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
                        Puntuación {Number(item.score).toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <p className="font-serif text-sm font-bold text-ink">
                        {formatTitleCase(item.barrio)}
                      </p>
                      <p className="text-[11px] text-stone-600">
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
                    {distances.length > 0 && (
                      <p className="rounded bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-900">
                        {distances.join(' · ')}
                      </p>
                    )}
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
