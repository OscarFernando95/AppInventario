import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Armchair } from 'lucide-react';
import api from '../../api/axios';
import { apiError } from '../../utils/apiError';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';

/** Proporción del plano (ancho:alto): igual en el editor y en el tablero para que las mesas queden donde se pusieron. */
export const ASPECTO_PLANO = '16 / 10';

const limitar = (n) => Math.min(100, Math.max(0, Math.round(n)));

/**
 * Acomodar las mesas en el plano del local: se arrastran con el dedo o el mouse. Lo que no se ubica queda
 * «sin ubicar» (sigue disponible en la lista del tablero).
 */
const PlanoEditor = ({ mesas, onClose }) => {
  const qc = useQueryClient();
  const lienzo = useRef(null);
  const [pos, setPos] = useState(() => Object.fromEntries(mesas.map((m) => [m.id, m.pos_x != null && m.pos_y != null ? { x: m.pos_x, y: m.pos_y } : null])));
  const [arrastrando, setArrastrando] = useState(null);
  const [error, setError] = useState(null);

  const guardar = useMutation({
    mutationFn: () => api.put('/mesas/plano', { posiciones: mesas.map((m) => ({ id: m.id, x: pos[m.id]?.x ?? null, y: pos[m.id]?.y ?? null })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); onClose(); },
    onError: (err) => setError(apiError(err, 'No se pudo guardar el plano')),
  });

  const mover = (e) => {
    if (arrastrando == null || !lienzo.current) return;
    const r = lienzo.current.getBoundingClientRect();
    setPos((p) => ({ ...p, [arrastrando]: { x: limitar(((e.clientX - r.left) / r.width) * 100), y: limitar(((e.clientY - r.top) / r.height) * 100) } }));
  };
  const sinUbicar = mesas.filter((m) => !pos[m.id]);

  return (
    <Modal open onClose={onClose} title="Plano del local" size="4xl" description="Arrastra cada mesa al lugar donde está en tu local.">
      <div className="space-y-4">
        <FormError message={error} onDismiss={() => setError(null)} />
        <div
          ref={lienzo} role="application" aria-label="Plano del local"
          className="relative w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 select-none touch-none overflow-hidden"
          style={{ aspectRatio: ASPECTO_PLANO, backgroundImage: 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)', backgroundSize: '10% 10%' }}
          onPointerMove={mover} onPointerUp={() => setArrastrando(null)} onPointerLeave={() => setArrastrando(null)}
        >
          {mesas.filter((m) => pos[m.id]).map((m) => (
            <button
              key={m.id} type="button" aria-label={`Mesa ${m.nombre} en el plano`}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setArrastrando(m.id); }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-xl border-2 bg-white px-3 py-2 text-sm font-semibold shadow cursor-grab active:cursor-grabbing ${arrastrando === m.id ? 'border-brand-600 ring-2 ring-brand-300' : 'border-slate-300'}`}
              style={{ left: `${pos[m.id].x}%`, top: `${pos[m.id].y}%` }}
            >
              <Armchair className="w-4 h-4 text-slate-500" aria-hidden="true" /> {m.nombre}
            </button>
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1.5">Sin ubicar {sinUbicar.length > 0 ? `(${sinUbicar.length})` : ''}</p>
          {sinUbicar.length === 0 ? (
            <p className="text-xs text-slate-500">Todas las mesas están en el plano.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sinUbicar.map((m) => (
                <button key={m.id} type="button" className="btn-secondary text-xs" onClick={() => setPos((p) => ({ ...p, [m.id]: { x: 50, y: 50 } }))} aria-label={`Poner ${m.nombre} en el plano`}>
                  + {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary px-6" disabled={guardar.isPending} onClick={() => guardar.mutate()}>{guardar.isPending ? 'Guardando…' : 'Guardar plano'}</button>
        </ModalActions>
      </div>
    </Modal>
  );
};

export default PlanoEditor;
