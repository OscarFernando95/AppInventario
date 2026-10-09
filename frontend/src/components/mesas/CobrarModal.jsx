import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Wallet, Minus, Plus } from 'lucide-react';
import api from '../../api/axios';
import { formatCOP, formatCantidad } from '../../utils/format';
import { MEDIOS_PAGO } from '../../utils/mediosPago';
import { apiError } from '../../utils/apiError';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useOpciones } from '../../hooks/useOpciones';
import { useAuthStore } from '../../store/authStore';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';
import Field from '../ui/Field';

/** Propina sugerida: porcentaje del consumo, a los 100 pesos más cercanos. */
const propinaDe = (base, pct) => Math.round((base * pct) / 100 / 100) * 100;

/** Opciones de propina: ninguna, la sugerida por la empresa (si hay) y un valor libre. */
const opcionesDePropina = (pct) => [
  ['0', 'Sin propina'],
  ...(Number(pct) > 0 ? [[String(Number(pct)), `${Number(pct).toLocaleString('es-CO')} %`]] : []),
  ['OTRO', 'Otro valor'],
];

/**
 * Cobro de una cuenta: se eligen los ítems (y cuántas unidades) que paga esta persona —dividir la cuenta
 * es cobrar varias veces—, se define cliente, forma de pago y propina voluntaria.
 */
const CobrarModal = ({ cuenta, propinaPct = 10, persona = null, onClose, onCobrado }) => {
  const qc = useQueryClient();
  const modulos = useAuthStore((s) => s.activeEmpresa?.modulos) || [];
  const { opcion } = useOpciones();
  const conPropina = opcion('propina', true);
  const conPersonas = opcion('cuenta_por_persona', true);
  const conCaja = modulos.includes('Caja');
  const conCredito = modulos.includes('Cuentas por cobrar');

  const pendientes = useMemo(() => cuenta.items.filter((i) => i.estado === 'ACTIVO' && !i.ventaId), [cuenta.items]);
  // Se abre con todo seleccionado, o solo con lo de una persona si se cobra «por persona».
  const [seleccion, setSeleccion] = useState(() => Object.fromEntries(pendientes.filter((i) => persona == null || i.comensal === persona).map((i) => [i.id, i.cantidad])));
  const personas = conPersonas ? [...new Set(pendientes.map((i) => i.comensal).filter((c) => c != null))].sort((a, b) => a - b) : [];
  const [form, setForm] = useState({ clienteId: cuenta.cliente?.id ? String(cuenta.cliente.id) : '', forma_pago: '1', medio_pago: '10', dias_credito: '30', descuento: '', propina: '0', propinaOtro: '', partes: '' });
  const [formError, setFormError] = useState(null);

  const { data: clientes = [] } = useEmpresaQuery(['clientes'], '/clientes', { enabled: modulos.includes('Clientes') });
  const { data: cajaActual, isLoading: cargandoCaja } = useEmpresaQuery(['caja', 'actual'], '/caja/actual', { enabled: conCaja });
  const sinCaja = conCaja && !cargandoCaja && !cajaActual;

  const consumo = pendientes.reduce((a, i) => a + (Number(seleccion[i.id]) || 0) * i.precio_unitario, 0);
  const descuento = Math.min(100, Math.max(0, Number(form.descuento) || 0));
  const neto = consumo * (1 - descuento / 100);
  const propina = !conPropina ? 0 : form.propina === 'OTRO' ? Math.max(0, Number(form.propinaOtro) || 0) : propinaDe(neto, Number(form.propina));
  const aPagar = neto + propina;
  const partes = Math.max(0, Math.floor(Number(form.partes) || 0));
  const seleccionados = pendientes.filter((i) => Number(seleccion[i.id]) > 0);
  const esTodo = pendientes.every((i) => Number(seleccion[i.id]) === i.cantidad);

  const cobrar = useMutation({
    mutationFn: (payload) => api.post(`/cuentas/${cuenta.id}/cobrar`, payload),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['empresa'] }); onCobrado(res.data); },
    onError: (err) => { setFormError(apiError(err, 'No se pudo cobrar')); qc.invalidateQueries({ queryKey: ['empresa'] }); },
  });

  const cambiarCantidad = (item, valor) => {
    const n = Math.min(item.cantidad, Math.max(0, valor));
    setSeleccion((s) => ({ ...s, [item.id]: Math.round(n * 1000) / 1000 }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (seleccionados.length === 0) return setFormError('Elige al menos un ítem para cobrar.');
    if (form.forma_pago === '2' && !form.clienteId) return setFormError('Una venta a crédito necesita un cliente.');
    cobrar.mutate({
      items: esTodo ? undefined : seleccionados.map((i) => ({ itemId: i.id, cantidad: Number(seleccion[i.id]) })),
      clienteId: form.clienteId ? Number(form.clienteId) : undefined,
      forma_pago: form.forma_pago,
      medio_pago: form.medio_pago,
      dias_credito: form.forma_pago === '2' ? (Number(form.dias_credito) || 0) : undefined,
      descuento_global: descuento || undefined,
      propina: propina || undefined,
    });
  };

  return (
    <Modal open onClose={onClose} title={`Cobrar · ${cuenta.nombre}`} size="2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormError message={formError} onDismiss={() => setFormError(null)} />
        {sinCaja && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Wallet className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-48">Para cobrar necesitas una caja abierta.</span>
            <Link to="/app/caja" className="btn-primary px-4 py-2 text-sm">Ir a Caja</Link>
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 mb-2">¿Qué paga esta persona?</legend>
          <div className="flex gap-2 mb-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setSeleccion(Object.fromEntries(pendientes.map((i) => [i.id, i.cantidad])))}>Toda la cuenta</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setSeleccion({})}>Ninguno</button>
            {personas.map((n) => (
              <button
                key={n} type="button" className="btn-secondary text-xs" aria-label={`Seleccionar lo de la persona ${n}`}
                onClick={() => setSeleccion(Object.fromEntries(pendientes.filter((i) => i.comensal === n).map((i) => [i.id, i.cantidad])))}
              >
                Persona {n}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
            {pendientes.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-slate-800">{i.nombre}</span>
                  {i.modificadores.length > 0 && <span className="block text-xs text-slate-500">+ {i.modificadores.map((m) => m.nombre).join(', ')}</span>}
                  <span className="block text-xs text-slate-500">{formatCOP(i.precio_unitario)} c/u · de {formatCantidad(i.cantidad)}{i.comensal ? ` · Persona ${i.comensal}` : ''}</span>
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-icon" aria-label={`Menos ${i.nombre}`} onClick={() => cambiarCantidad(i, (Number(seleccion[i.id]) || 0) - 1)}><Minus className="w-4 h-4" /></button>
                  <input
                    type="number" min="0" max={i.cantidad} step="any" aria-label={`Cantidad a cobrar de ${i.nombre}`}
                    className="input-field w-16 text-center px-1" value={seleccion[i.id] ?? 0} onChange={(e) => cambiarCantidad(i, Number(e.target.value))}
                  />
                  <button type="button" className="btn-icon" aria-label={`Más ${i.nombre}`} onClick={() => cambiarCantidad(i, (Number(seleccion[i.id]) || 0) + 1)}><Plus className="w-4 h-4" /></button>
                </span>
                <span className="w-24 text-right font-semibold text-slate-800">{formatCOP((Number(seleccion[i.id]) || 0) * i.precio_unitario)}</span>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modulos.includes('Clientes') && (
            <Field label="Cliente" hint={form.forma_pago === '2' ? undefined : 'Opcional: sin cliente, la venta queda a consumidor final.'} required={form.forma_pago === '2'}>
              <select className="input-field" value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
          )}
          <Field label="Descuento (%)">
            <input type="number" min="0" max="100" step="any" className="input-field" placeholder="0" value={form.descuento} onChange={(e) => setForm({ ...form, descuento: e.target.value })} />
          </Field>
          <Field label="Forma de pago">
            <select className="input-field" value={form.forma_pago} onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}>
              <option value="1">Contado</option>
              {conCredito && <option value="2">Crédito</option>}
            </select>
          </Field>
          {form.forma_pago === '2' ? (
            <Field label="Plazo (días)">
              <input type="number" min="0" max="365" className="input-field" value={form.dias_credito} onChange={(e) => setForm({ ...form, dias_credito: e.target.value })} />
            </Field>
          ) : (
            <Field label="Medio de pago">
              <select className="input-field" value={form.medio_pago} onChange={(e) => setForm({ ...form, medio_pago: e.target.value })}>
                {Object.entries(MEDIOS_PAGO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
        </div>

        {conPropina && <fieldset>
          <legend className="text-sm font-semibold text-slate-700 mb-2">Propina voluntaria</legend>
          <div role="radiogroup" className="flex flex-wrap gap-2 items-center">
            {opcionesDePropina(propinaPct).map(([valor, etiqueta]) => (
              <label key={valor} className={`rounded-xl border px-3 py-2 text-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-600 ${form.propina === valor ? 'bg-brand-50 border-brand-200 font-semibold' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" className="sr-only" name="propina" checked={form.propina === valor} onChange={() => setForm({ ...form, propina: valor })} />
                {etiqueta}{valor !== '0' && valor !== 'OTRO' && <span className="text-slate-500 font-normal"> · {formatCOP(propinaDe(neto, Number(valor)))}</span>}
              </label>
            ))}
            {form.propina === 'OTRO' && (
              <input type="number" min="0" step="100" aria-label="Valor de la propina" className="input-field w-32" autoFocus placeholder="$" value={form.propinaOtro} onChange={(e) => setForm({ ...form, propinaOtro: e.target.value })} />
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">La propina no es parte de la venta ni de los ingresos: se muestra aparte y se entrega al personal.</p>
        </fieldset>}

        <dl className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
          <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Consumo{descuento ? ` (−${descuento} %)` : ''}</dt><dd className="font-semibold">{formatCOP(neto)}</dd></div>
          {conPropina && <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Propina</dt><dd className="font-semibold">{formatCOP(propina)}</dd></div>}
          <div className="flex justify-between px-4 py-3 bg-brand-50"><dt className="font-semibold text-brand-800">Total a pagar</dt><dd className="text-lg font-bold text-brand-800">{formatCOP(aPagar)}</dd></div>
        </dl>

        <div className="flex flex-wrap items-end gap-3 text-sm">
          <Field label="Dividir en partes iguales (solo calcula)" className="w-56">
            <input type="number" min="2" className="input-field" placeholder="Nº de personas" value={form.partes} onChange={(e) => setForm({ ...form, partes: e.target.value })} />
          </Field>
          {partes >= 2 && <p className="pb-2.5 text-slate-700">Cada uno paga <strong>{formatCOP(Math.ceil(aPagar / partes / 100) * 100)}</strong> <span className="text-slate-500">(para cobrar por separado, elige los ítems de cada uno)</span></p>}
        </div>

        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Volver</button>
          <button type="submit" className="btn-primary px-6" disabled={cobrar.isPending || sinCaja || seleccionados.length === 0}>
            {cobrar.isPending ? 'Cobrando…' : `Cobrar ${formatCOP(aPagar)}`}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
};

export default CobrarModal;
