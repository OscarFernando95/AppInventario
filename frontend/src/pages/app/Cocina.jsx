import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Check, Undo2, Printer, BellRing, Volume2, VolumeX, Bell } from 'lucide-react';
import api from '../../api/axios';
import { formatCantidad } from '../../utils/format';
import { apiError } from '../../utils/apiError';
import { imprimirComanda } from '../../utils/comandaTicket';
import { CLASES_TONO, itemsDemorados, tonoDeComanda } from '../../utils/demoraCocina';
import { useOpciones } from '../../hooks/useOpciones';
import { useComandasConAviso } from '../../hooks/useAvisoComandas';
import { useAuthStore } from '../../store/authStore';
import { useAhora, hace } from '../../hooks/useAhora';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import FormError from '../../components/FormError';

const Tarjeta = ({ comanda, ahora, config, onEstado, onImprimir, ocupado }) => {
  const cancelada = comanda.cuenta_estado === 'CANCELADA';
  const lista = comanda.estado === 'LISTA';
  // Color por antigüedad (con «Alertas de demora» usa los minutos de la empresa y el objetivo de cada plato).
  const demorados = new Map(itemsDemorados(comanda, ahora, config).map((d) => [d.id, d.minutos]));
  return (
    <article className={`rounded-2xl border-2 p-4 shadow-sm ${lista ? 'border-slate-200 bg-slate-50' : CLASES_TONO[tonoDeComanda(comanda, ahora, config)]}`} aria-label={`Comanda ${comanda.id} de ${comanda.cuenta}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-bold text-slate-900">{comanda.cuenta}</p>
          <p className="text-xs text-slate-500">Comanda #{comanda.id}{comanda.estacion ? ` · ${comanda.estacion}` : ''} · {comanda.mesero}</p>
          {comanda.tiempo_nombre && <p className="mt-1 inline-block rounded bg-slate-800 text-white text-xs font-bold uppercase tracking-wide px-2 py-0.5">{comanda.tiempo_nombre}</p>}
        </div>
        <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">hace {hace(comanda.enviada_en, ahora)}</span>
      </header>
      {cancelada && <p role="alert" className="mt-2 rounded-lg bg-red-600 text-white text-xs font-bold px-2 py-1 text-center">CUENTA CANCELADA — NO PREPARAR</p>}
      <ul className="mt-3 space-y-2">
        {comanda.items.map((i) => (
          <li key={i.id} className={i.anulado || cancelada ? 'line-through opacity-60' : ''}>
            <p className="text-lg font-bold text-slate-900 leading-tight">{formatCantidad(i.cantidad)} × {i.nombre}{i.comensal ? <span className="ml-2 text-xs font-bold bg-slate-800 text-white rounded px-1.5 py-0.5 align-middle no-underline inline-block">P{i.comensal}</span> : null}{i.anulado && <span className="ml-2 text-[10px] font-bold border border-slate-700 rounded px-1 no-underline inline-block">ANULADO</span>}{demorados.has(i.id) && <span className="ml-2 text-[11px] font-bold bg-red-600 text-white rounded px-1.5 py-0.5 no-underline inline-block">Demorado +{demorados.get(i.id)} min</span>}</p>
            {(i.componentes || []).map((c) => <p key={c.nombre} className="text-sm text-slate-700 pl-6">• {formatCantidad(c.cantidad)} {c.nombre}</p>)}
            {i.modificadores.map((m) => <p key={m} className="text-sm text-slate-700 pl-6">+ {m}</p>)}
            {i.nota && <p className="text-sm font-bold text-amber-800 pl-6">» {i.nota}</p>}
          </li>
        ))}
      </ul>
      <footer className="mt-4 flex flex-wrap gap-2">
        {!lista ? (
          <button type="button" className="btn-primary flex-1 gap-2 py-3" disabled={ocupado} onClick={() => onEstado(comanda, 'LISTA')}><Check className="w-5 h-5" aria-hidden="true" /> {cancelada ? 'Descartar' : 'Lista'}</button>
        ) : (
          <>
            <button type="button" className="btn-primary flex-1 gap-2 py-3" disabled={ocupado} onClick={() => onEstado(comanda, 'ENTREGADA')}><Check className="w-5 h-5" aria-hidden="true" /> Entregada</button>
            <button type="button" className="btn-secondary gap-2" disabled={ocupado} onClick={() => onEstado(comanda, 'PENDIENTE')} aria-label={`Devolver la comanda ${comanda.id} a pendientes`}><Undo2 className="w-4 h-4" aria-hidden="true" /></button>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={() => onImprimir(comanda)} aria-label={`Imprimir la comanda ${comanda.id}`}><Printer className="w-4 h-4" aria-hidden="true" /></button>
      </footer>
    </article>
  );
};

const Cocina = () => {
  const qc = useQueryClient();
  const empresa = useAuthStore((s) => s.activeEmpresa);
  const ahora = useAhora(15_000);
  const [error, setError] = useState(null);
  const [estacion, setEstacion] = useState('');
  const { opcion, valores } = useOpciones();
  const alertas = opcion('cocina_alertas', false);
  const sonido = opcion('cocina_sonido', false);
  // Sin «Alertas de demora» la tarjeta se colorea como siempre (10 / 20 min, sin marcas por plato).
  const config = { alertas, amarillo: valores.cocina_amarillo_min, rojo: valores.cocina_rojo_min };
  const { data: todas = [], isLoading, isError, error: errCarga, aviso, quitarAviso, silenciado, setSilenciado } = useComandasConAviso({ avisar: sonido });

  const cambiar = useMutation({
    mutationFn: ({ id, estado }) => api.post(`/comandas/${id}/estado`, { estado }),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['empresa'] }); },
    onError: (err) => { setError(apiError(err, 'No se pudo cambiar el estado')); qc.invalidateQueries({ queryKey: ['empresa'] }); },
  });
  const onEstado = (c, estado) => cambiar.mutate({ id: c.id, estado });
  const onImprimir = (c) => imprimirComanda(c, { empresa: empresa?.nombre, reimpresion: true });

  // Una pantalla por estación (Cocina, Barra…): las pestañas salen de las estaciones que tienen comandas hoy.
  const estaciones = [...new Set(todas.map((c) => c.estacion).filter(Boolean))].sort();
  const activa = estaciones.includes(estacion) ? estacion : '';
  const comandas = activa ? todas.filter((c) => c.estacion === activa) : todas;
  const pendientes = comandas.filter((c) => c.estado === 'PENDIENTE');
  const listas = comandas.filter((c) => c.estado === 'LISTA');

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Cocina" description="Las comandas que envían los meseros. Márcalas como listas cuando salgan; se actualiza sola." />
      {estaciones.length > 1 && (
        <Tabs
          tabs={[{ id: '', label: `Todas (${todas.length})` }, ...estaciones.map((e) => ({ id: e, label: `${e} (${todas.filter((c) => c.estacion === e).length})` }))]}
          value={activa}
          onChange={setEstacion}
        />
      )}
      {sonido && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button" className="btn-secondary gap-2 text-sm" aria-pressed={silenciado}
            onClick={() => setSilenciado(!silenciado)}
          >
            {silenciado ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
            {silenciado ? 'Sonido silenciado en este equipo' : 'Silenciar el sonido en este equipo'}
          </button>
        </div>
      )}
      {aviso && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 text-sm font-semibold px-4 py-3">
          <Bell className="w-4 h-4" aria-hidden="true" />
          <span className="flex-1">Llegó una comanda nueva{aviso.cuentas.length > 0 ? `: ${aviso.cuentas.join(', ')}` : ''}.</span>
          <button type="button" className="text-xs font-semibold underline" onClick={quitarAviso}>Entendido</button>
        </p>
      )}
      <FormError message={error || (isError ? apiError(errCarga, 'No se pudieron cargar las comandas') : null)} onDismiss={() => setError(null)} />

      {isLoading ? (
        <p className="py-12 text-center text-slate-500" role="status">Cargando comandas…</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 items-start">
          <section aria-label="Pendientes">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><ChefHat className="w-5 h-5 text-brand-700" aria-hidden="true" /> Por preparar <span className="text-sm font-normal text-slate-500">({pendientes.length})</span></h3>
            {pendientes.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-slate-500">Sin comandas pendientes. 🎉</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendientes.map((c) => <Tarjeta key={c.id} comanda={c} ahora={ahora} config={config} onEstado={onEstado} onImprimir={onImprimir} ocupado={cambiar.isPending} />)}
              </div>
            )}
          </section>
          <section aria-label="Listas">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><BellRing className="w-5 h-5 text-emerald-700" aria-hidden="true" /> Listas para entregar <span className="text-sm font-normal text-slate-500">({listas.length})</span></h3>
            {listas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">Nada esperando al mesero.</p>
            ) : (
              <div className="space-y-4">
                {listas.map((c) => <Tarjeta key={c.id} comanda={c} ahora={ahora} config={config} onEstado={onEstado} onImprimir={onImprimir} ocupado={cambiar.isPending} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Cocina;
