import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Hourglass, Plus, Phone, MessageCircle, Users } from 'lucide-react';
import api from '../../api/axios';
import { apiError } from '../../utils/apiError';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useAhora, hace } from '../../hooks/useAhora';
import { useAuthStore } from '../../store/authStore';
import { enlaceWhatsApp, mensajeMesaLista } from '../../utils/avisos';
import { textoHace } from '../../utils/calendarioReservas';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';
import Field from '../ui/Field';

const VACIO = { nombre: '', telefono: '', personas: '2', nota: '' };

/**
 * Lista de espera: clientes sin reserva que esperan mesa. Se anotan rápido, se les avisa por WhatsApp cuando se libera
 * una mesa y se sientan (abre la cuenta con sus comensales). Solo se muestra con la opción «Lista de espera» encendida.
 */
const ListaEspera = ({ mesas, onSentada }) => {
  const qc = useQueryClient();
  const nombreEmpresa = useAuthStore((st) => st.activeEmpresa?.nombre) || 'nuestro restaurante';
  const ahora = useAhora();
  const [form, setForm] = useState(VACIO);
  const [formError, setFormError] = useState(null);
  const [sentando, setSentando] = useState(null);
  const [mesaSentar, setMesaSentar] = useState('');
  const [errorSentar, setErrorSentar] = useState(null);

  const { data: espera = [] } = useEmpresaQuery(['lista-espera'], '/lista-espera', { refetchInterval: 15_000 });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['empresa'] });

  const agregar = useMutation({
    mutationFn: (payload) => api.post('/lista-espera', payload),
    onSuccess: () => { refrescar(); setForm(VACIO); setFormError(null); },
    onError: (err) => setFormError(apiError(err, 'No se pudo anotar en la lista')),
  });
  const cambiar = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/lista-espera/${id}`, { estado }),
    onSuccess: refrescar,
    onError: (err) => setFormError(apiError(err, 'No se pudo actualizar la lista')),
  });
  const sentar = useMutation({
    mutationFn: ({ id, mesaId }) => api.post(`/lista-espera/${id}/sentar`, { mesaId }),
    onSuccess: (res) => { refrescar(); setSentando(null); onSentada(res.data.id); },
    onError: (err) => { setErrorSentar(apiError(err, 'No se pudo sentar')); refrescar(); },
  });

  const handleAgregar = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) return setFormError('Indica el nombre de quien espera.');
    agregar.mutate({ nombre: form.nombre.trim(), telefono: form.telefono.trim() || undefined, personas: Number(form.personas) || 1, nota: form.nota.trim() || undefined });
  };
  // Mesa libre = sin cuenta y sin bloqueo vigente.
  const libres = mesas.filter((m) => !m.cuenta && !m.bloqueo?.vigente);

  return (
    <section aria-label="Lista de espera" className="space-y-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
        <Hourglass className="w-5 h-5 text-brand-700" aria-hidden="true" /> Lista de espera <span className="text-sm font-normal text-slate-500">({espera.length} esperando)</span>
      </h3>
      <form onSubmit={handleAgregar} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_6rem_1fr_auto] gap-3 items-end rounded-2xl border border-slate-200 bg-white p-3">
        <Field label="Nombre"><input className="input-field" maxLength={120} placeholder="Ana Gómez" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
        <Field label="Teléfono"><input className="input-field" maxLength={40} placeholder="300 111 2233" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Field>
        <Field label="Personas"><input type="number" min="1" className="input-field" value={form.personas} onChange={(e) => setForm({ ...form, personas: e.target.value })} /></Field>
        <Field label="Nota"><input className="input-field" maxLength={500} placeholder="Prefiere ventana…" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} /></Field>
        <button type="submit" className="btn-primary gap-2 mb-5" disabled={agregar.isPending}><Plus className="w-4 h-4" aria-hidden="true" /> Agregar a la lista</button>
      </form>
      <FormError message={formError} onDismiss={() => setFormError(null)} />

      {espera.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">Nadie está esperando mesa.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {espera.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-semibold text-slate-800">{e.nombre}</span>
                <span className="text-slate-500"> · <Users className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" /> {e.personas} {e.personas === 1 ? 'persona' : 'personas'}</span>
                <span className="ml-2 text-xs font-semibold text-amber-700">{textoHace(hace(e.creada_en, ahora))}</span>
                {e.telefono && <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500"><Phone className="w-3 h-3" aria-hidden="true" />{e.telefono}</span>}
                {e.nota && <span className="block text-xs text-slate-500">{e.nota}</span>}
              </span>
              <span className="flex flex-wrap gap-2">
                {e.telefono && (
                  <a
                    href={enlaceWhatsApp(e.telefono, mensajeMesaLista(e.nombre, nombreEmpresa))} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary text-xs gap-1" aria-label={`Avisar a ${e.nombre} por WhatsApp`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> Avisar por WhatsApp
                  </a>
                )}
                <button type="button" className="btn-primary text-xs" aria-label={`Sentar a ${e.nombre}`} onClick={() => { setErrorSentar(null); setMesaSentar(''); setSentando(e); }}>Sentar</button>
                <button type="button" className="btn-secondary text-xs" disabled={cambiar.isPending} aria-label={`${e.nombre} no llegó`} onClick={() => cambiar.mutate({ id: e.id, estado: 'NO_LLEGO' })}>No llegó</button>
                <button type="button" className="btn-secondary text-xs" disabled={cambiar.isPending} aria-label={`Quitar a ${e.nombre} de la lista`} onClick={() => cambiar.mutate({ id: e.id, estado: 'CANCELADO' })}>Cancelar</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!sentando} onClose={() => setSentando(null)} title={`Sentar a ${sentando?.nombre ?? ''}`} size="md">
        <form onSubmit={(ev) => { ev.preventDefault(); setErrorSentar(null); sentar.mutate({ id: sentando.id, mesaId: Number(mesaSentar) }); }} className="space-y-4">
          <FormError message={errorSentar} onDismiss={() => setErrorSentar(null)} />
          <Field label="Mesa libre" required>
            <select className="input-field" autoFocus value={mesaSentar} onChange={(ev) => setMesaSentar(ev.target.value)}>
              <option value="">Elige una mesa…</option>
              {libres.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.capacidad ? ` (${m.capacidad} puestos)` : ''}</option>)}
            </select>
          </Field>
          <p className="text-xs text-slate-500">Se abre la cuenta con {sentando?.personas} comensal(es).</p>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setSentando(null)}>Volver</button>
            <button type="submit" className="btn-primary px-6" disabled={!mesaSentar || sentar.isPending}>Abrir cuenta</button>
          </ModalActions>
        </form>
      </Modal>
    </section>
  );
};

export default ListaEspera;
