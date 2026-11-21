import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lightbulb,
  MailCheck,
  MessageSquarePlus,
  Send,
  Wrench,
} from 'lucide-react';

const AUTORES_RAPIDOS = ['Mamá', 'Papá', 'Gloria', 'Ángela', 'Beatriz', 'Otro'];
const SECCIONES = ['General', 'Arriendos', 'Ventas', 'Favoritos', 'Mapa', 'Informes'];

const ESTADO_STYLES = {
  Pendiente: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock,
  },
  'En revisión': {
    badge: 'border-stone-300 bg-stone-100 text-stone-700',
    icon: Wrench,
  },
  Resuelto: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
};

export default function MejorasView({ mejoras = [], onSubmitMejora }) {
  const [autorPreset, setAutorPreset] = useState(() => {
    try {
      return localStorage.getItem('radar_mejoras_autor') || 'Mamá';
    } catch {
      return 'Mamá';
    }
  });
  const [autorOtro, setAutorOtro] = useState('');
  const [tipo, setTipo] = useState('Idea');
  const [seccion, setSeccion] = useState('General');
  const [descripcion, setDescripcion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [filterEstado, setFilterEstado] = useState('todas');

  const handleSelectAutor = (val) => {
    setAutorPreset(val);
    try {
      localStorage.setItem('radar_mejoras_autor', val);
    } catch {
      // Ignorar si localStorage no está disponible
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanDesc = descripcion.trim();
    if (!cleanDesc) {
      setFeedback({
        tone: 'error',
        text: 'Por favor escriban primero qué mejora o falla quieren reportar.',
      });
      return;
    }

    const autorFinal =
      autorPreset === 'Otro' ? autorOtro.trim() || 'Familia' : autorPreset;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await onSubmitMejora({
        autor: autorFinal,
        tipo,
        seccion,
        descripcion: cleanDesc,
      });
      setDescripcion('');
      setFeedback({
        tone: 'success',
        text: res?.emailSent
          ? '¡Listo! Quedó guardado en Google Sheets y ya se envió un correo a Sebastián.'
          : '¡Listo! Quedó guardado en la pestaña Mejoras de Google Sheets.',
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        text: err?.message || 'No se pudo enviar en este momento. Intenta nuevamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(() => {
    let pendientes = 0;
    let resueltas = 0;
    for (const m of mejoras) {
      const est = String(m.estado || 'Pendiente').toLowerCase();
      if (est === 'resuelto' || est === 'resuelta' || est === 'listo') {
        resueltas += 1;
      } else {
        pendientes += 1;
      }
    }
    return { total: mejoras.length, pendientes, resueltas };
  }, [mejoras]);

  const filteredMejoras = useMemo(() => {
    if (filterEstado === 'todas') return mejoras;
    return mejoras.filter((m) => {
      const est = String(m.estado || 'Pendiente').toLowerCase();
      const isDone = est === 'resuelto' || est === 'resuelta' || est === 'listo';
      return filterEstado === 'resueltas' ? isDone : !isDone;
    });
  }, [mejoras, filterEstado]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200/75 bg-white p-5 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-sage">
              <MessageSquarePlus className="h-4 w-4" />
              <span>Buzón Familiar de Mejoras y Fallas</span>
            </div>
            <h2 className="mt-1 font-serif text-2xl font-bold text-ink">
              ¿Qué te gustaría mejorar o qué no funcionó bien?
            </h2>
            <p className="mt-1 text-sm text-stone-700">
              Todo lo que envíen aquí queda anotado en Google Sheets y le llega por correo a
              Sebastián para ajustarlo pronto.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-sage/20 bg-sage/5 px-3.5 py-2.5 text-xs font-medium text-sage">
            <MailCheck className="h-4 w-4 shrink-0" />
            <span>Aviso automático por correo</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Formulario de envío */}
        <section className="lg:col-span-6">
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-stone-200/75 bg-white p-5 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] sm:p-6"
          >
            <div>
              <label className="block text-sm font-bold text-ink">
                1. ¿Quién envía el mensaje?
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {AUTORES_RAPIDOS.map((nombre) => {
                  const active = autorPreset === nombre;
                  return (
                    <button
                      key={nombre}
                      type="button"
                      onClick={() => handleSelectAutor(nombre)}
                      className={`min-h-[42px] rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-sage bg-sage text-white shadow-sm'
                          : 'border-stone-200/80 bg-ivory text-stone-700 hover:border-sage/40 hover:text-ink'
                      }`}
                    >
                      {nombre}
                    </button>
                  );
                })}
              </div>
              {autorPreset === 'Otro' && (
                <input
                  type="text"
                  value={autorOtro}
                  onChange={(e) => setAutorOtro(e.target.value)}
                  placeholder="Escribe tu nombre..."
                  className="mt-2.5 w-full rounded-xl border border-stoneLine bg-ivory px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
                />
              )}
            </div>

            <div>
              <span className="block text-sm font-bold text-ink">
                2. ¿Qué tipo de mensaje es?
              </span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTipo('Idea')}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                    tipo === 'Idea'
                      ? 'border-sage bg-sage/5 ring-1 ring-sage'
                      : 'border-stoneLine bg-ivory/60 hover:border-sage/40'
                  }`}
                >
                  <Lightbulb
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      tipo === 'Idea' ? 'text-sage' : 'text-stone-500'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-bold text-ink">Idea o mejora</div>
                    <div className="text-xs text-stone-600">
                      Algo nuevo que les gustaría ver o cambiar
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTipo('Falla')}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                    tipo === 'Falla'
                      ? 'border-amber-600 bg-amber-50/70 ring-1 ring-amber-600'
                      : 'border-stoneLine bg-ivory/60 hover:border-amber-400'
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      tipo === 'Falla' ? 'text-amber-700' : 'text-stone-500'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-bold text-ink">Algo falló / error</div>
                    <div className="text-xs text-stone-600">
                      Un botón, foto, mapa o dato que no funcionó bien
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <span className="block text-sm font-bold text-ink">
                3. ¿En qué pestaña o parte de la página?
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {SECCIONES.map((sec) => {
                  const active = seccion === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSeccion(sec)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-ink bg-ink text-white'
                          : 'border-stoneLine bg-white text-stone-700 hover:border-sage/40'
                      }`}
                    >
                      {sec}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="mejora-descripcion" className="block text-sm font-bold text-ink">
                4. Cuéntanos con tus palabras
              </label>
              <textarea
                id="mejora-descripcion"
                rows={4}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={
                  tipo === 'Falla'
                    ? 'Ejemplo: En Ventas intenté abrir las fotos de un apartamento en Cedritos y no cargaron...'
                    : 'Ejemplo: Me gustaría que en el mapa también se vean los centros comerciales o parques cercanos...'
                }
                className="mt-2 w-full rounded-xl border border-stoneLine bg-ivory p-3.5 text-sm text-ink placeholder:text-stone-400 focus:border-sage focus:bg-white focus:outline-none"
              />
            </div>

            {feedback && (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                  feedback.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-sage/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? 'Enviando a Sebastián...' : 'Enviar mejora a Sebastián'}</span>
            </button>
          </form>
        </section>

        {/* Historial de mejoras enviadas */}
        <section className="lg:col-span-6">
          <div className="rounded-2xl border border-stoneLine bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 border-b border-stoneLine pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-ink">
                  Historial enviado ({counts.total})
                </h3>
                <p className="text-xs text-stone-500">
                  {counts.pendientes} pendiente(s) · {counts.resueltas} resuelta(s)
                </p>
              </div>
              <div className="flex gap-1.5">
                {[
                  { id: 'todas', label: 'Todas' },
                  { id: 'pendientes', label: 'Pendientes' },
                  { id: 'resueltas', label: 'Resueltas' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilterEstado(opt.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      filterEstado === opt.id
                        ? 'border-sage bg-sage text-white'
                        : 'border-stoneLine bg-ivory text-stone-600 hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredMejoras.length === 0 ? (
              <div className="py-10 text-center">
                <MessageSquarePlus className="mx-auto h-9 w-9 text-stone-300" />
                <p className="mt-3 text-sm font-semibold text-stone-700">
                  {mejoras.length === 0
                    ? 'Todavía no han enviado mejoras o reportes.'
                    : 'No hay mensajes en esta categoría.'}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Cuando envíen uno usando el formulario, aparecerá aquí con su estado.
                </p>
              </div>
            ) : (
              <div className="mt-4 max-h-[540px] space-y-3 overflow-y-auto pr-1">
                {filteredMejoras.map((item, idx) => {
                  const isFalla = String(item.tipo || '').toLowerCase().includes('falla');
                  const estInfo = ESTADO_STYLES[item.estado] || ESTADO_STYLES.Pendiente;
                  const EstIcon = estInfo.icon;
                  return (
                    <article
                      key={item.id || `${item.fecha}-${idx}`}
                      className="rounded-xl border border-stoneLine bg-ivory/60 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                              isFalla
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-sage/30 bg-sage/10 text-sage'
                            }`}
                          >
                            {isFalla ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Lightbulb className="h-3 w-3" />
                            )}
                            {isFalla ? 'Falla' : 'Idea'}
                          </span>
                          <span className="rounded-full border border-stoneLine bg-white px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                            {item.seccion || 'General'}
                          </span>
                          <span className="text-xs font-semibold text-stone-700">
                            · {item.autor || 'Familia'}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${estInfo.badge}`}
                        >
                          <EstIcon className="h-3 w-3" />
                          {item.estado || 'Pendiente'}
                        </span>
                      </div>

                      <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink">
                        {item.descripcion}
                      </p>

                      {item.notaRespuesta && (
                        <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
                          <strong>Nota de Sebastián:</strong> {item.notaRespuesta}
                        </div>
                      )}

                      {item.fecha && (
                        <p className="mt-2 text-[11px] font-medium text-stone-400">
                          Enviado: {item.fecha}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
