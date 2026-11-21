import React, { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCOP } from '../utils/formatters';

export default function SaleSimulator({ precioVenta }) {
  const [open, setOpen] = useState(false);
  const [pctInicial, setPctInicial] = useState(30);

  const cuotaInicial = Math.round((precioVenta * pctInicial) / 100);
  const saldoFinanciar = Math.max(0, precioVenta - cuotaInicial);
  const gastosEscrituracion = Math.round(precioVenta * 0.028);

  return (
    <div className="mt-3 rounded-xl border border-stoneLine bg-ivory/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-sage transition hover:bg-stone-100/70"
      >
        <span className="inline-flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          Simulador de cuota inicial y escrituración
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-stoneLine px-3.5 py-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="sim-slider" className="font-medium text-stone-700">
              Cuota inicial:
            </label>
            <span className="rounded-md bg-sage/10 px-2 py-0.5 font-bold text-sage">
              {pctInicial}%
            </span>
          </div>
          <input
            id="sim-slider"
            type="range"
            min={20}
            max={60}
            step={5}
            value={pctInicial}
            onChange={(e) => setPctInicial(Number(e.target.value))}
            className="w-full accent-sage"
          />
          <div className="mt-1 flex justify-between text-[11px] text-stone-500">
            <span>20%</span>
            <span>40%</span>
            <span>60%</span>
          </div>

          <dl className="mt-3 space-y-1.5 border-t border-stoneLine/70 pt-2.5">
            <div className="flex justify-between">
              <dt className="text-stone-600">Cuota inicial ({pctInicial}%)</dt>
              <dd className="font-semibold text-ink">{formatCOP(cuotaInicial)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Saldo a financiar</dt>
              <dd className="font-semibold text-ink">{formatCOP(saldoFinanciar)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Escrituración y registro (~2.8%)</dt>
              <dd className="font-semibold text-amberWarm">{formatCOP(gastosEscrituracion)}</dd>
            </div>
            <div className="flex justify-between border-t border-stoneLine/70 pt-1.5">
              <dt className="font-semibold text-ink">Efectivo total estimado al cierre</dt>
              <dd className="font-bold text-sage">
                {formatCOP(cuotaInicial + gastosEscrituracion)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
