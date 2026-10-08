import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Armchair, ShoppingBag, Plus, Settings2, Users, ChefHat, Clock, Pencil } from 'lucide-react';
import api from '../../api/axios';
import { formatCOP } from '../../utils/format';
import { apiError } from '../../utils/apiError';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { usePermisos } from '../../hooks/usePermisos';
import { useAhora, hace } from '../../hooks/useAhora';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';
import Field from '../ui/Field';
import { TableState } from '../ui/DataState';

/** Indicadores de cocina de una cuenta: lo que se pidió y aún no sale. */
const EstadoCocina = ({ c }) => {
  if (c.por_enviar > 0) return <span className="text-amber-700 font-semibold">{c.por_enviar} por enviar</span>;
  if (c.comandas_listas > 0) return <span className="text-emerald-700 font-semibold">Lista en cocina</span>;
  if (c.comandas_pendientes > 0) return <span className="text-sky-700 font-semibold">En preparación</span>;
  return null;
};

const TarjetaCuenta = ({ cuenta, ahora, onAbrir, icono, titulo }) => {
  const Icono = icono;
  return (
    <button
      type="button" onClick={() => onAbrir(cuenta.id)} aria-label={`Abrir la cuenta de ${titulo}`}
      className="text-left rounded-2xl border border-brand-200 bg-brand-50/60 p-4 hover:bg-brand-50 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-slate-800 min-w-0"><Icono className="w-5 h-5 text-brand-700 shrink-0" aria-hidden="true" /><span className="truncate">{titulo}</span></span>
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-700 text-white rounded px-1.5 py-0.5">Ocupada</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3">{formatCOP(cuenta.total)}</p>
      <div className="mt-1 text-xs text-slate-600 space-y-0.5">
        <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> {hace(cuenta.abierta_en, ahora)} · {cuenta.mesero?.nombre}</p>
        {cuenta.comensales ? <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" aria-hidden="true" /> {cuenta.comensales} comensales</p> : null}
        <p className="flex items-center gap-1.5"><ChefHat className="w-3.5 h-3.5" aria-hidden="true" /> {cuenta.num_items} ítem(s) <EstadoCocina c={cuenta} /></p>
      </div>
    </button>
  );
};

/** Crear / renombrar / desactivar mesas. */
const ConfigurarMesas = ({ abierto, onClose }) => {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(['mesas', 'todas'], async () => (await api.get('/mesas', { params: { todas: 1 } })).data, { enabled: abierto });
  const [form, setForm] = useState({ id: null, nombre: '', capacidad: '' });
  const [formError, setFormError] = useState(null);

  const guardar = useMutation({
    mutationFn: ({ id, ...payload }) => (id ? api.put(`/mesas/${id}`, payload) : api.post('/mesas', payload)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); setForm({ id: null, nombre: '', capacidad: '' }); setFormError(null); },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar la mesa')),
  });
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return setFormError('Indica el nombre de la mesa.');
    guardar.mutate({ id: form.id, nombre: form.nombre.trim(), capacidad: form.capacidad === '' ? null : Number(form.capacidad) });
  };
  const mesas = data?.mesas || [];

  return (
    <Modal open={abierto} onClose={onClose} title="Configurar mesas" size="lg">
      <div className="space-y-4">
        <FormError message={formError} onDismiss={() => setFormError(null)} />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-3 items-end">
          <Field label={form.id ? 'Nombre de la mesa' : 'Nueva mesa'}>
            <input className="input-field" maxLength={60} placeholder="Mesa 1, Terraza 2, Barra…" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Puestos">
            <input type="number" min="1" className="input-field" placeholder="4" value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            {form.id && <button type="button" className="btn-secondary" onClick={() => setForm({ id: null, nombre: '', capacidad: '' })}>Cancelar</button>}
            <button type="submit" className="btn-primary gap-2" disabled={guardar.isPending}><Plus className="w-4 h-4" aria-hidden="true" /> {form.id ? 'Guardar' : 'Agregar'}</button>
          </div>
        </form>

        <table className="w-full text-sm">
          <tbody>
            <TableState colSpan={3} isLoading={isLoading} isError={isError} error={error} onRetry={refetch} isEmpty={mesas.length === 0} emptyIcon={Armchair} emptyTitle="Aún no hay mesas" emptyHint="Agrega la primera arriba." />
            {mesas.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className={`py-2 font-medium ${m.activa ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{m.nombre}</td>
                <td className="py-2 text-slate-500">{m.capacidad ? `${m.capacidad} puestos` : ''}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button type="button" className="btn-icon" aria-label={`Editar ${m.nombre}`} onClick={() => setForm({ id: m.id, nombre: m.nombre, capacidad: m.capacidad ?? '' })}><Pencil className="w-4 h-4" /></button>
                  <button
                    type="button" className="btn-secondary text-xs ml-2" disabled={guardar.isPending}
                    onClick={() => guardar.mutate({ id: m.id, nombre: m.nombre, capacidad: m.capacidad, activa: !m.activa })}
                  >
                    {m.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ModalActions><button type="button" className="btn-primary px-6" onClick={onClose}>Listo</button></ModalActions>
      </div>
    </Modal>
  );
};

/** Tablero de mesas: libres y ocupadas, con la cuenta de cada una, y las cuentas para llevar. */
const Tablero = ({ onAbrir }) => {
  const { can } = usePermisos();
  const ahora = useAhora();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(['mesas'], '/mesas', { refetchInterval: 10_000 });
  const [nueva, setNueva] = useState(null); // { mesa } | { llevar: true }
  const [datos, setDatos] = useState({ comensales: '', etiqueta: '' });
  const [formError, setFormError] = useState(null);
  const [config, setConfig] = useState(false);

  const abrir = useMutation({
    mutationFn: (payload) => api.post('/cuentas', payload),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['empresa'] }); setNueva(null); setDatos({ comensales: '', etiqueta: '' }); onAbrir(res.data.id); },
    onError: (err) => { setFormError(apiError(err, 'No se pudo abrir la cuenta')); qc.invalidateQueries({ queryKey: ['empresa'] }); },
  });
  const cerrarModal = () => { setNueva(null); setFormError(null); setDatos({ comensales: '', etiqueta: '' }); };
  const handleAbrir = (e) => {
    e.preventDefault();
    setFormError(null);
    if (nueva.llevar && !datos.etiqueta.trim()) return setFormError('Escribe a quién va la cuenta (p. ej. «Para llevar · Juan»).');
    abrir.mutate({
      mesaId: nueva.mesa?.id,
      etiqueta: nueva.llevar ? datos.etiqueta.trim() : undefined,
      comensales: datos.comensales ? Number(datos.comensales) : undefined,
    });
  };

  const mesas = data?.mesas || [];
  const llevar = data?.sin_mesa || [];
  const ocupadas = mesas.filter((m) => m.cuenta).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong>{ocupadas}</strong> de {mesas.length} mesas ocupadas{llevar.length ? ` · ${llevar.length} para llevar` : ''}. Se actualiza solo.
        </p>
        <div className="flex gap-2">
          {can('mesas.gestionar') && <button type="button" className="btn-secondary gap-2" onClick={() => setConfig(true)}><Settings2 className="w-4 h-4" aria-hidden="true" /> Configurar mesas</button>}
          <button type="button" className="btn-primary gap-2" onClick={() => { setFormError(null); setNueva({ llevar: true }); }}><ShoppingBag className="w-4 h-4" aria-hidden="true" /> Cuenta para llevar</button>
        </div>
      </div>

      {(isLoading || isError || mesas.length === 0) && (
        <div className="card-container"><table className="w-full"><tbody>
          <TableState colSpan={1} isLoading={isLoading} isError={isError} error={error} onRetry={refetch} isEmpty={mesas.length === 0} emptyIcon={Armchair} emptyTitle="Aún no hay mesas" emptyHint={can('mesas.gestionar') ? 'Créalas con «Configurar mesas».' : 'Pídele al administrador que cree las mesas.'} />
        </tbody></table></div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {mesas.map((m) => (m.cuenta ? (
          <TarjetaCuenta key={m.id} cuenta={m.cuenta} ahora={ahora} onAbrir={onAbrir} icono={Armchair} titulo={m.nombre} />
        ) : (
          <button
            key={m.id} type="button" onClick={() => { setFormError(null); setNueva({ mesa: m }); }} aria-label={`Abrir cuenta en ${m.nombre}`}
            className="text-left rounded-2xl border border-dashed border-slate-300 bg-white p-4 hover:border-brand-400 hover:bg-brand-50/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-bold text-slate-700"><Armchair className="w-5 h-5 text-slate-400" aria-hidden="true" />{m.nombre}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5">Libre</span>
            </span>
            <p className="mt-6 text-sm text-slate-500">{m.capacidad ? `${m.capacidad} puestos · ` : ''}Toca para abrir cuenta</p>
          </button>
        )))}
      </div>

      {llevar.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-3">Para llevar</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {llevar.map((c) => <TarjetaCuenta key={c.id} cuenta={c} ahora={ahora} onAbrir={onAbrir} icono={ShoppingBag} titulo={c.nombre} />)}
          </div>
        </div>
      )}

      <Modal open={!!nueva} onClose={cerrarModal} title={nueva?.llevar ? 'Cuenta para llevar' : `Abrir cuenta · ${nueva?.mesa?.nombre ?? ''}`} size="md">
        <form onSubmit={handleAbrir} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          {nueva?.llevar && (
            <Field label="¿A nombre de quién?" required>
              <input className="input-field" autoFocus maxLength={80} placeholder="Para llevar · Juan" value={datos.etiqueta} onChange={(e) => setDatos({ ...datos, etiqueta: e.target.value })} />
            </Field>
          )}
          <Field label="Comensales (opcional)">
            <input type="number" min="1" className="input-field" autoFocus={!nueva?.llevar} value={datos.comensales} onChange={(e) => setDatos({ ...datos, comensales: e.target.value })} />
          </Field>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={cerrarModal}>Cancelar</button>
            <button type="submit" className="btn-primary px-6" disabled={abrir.isPending}>{abrir.isPending ? 'Abriendo…' : 'Abrir cuenta'}</button>
          </ModalActions>
        </form>
      </Modal>

      <ConfigurarMesas abierto={config} onClose={() => setConfig(false)} />
    </div>
  );
};

export default Tablero;
