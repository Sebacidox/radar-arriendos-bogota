import React from 'react';
import { X, ExternalLink, Eye } from 'lucide-react';
import { buildStreetViewUrl, formatCOP } from '../utils/formatters';

export default function CompareModal({ items, onClose, onRemove }) {
  if (!items || items.length === 0) return null;

  const rows = [
    { label: 'Operación', render: (x) => (x.operacion === 'venta' ? 'Venta' : 'Arriendo') },
    { label: 'Puntuación', render: (x) => `${Number(x.score).toFixed(1)} / 10` },
    { label: 'Barrio', render: (x) => x.barrio },
    { label: 'Zona', render: (x) => x.zona },
    { label: 'Dirección', render: (x) => x.direccion || 'No publicada' },
    { label: 'Estrato', render: (x) => `Estrato ${x.estrato}` },
    { label: 'Área', render: (x) => `${x.area} m²` },
    { label: 'Distribución', render: (x) => `${x.hab} hab · ${x.banos} baños · ${x.garajes} gar.` },
    {
      label: 'Precio principal',
      render: (x) =>
        x.operacion === 'venta' ? formatCOP(x.precioVenta) : `${formatCOP(x.totalMensual)} / mes`,
    },
    {
      label: 'Administración',
      render: (x) => `${formatCOP(x.admin)}${x.adminEstimada ? ' (est.)' : ''}`,
    },
    { label: 'Valor / m²', render: (x) => `${formatCOP(x.costoM2)}/m²` },
    { label: 'Cocina abierta', render: (x) => (x.cocinaAbierta ? 'Sí' : 'No') },
    { label: 'Balcón / terraza', render: (x) => (x.balcon ? 'Sí' : 'No') },
    { label: 'Antigüedad', render: (x) => x.antiguedad || 'No especificada' },
    { label: 'Días en mercado', render: (x) => `${x.diasEnMercado} días` },
    {
      label: 'Confort y alertas',
      render: (x) => (x.etiquetasConfort.length ? x.etiquetasConfort.join(', ') : '—'),
    },
  ];

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Comparador cara a cara"
    >
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-stoneLine bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stoneLine bg-ivory px-6 py-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-ink">
              Comparación Cara a Cara ({items.length})
            </h2>
            <p className="text-xs text-stone-500">
              Revisa las diferencias clave antes de agendar visitas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stoneLine bg-white p-2 text-stone-600 hover:bg-stone-100 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto p-6">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stoneLine">
                <th className="w-44 py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Criterio
                </th>
                {items.map((item) => (
                  <th key={item.id} className="px-3 pb-4 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-serif text-base font-bold text-ink">{item.barrio}</p>
                        <p className="text-xs font-normal text-stone-500">{item.fuente}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(item)}
                        className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-ink"
                        title="Quitar del comparador"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stoneLine/70">
              {rows.map((row) => (
                <tr key={row.label} className="hover:bg-ivory/60">
                  <td className="py-2.5 pr-4 text-xs font-semibold text-stone-600">
                    {row.label}
                  </td>
                  {items.map((item) => (
                    <td key={`${item.id}-${row.label}`} className="px-3 py-2.5 text-xs text-ink">
                      {row.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 text-xs font-semibold text-stone-600">Enlaces</td>
                {items.map((item) => {
                  const sv = buildStreetViewUrl(item.lat, item.lng);
                  return (
                    <td key={`${item.id}-links`} className="px-3 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {item.enlaces?.[0] && (
                          <a
                            href={item.enlaces[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 font-semibold text-white"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Anuncio
                          </a>
                        )}
                        {sv && (
                          <a
                            href={sv}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-stoneLine px-2.5 py-1.5 font-semibold text-ink"
                          >
                            <Eye className="h-3 w-3" />
                            Street View
                          </a>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
