import React, { useMemo, useState } from 'react';
import { Camera, ChevronDown, ChevronUp, PlusCircle, Sparkles, X } from 'lucide-react';
import { BARRIOS_CATALOG } from '../utils/valuationEngine';
import { formatCOP } from '../utils/formatters';

function compressImageToDataUrl(file, maxWidth = 600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve('');
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve('');
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export default function ManualListingModal({
  defaultOperacion = 'arriendo',
  onClose,
  onSaveManualListing,
}) {
  const [operacion, setOperacion] = useState(
    defaultOperacion === 'venta' ? 'venta' : 'arriendo'
  );
  const [barrio, setBarrio] = useState('');
  const [precio, setPrecio] = useState('');
  const [area, setArea] = useState('');
  const [admin, setAdmin] = useState('');

  const [showOptional, setShowOptional] = useState(false);
  const [direccion, setDireccion] = useState('');
  const [estrato, setEstrato] = useState('4');
  const [interlocutor, setInterlocutor] = useState('dueno_directo');
  const [enlace, setEnlace] = useState('');
  const [telefono, setTelefono] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const barrioOptions = useMemo(
    () =>
      Object.values(BARRIOS_CATALOG)
        .map((b) => b.nombre)
        .sort((a, b) => a.localeCompare(b, 'es')),
    []
  );

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageToDataUrl(file);
    if (compressed) setPhotoDataUrl(compressed);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanBarrio = barrio.trim();
    const numPrecio = Number(String(precio).replace(/[^\d]/g, ''));
    const numArea = Number(String(area).replace(',', '.'));
    const numAdmin = Number(String(admin || '0').replace(/[^\d]/g, '')) || 0;

    if (!cleanBarrio) {
      setErrorMsg('Por favor escribe o elige el barrio del apartamento.');
      return;
    }
    if (!Number.isFinite(numPrecio) || numPrecio <= 0) {
      setErrorMsg('Por favor ingresa un precio válido.');
      return;
    }
    if (!Number.isFinite(numArea) || numArea <= 0) {
      setErrorMsg('Por favor ingresa el área en m².');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);

    const today = new Date().toISOString().slice(0, 10);
    const fp = `manual-${Date.now()}`;
    const isVenta = operacion === 'venta';
    const totalMensual = isVenta ? numPrecio : numPrecio + numAdmin;
    const costoM2 = Math.round(totalMensual / numArea);

    const newListing = {
      id: `${operacion}:${fp}`,
      fingerprint: fp,
      sheetName: 'Mis_Avisos',
      origen: 'manual',
      operacion,
      score: 8.0,
      estado: 'Aviso propio',
      zona: 'Oriental',
      barrio: cleanBarrio,
      direccion: direccion.trim() || 'Aviso de ventana / portería',
      lat: null,
      lng: null,
      estrato: Number(estrato) || 4,
      area: numArea,
      hab: 0,
      banos: 0,
      garajes: 1,
      antiguedad: 'Por confirmar',
      canon: isVenta ? 0 : numPrecio,
      precioVenta: isVenta ? numPrecio : 0,
      admin: numAdmin,
      totalMensual,
      adminEstimada: numAdmin === 0,
      cocinaAbierta: false,
      balcon: false,
      costoM2,
      etiquetasConfort: interlocutor === 'dueno_directo' ? ['Trato directo'] : [],
      diasEnMercado: 0,
      firstSeenAt: today,
      fotos: photoDataUrl ? [photoDataUrl] : [],
      fuente: enlace.trim() ? 'Enlace guardado' : 'Ventana / Portería',
      enlaces: enlace.trim().startsWith('http') ? [enlace.trim()] : [],
      fechaDeteccion: today,
      estadoVisita: '',
      notasPersonales: '',
      checklistVisita: {
        parqueadero: false,
        adminReal: false,
        aguaHumedad: false,
        ruidoVentanas: false,
        zonasAscensor: false,
      },
      legalShield: null,
      priceHistory: [
        {
          date: today,
          price: numPrecio,
          admin: numAdmin,
          source: enlace.trim() ? 'Enlace guardado' : 'Aviso propio',
        },
      ],
      meta: {
        interlocutor,
        telefono: telefono.trim(),
      },
    };

    try {
      await onSaveManualListing(newListing);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-listing-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-stone-200/75 bg-ivory px-6 py-4 sm:py-5">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2.5 py-0.5 text-xs font-bold text-sage">
              <Sparkles className="h-3.5 w-3.5" />
              Evaluación en 15 segundos
            </span>
            <h2
              id="manual-listing-title"
              className="mt-1.5 font-serif text-xl font-bold text-ink"
            >
              Evaluar aviso de ventana, portería o enlace
            </h2>
            <p className="mt-0.5 text-xs text-stone-700">
              Ingresa solo 4 datos y calcula al instante si está caro y cuánto cuesta en verdad.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl border border-stone-200/80 bg-white text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
          {/* 1. Arriendo o Compra */}
          <div>
            <span className="block text-xs font-bold text-ink">
              1. ¿Es arriendo o compra?
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {[
                { id: 'arriendo', label: 'Arriendo' },
                { id: 'venta', label: 'Compra' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOperacion(opt.id)}
                  className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                    operacion === opt.id
                      ? 'border-sage bg-sage text-white shadow-sm'
                      : 'border-stoneLine bg-ivory text-stone-700 hover:border-sage/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Barrio */}
          <div>
            <label htmlFor="manual-barrio" className="block text-xs font-bold text-ink">
              2. Barrio
            </label>
            <input
              id="manual-barrio"
              list="manual-barrios-list"
              type="text"
              value={barrio}
              onChange={(e) => setBarrio(e.target.value)}
              placeholder="Ej. Cedritos, Contador, Colina Campestre..."
              className="mt-1.5 w-full rounded-xl border border-stoneLine bg-ivory px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
            />
            <datalist id="manual-barrios-list">
              {barrioOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {/* 3. Precio pedido */}
          <div>
            <label htmlFor="manual-precio" className="block text-xs font-bold text-ink">
              3. {operacion === 'venta' ? 'Precio pedido ($)' : 'Canon mensual pedido (sin admin)'}
            </label>
            <input
              id="manual-precio"
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder={operacion === 'venta' ? 'Ej. 450000000' : 'Ej. 2700000'}
              className="mt-1.5 w-full rounded-xl border border-stoneLine bg-ivory px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
            />
            {Number(precio) > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-sage">
                Vista rápida: {formatCOP(Number(precio))}
              </p>
            )}
          </div>

          {/* 4. Área y Administración */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="manual-area" className="block text-xs font-bold text-ink">
                4. Área (m²)
              </label>
              <input
                id="manual-area"
                type="number"
                step="0.1"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Ej. 84"
                className="mt-1.5 w-full rounded-xl border border-stoneLine bg-ivory px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="manual-admin" className="block text-xs font-bold text-ink">
                Administración ($)
              </label>
              <input
                id="manual-admin"
                type="number"
                value={admin}
                onChange={(e) => setAdmin(e.target.value)}
                placeholder="Ej. 420000"
                className="mt-1.5 w-full rounded-xl border border-stoneLine bg-ivory px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Acordeón opcional */}
          <div className="rounded-xl border border-stoneLine bg-ivory/60">
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-stone-700"
            >
              <span>Datos opcionales (enlace, foto del letrero, dueño directo, teléfono)</span>
              {showOptional ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showOptional && (
              <div className="space-y-3 border-t border-stoneLine p-3.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">¿Quién ofrece el inmueble?</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'dueno_directo', label: 'Dueño Directo' },
                      { id: 'inmobiliaria', label: 'Inmobiliaria' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInterlocutor(opt.id)}
                        className={`rounded-lg border px-2.5 py-1 font-bold ${
                          interlocutor === opt.id
                            ? 'border-sage bg-sage text-white'
                            : 'border-stoneLine bg-white text-stone-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-stone-700">Dirección o edificio</label>
                    <input
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Ej. Calle 142 # 12-10"
                      className="mt-1 w-full rounded-lg border border-stoneLine bg-white px-3 py-1.5 text-ink"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700">Estrato</label>
                    <select
                      value={estrato}
                      onChange={(e) => setEstrato(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stoneLine bg-white px-3 py-1.5 text-ink"
                    >
                      <option value="3">Estrato 3</option>
                      <option value="4">Estrato 4</option>
                      <option value="5">Estrato 5</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-stone-700">Enlace (opcional)</label>
                    <input
                      type="url"
                      value={enlace}
                      onChange={(e) => setEnlace(e.target.value)}
                      placeholder="https://..."
                      className="mt-1 w-full rounded-lg border border-stoneLine bg-white px-3 py-1.5 text-ink"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="300 123 4567"
                      className="mt-1 w-full rounded-lg border border-stoneLine bg-white px-3 py-1.5 text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stoneLine bg-white px-3 py-1.5 font-semibold text-ink hover:bg-stone-50">
                    <Camera className="h-3.5 w-3.5 text-sage" />
                    <span>{photoDataUrl ? 'Cambiar foto del aviso' : 'Subir foto del aviso / letrero'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                  {photoDataUrl && (
                    <img
                      src={photoDataUrl}
                      alt="Vista previa aviso"
                      className="mt-2 h-24 w-full rounded-lg object-cover"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sage/90 disabled:opacity-60"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{submitting ? 'Guardando...' : 'Guardar y ver Semáforo en 1 clic'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
