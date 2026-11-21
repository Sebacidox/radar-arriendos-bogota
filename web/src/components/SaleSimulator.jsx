import React, { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { formatCOP } from '../utils/formatters';
import {
  evaluateCompra2026,
  resolveBarrioBenchmark,
} from '../utils/valuationEngine';

export default function SaleSimulator({
  precioVenta,
  areaM2 = 80,
  admin = 0,
  barrio = '',
  resumenList = [],
  allListings = [],
  onOpenDecision,
}) {
  const [open, setOpen] = useState(false);
  const [pctInicial, setPctInicial] = useState(30);
  const [beneficencia5050, setBeneficencia5050] = useState(true);

  const benchmark = useMemo(
    () => resolveBarrioBenchmark(barrio, 'venta', resumenList, allListings),
    [barrio, resumenList, allListings]
  );

  const pctFinanciacion = Math.max(0, (100 - pctInicial) / 100);
  const modalidadPago = pctInicial >= 100 ? 'contado' : 'credito_privado';

  const evalPrivado = useMemo(
    () =>
      evaluateCompra2026({
        precioOferta: precioVenta,
        areaM2,
        adminMensual: admin,
        adminMedianaBarrio: benchmark.adminMediana,
        medianaBarrioVentaM2: benchmark.medianaM2,
        estadoRemodelacion: 'listo',
        modalidadPago,
        pctFinanciacion,
        beneficencia5050,
      }),
    [precioVenta, areaM2, admin, benchmark, modalidadPago, pctFinanciacion, beneficencia5050]
  );

  const evalFna = useMemo(
    () =>
      evaluateCompra2026({
        precioOferta: precioVenta,
        areaM2,
        adminMensual: admin,
        adminMedianaBarrio: benchmark.adminMediana,
        medianaBarrioVentaM2: benchmark.medianaM2,
        estadoRemodelacion: 'listo',
        modalidadPago: pctInicial >= 100 ? 'contado' : 'credito_fna',
        pctFinanciacion,
        beneficencia5050,
      }),
    [precioVenta, areaM2, admin, benchmark, pctInicial, pctFinanciacion, beneficencia5050]
  );

  const cuotaInicial = Math.round((precioVenta * pctInicial) / 100);
  const saldoFinanciar = Math.max(0, precioVenta - cuotaInicial);

  return (
    <div className="mt-3 rounded-xl border border-stoneLine bg-ivory/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-sage transition hover:bg-stone-100/70"
      >
        <span className="inline-flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5" />
          Simulador exacto Bogotá 2026 (cierre y cuota)
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-stoneLine px-3.5 py-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <label className="font-medium text-stone-700">
              Cuota inicial:
            </label>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-sage/10 px-2 py-0.5 font-bold text-sage">
                {pctInicial === 100 ? '100% (Contado)' : `${pctInicial}%`}
              </span>
              {pctInicial !== 100 && (
                <button
                  type="button"
                  onClick={() => setPctInicial(100)}
                  className="rounded-md border border-stoneLine bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-600 hover:text-ink"
                >
                  Contado
                </button>
              )}
            </div>
          </div>

          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={pctInicial}
            onChange={(e) => setPctInicial(Number(e.target.value))}
            aria-label="Porcentaje de cuota inicial"
            className="w-full accent-sage"
          />
          <div className="mt-1 flex justify-between text-[11px] text-stone-500">
            <span>20%</span>
            <span>50%</span>
            <span>100% Contado</span>
          </div>

          <div className="mt-2.5 flex items-center justify-between rounded-lg border border-stoneLine/80 bg-white px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-stone-700">
              Imp. registro (beneficencia):
            </span>
            <button
              type="button"
              onClick={() => setBeneficencia5050((v) => !v)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                beneficencia5050
                  ? 'bg-emerald-50 text-sage'
                  : 'bg-amber-50 text-amberWarm'
              }`}
            >
              {beneficencia5050 ? '50/50 legal' : '100% comprador'}
            </button>
          </div>

          <dl className="mt-3 space-y-1.5 border-t border-stoneLine/70 pt-2.5">
            <div className="flex justify-between">
              <dt className="text-stone-600">Cuota inicial ({pctInicial}%)</dt>
              <dd className="font-semibold text-ink">{formatCOP(cuotaInicial)}</dd>
            </div>
            {saldoFinanciar > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">Saldo a financiar</dt>
                <dd className="font-semibold text-ink">{formatCOP(saldoFinanciar)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-stone-600">Notaría (50%) + ORIP + Beneficencia</dt>
              <dd className="font-semibold text-amberWarm">
                {formatCOP(evalPrivado.costosCierreTotales)}
              </dd>
            </div>
            {beneficencia5050 && (
              <div className="flex justify-between text-[11px] text-sage">
                <dt>Ahorro por pedir 50/50 legal en promesa</dt>
                <dd className="font-semibold">+{formatCOP(evalPrivado.ahorroBeneficencia5050)}</dd>
              </div>
            )}
            {saldoFinanciar > 0 && (
              <div className="rounded-lg bg-white p-2 text-[11px]">
                <div className="flex justify-between text-stone-600">
                  <span>Cuota est. 20 años (Promedio 15,47%):</span>
                  <strong className="text-ink">{formatCOP(evalPrivado.cuotaPromedio)}/mes</strong>
                </div>
                <div className="mt-0.5 flex justify-between text-sage">
                  <span>Con FNA (12,37% E.A.):</span>
                  <strong>{formatCOP(evalFna.cuotaFna)}/mes</strong>
                </div>
              </div>
            )}
            <div className="flex justify-between border-t border-stoneLine/70 pt-1.5">
              <dt className="font-semibold text-ink">Efectivo total estimado al cierre</dt>
              <dd className="font-bold text-sage">
                {formatCOP(cuotaInicial + evalPrivado.costosCierreTotales)}
              </dd>
            </div>
          </dl>

          {evalPrivado.saltoTacticoOrip && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amberWarm">
              💡 Si negocias a{' '}
              <strong>{formatCOP(evalPrivado.saltoTacticoOrip.precioObjetivo)}</strong> bajas de
              tramo ORIP y ahorras ~{formatCOP(evalPrivado.saltoTacticoOrip.ahorroOrip)}.
            </div>
          )}

          {onOpenDecision && (
            <button
              type="button"
              onClick={onOpenDecision}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sage/30 bg-white px-3 py-1.5 text-[11px] font-bold text-sage transition hover:bg-emerald-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Abrir análisis completo y oferta
            </button>
          )}
        </div>
      )}
    </div>
  );
}
