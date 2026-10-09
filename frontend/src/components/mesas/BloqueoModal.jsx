import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import api from '../../api/axios';
import { apiError } from '../../utils/apiError';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { aInputLocal, cuandoCorto } from '../../utils/calendarioReservas';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';
import Field from '../ui/Field';

/**
 * Bloquear una mesa por un rato (evento, mantenimiento) y quitar los bloqueos. Se monta solo mientras está abierto, así
 * las horas por omisión (ahora y dentro de 2 horas) siempre son frescas. Solo lo ve quien puede configurar las mesas.
 */
const BloqueoModal = ({ mesas, onClose }) => {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({ mesaId: '', desde: aInputLocal(new Date()), hasta: aInputLocal(new Date(Date.now() + 2 * 3_600_000)), motivo: '' }));
  const [error, setError] = useState(null);
  const { data: bloqueos = [] } = useEmpresaQuery(['bloqueos'], '/bloqueos');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['empresa'] });

  const bloquear = useMutation({
    mutationFn: (payload) => api.post('/bloqueos', payload),
    onSuccess: () => { refrescar(); setError(null); setForm((f) => ({ ...f, mesaId: '', motivo: '' })); },
    onError: (err) => setError(apiError(err, 'No se pudo bloquear la mesa')),
  });
  const quitar = useMutation({
    mutationFn: (id) => api.delete(`/bloqueos/${id}`),
    onSuccess: () => { refrescar(); setError(null); },
    onError: (err) => setError(apiError(err, 'No se pudo quitar el bloqueo')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.mesaId) return setError('Elige la mesa.');
    if (!form.desde || !form.hasta) return setError('Indica desde cuándo y hasta cuándo.');
    bloquear.mutate({
      mesaId: Number(form.mesaId), desde: new Date(form.desde).toISOString(), hasta: new Date(form.hasta).toISOString(), motivo: form.motivo.trim() || undefined,
    });
  };

  return (
    <Modal open onClose={onClose} title="Bloqueo de mesas" size="lg">
      <div className="space-y-4">
        <FormError message={error} onDismiss={() => setError(null)} />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Mesa" required>
            <select className="input-field" autoFocus value={form.mesaId} onChange={(e) => setForm({ ...form, mesaId: e.target.value })}>
              <option value="">Elige una mesa…</option>
              {mesas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Field>
          <Field label="Motivo"><input className="input-field" maxLength={200} placeholder="Evento privado, mantenimiento…" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Field>
          <Field label="Desde" required><input type="datetime-local" className="input-field" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} /></Field>
          <Field label="Hasta" required><input type="datetime-local" className="input-field" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} /></Field>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary gap-2" disabled={bloquear.isPending}><Lock className="w-4 h-4" aria-hidden="true" /> Bloquear mesa</button>
          </div>
        </form>

        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Bloqueos vigentes y próximos</h4>
          {bloqueos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500">No hay mesas bloqueadas.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {bloqueos.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800">{b.mesa?.nombre}</span>
                    <span className="text-slate-500"> · de {cuandoCorto(b.desde)} a {cuandoCorto(b.hasta, b.desde)}{b.motivo ? ` · ${b.motivo}` : ''}</span>
                    {b.vigente && <span className="ml-2 text-[11px] font-semibold uppercase text-red-700">Bloqueada ahora</span>}
                  </span>
                  <button type="button" className="btn-secondary text-xs" disabled={quitar.isPending} aria-label={`Quitar el bloqueo de ${b.mesa?.nombre}`} onClick={() => quitar.mutate(b.id)}>Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ModalActions><button type="button" className="btn-primary px-6" onClick={onClose}>Listo</button></ModalActions>
      </div>
    </Modal>
  );
};

export default BloqueoModal;
