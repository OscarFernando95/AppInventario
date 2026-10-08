import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Banknote, FileDown, History, HandCoins, Ban, PackageCheck } from 'lucide-react';
import { formatCOP } from '../../utils/format';
import { MEDIOS_PAGO } from '../../utils/mediosPago';
import { generateEstadoCuentaPDF } from '../../utils/generateEstadoCuentaPDF';
import { useAuthStore } from '../../store/authStore';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

/**
 * Cuentas por cobrar (lo que deben los clientes) y por pagar (lo que se debe a proveedores) comparten
 * la misma pantalla: cambian los textos, los endpoints y la forma de registrar el abono / pago.
 */
const LIMIT = 20;

const CONFIG = {
  COBRAR: {
    titulo: 'Cuentas por cobrar',
    descripcion: 'Ventas a crédito: lo que cada cliente debe, cuánto ha abonado y qué está vencido.',
    endpoint: '/cuentas-por-cobrar',
    tercero: 'Cliente',
    terceroKey: 'cliente',
    filtro: 'clienteId',
    listaTerceros: '/clientes',
    moduloTerceros: 'Clientes',
    prefijo: 'FACT-',
    movimientos: 'abonos',
    tituloAccion: 'Registrar abono',
    botonAccion: 'Abonar',
    pagadoLabel: 'Abonado',
    resumenTotal: 'Por cobrar',
    vacio: 'Nadie te debe por ahora',
    vacioHint: 'Las ventas a crédito aparecen aquí hasta que el cliente las pague.',
    estadoCuenta: (id) => `/cuentas-por-cobrar/clientes/${id}/estado-cuenta`,
  },
  PAGAR: {
    titulo: 'Cuentas por pagar',
    descripcion: 'Compras a crédito: lo que se le debe a cada proveedor, lo que ya se pagó y qué está vencido.',
    endpoint: '/cuentas-por-pagar',
    tercero: 'Proveedor',
    terceroKey: 'proveedor',
    filtro: 'proveedorId',
    listaTerceros: '/proveedores',
    moduloTerceros: 'Proveedores',
    prefijo: 'COMP-',
    movimientos: 'pagos',
    tituloAccion: 'Registrar pago',
    botonAccion: 'Pagar',
    pagadoLabel: 'Pagado',
    resumenTotal: 'Por pagar',
    vacio: 'No debes nada a proveedores',
    vacioHint: 'Las compras a crédito aparecen aquí hasta que las pagues.',
    estadoCuenta: (id) => `/cuentas-por-pagar/proveedores/${id}/estado-cuenta`,
  },
};

const TRAMOS = [
  ['POR_VENCER', 'Por vencer', 'bg-emerald-50 text-emerald-800 border-emerald-100'],
  ['D1_30', '1 – 30 días', 'bg-amber-50 text-amber-800 border-amber-100'],
  ['D31_60', '31 – 60 días', 'bg-orange-50 text-orange-800 border-orange-100'],
  ['D61_90', '61 – 90 días', 'bg-red-50 text-red-800 border-red-100'],
  ['MAS_90', 'Más de 90', 'bg-red-100 text-red-900 border-red-200'],
];

const fmtDia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const Estado = ({ fila }) => {
  if (fila.saldo_pendiente <= 0) return <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">PAGADA</span>;
  if (fila.vencida) return <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 whitespace-nowrap">Vencida {fila.dias_mora} d</span>;
  if (fila.dias_mora === 0) return <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">Vence hoy</span>;
  return <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 whitespace-nowrap">Vence en {-fila.dias_mora} d</span>;
};

const Cartera = ({ tipo }) => {
  const cfg = CONFIG[tipo];
  const cobrar = tipo === 'COBRAR';
  const queryClient = useQueryClient();
  const esAdmin = useAuthStore((s) => s.user?.rol === 'FRONT_ADMIN');
  const activeEmpresa = useAuthStore((s) => s.activeEmpresa);
  const modulos = activeEmpresa?.modulos || [];
  const conCaja = modulos.includes('Caja');

  const [estado, setEstado] = useState('PENDIENTES');
  const [terceroId, setTerceroId] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [registrando, setRegistrando] = useState(null); // fila a la que se le registra el abono / pago
  const [form, setForm] = useState({ monto: '', medio: '10', origen: 'OTRO', nota: '' });
  const [viendo, setViendo] = useState(null); // fila cuyos movimientos se muestran

  const params = () => ({ estado, ...(terceroId ? { [cfg.filtro]: terceroId } : {}), limit: LIMIT, offset });
  const { data: lista, isLoading, isError, error: errLista, refetch } = useEmpresaQuery([`cartera-${tipo}`, estado, terceroId, offset], async () => {
    const res = await api.get(cfg.endpoint, { params: params() });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const { data: resumen } = useEmpresaQuery([`cartera-${tipo}`, 'resumen'], `${cfg.endpoint}/resumen`);
  const { data: terceros = [] } = useEmpresaQuery([cfg.listaTerceros], cfg.listaTerceros, { enabled: modulos.includes(cfg.moduloTerceros) });
  const { data: cajaActual } = useEmpresaQuery(['caja', 'actual'], '/caja/actual', { enabled: conCaja });
  const { data: movimientos = [] } = useEmpresaQuery(
    [`cartera-${tipo}`, 'movimientos', viendo?.id], `${cfg.endpoint}/${viendo?.id}/${cfg.movimientos}`, { enabled: !!viendo }
  );

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });
  const filas = lista?.rows || [];

  const registrar = useMutation({
    mutationFn: ({ id, payload }) => api.post(`${cfg.endpoint}/${id}/${cfg.movimientos}`, payload),
    onSuccess: (res) => {
      invalidar();
      setRegistrando(null);
      setError(null);
      setAviso(res.data.saldo_pendiente > 0
        ? `${cobrar ? 'Abono' : 'Pago'} registrado. Saldo pendiente: ${formatCOP(res.data.saldo_pendiente)}.`
        : `${cobrar ? 'Abono' : 'Pago'} registrado: la ${cobrar ? 'venta' : 'compra'} quedó pagada.`);
    },
    onError: (err) => setError(apiError(err, `No se pudo registrar el ${cobrar ? 'abono' : 'pago'}`)),
  });

  const anular = useMutation({
    mutationFn: (id) => api.post(`${cfg.endpoint}/${cfg.movimientos}/${id}/anular`),
    onSuccess: () => { invalidar(); setError(null); setAviso(`${cobrar ? 'Abono' : 'Pago'} anulado: la deuda volvió a subir.`); },
    onError: (err) => setError(apiError(err, 'No se pudo anular')),
  });

  const abrirRegistro = (fila) => {
    setError(null);
    setForm({ monto: String(fila.saldo_pendiente), medio: '10', origen: 'OTRO', nota: '' });
    setRegistrando(fila);
  };

  const enviar = (e) => {
    e.preventDefault();
    setError(null);
    const monto = Number(form.monto);
    if (!(monto > 0)) return setError('El monto debe ser mayor a 0.');
    if (monto > registrando.saldo_pendiente + 0.005) return setError(`El monto supera el saldo pendiente (${formatCOP(registrando.saldo_pendiente)}).`);
    registrar.mutate({
      id: registrando.id,
      payload: cobrar
        ? { monto, medio_pago: form.medio, nota: form.nota || undefined }
        : { monto, origen: form.origen, nota: form.nota || undefined },
    });
  };

  const descargarEstadoCuenta = async (fila) => {
    try {
      const { data } = await api.get(cfg.estadoCuenta(fila[cfg.terceroKey].id));
      generateEstadoCuentaPDF(tipo, data, activeEmpresa);
    } catch (err) {
      setError(apiError(err, 'No se pudo generar el estado de cuenta'));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={cfg.titulo} description={cfg.descripcion} />

      {aviso && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{aviso}</span>
          <button type="button" className="btn-icon" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>×</button>
        </div>
      )}
      {error && !registrando && <FormError message={error} onDismiss={() => setError(null)} />}

      <section aria-label="Resumen de cartera" className="space-y-3">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card-container p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cfg.resumenTotal}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{formatCOP(resumen?.total ?? 0)}</p>
          </div>
          <div className="card-container p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vencido</p>
            <p className={`text-2xl font-bold mt-1 ${(resumen?.vencido ?? 0) > 0 ? 'text-red-700' : 'text-slate-800'}`}>{formatCOP(resumen?.vencido ?? 0)}</p>
          </div>
          <div className="card-container p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cobrar ? 'Clientes con deuda' : 'Proveedores con deuda'}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{(cobrar ? resumen?.clientes_con_deuda : resumen?.proveedores_con_deuda) ?? 0}</p>
          </div>
          <div className="card-container p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cobrar ? 'Mayor deudor' : 'Mayor acreedor'}</p>
            <p className="text-base font-bold text-slate-800 mt-1 truncate">{(cobrar ? resumen?.por_cliente : resumen?.por_proveedor)?.[0]?.nombre || '—'}</p>
            <p className="text-xs text-slate-500">{formatCOP((cobrar ? resumen?.por_cliente : resumen?.por_proveedor)?.[0]?.saldo ?? 0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="Envejecimiento de cartera">
          {TRAMOS.map(([clave, etiqueta, tono]) => (
            <div key={clave} className={`rounded-xl border p-3 ${tono}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{etiqueta}</p>
              <p className="text-lg font-bold">{formatCOP(resumen?.[clave] ?? 0)}</p>
            </div>
          ))}
        </div>
      </section>

      <FilterBar hayFiltros={estado !== 'PENDIENTES' || !!terceroId} onLimpiar={() => { setEstado('PENDIENTES'); setTerceroId(''); setOffset(0); }}>
        <Field label="Estado" className="w-full sm:w-44">
          <select className="input-field" value={estado} onChange={(e) => { setOffset(0); setEstado(e.target.value); }}>
            <option value="PENDIENTES">Con saldo</option>
            <option value="VENCIDAS">Vencidas</option>
            <option value="PAGADAS">Pagadas</option>
            <option value="TODAS">Todas</option>
          </select>
        </Field>
        {modulos.includes(cfg.moduloTerceros) && (
          <Field label={cfg.tercero} className="w-full sm:w-64">
            <select className="input-field" value={terceroId} onChange={(e) => { setOffset(0); setTerceroId(e.target.value); }}>
              <option value="">Todos</option>
              {terceros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </Field>
        )}
      </FilterBar>

      <TableCard>
        <THead>
          <Th>{cobrar ? 'Factura' : 'Compra'}</Th>
          <Th>{cfg.tercero}</Th>
          <Th>Emisión</Th>
          <Th>Vence</Th>
          <Th align="right">Total</Th>
          <Th align="right">{cfg.pagadoLabel}</Th>
          <Th align="right">Saldo</Th>
          <Th align="center">Estado</Th>
          <Th align="right">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={9} isLoading={isLoading} isError={isError} error={errLista} onRetry={refetch}
            isEmpty={filas.length === 0} emptyIcon={PackageCheck}
            emptyTitle={estado === 'PENDIENTES' && !terceroId ? cfg.vacio : 'Sin resultados para este filtro'}
            emptyHint={estado === 'PENDIENTES' && !terceroId ? cfg.vacioHint : 'Prueba con otro estado o ' + cfg.tercero.toLowerCase() + '.'}
          />
          {filas.map((f) => (
            <Tr key={f.id}>
              <Td className="font-mono text-xs text-slate-600 whitespace-nowrap">#{cfg.prefijo}{String(f.id).padStart(4, '0')}</Td>
              <Td className="font-medium text-slate-800">{f[cfg.terceroKey]?.nombre || '—'}</Td>
              <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtDia(f.fecha)}</Td>
              <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtDia(f.fecha_vencimiento)}</Td>
              <Td align="right" className="whitespace-nowrap">{formatCOP(f.total)}</Td>
              <Td align="right" className="whitespace-nowrap text-slate-600">{formatCOP(cobrar ? f.abonado : f.pagado)}</Td>
              <Td align="right" className="font-bold text-slate-800 whitespace-nowrap">{formatCOP(f.saldo_pendiente)}</Td>
              <Td align="center"><Estado fila={f} /></Td>
              <Td align="right">
                <div className="flex items-center justify-end gap-1">
                  {f.saldo_pendiente > 0 && (
                    <button
                      className="btn-primary gap-1 px-3 py-1.5 text-xs" aria-label={`${cfg.botonAccion} ${cobrar ? 'la factura' : 'la compra'} ${f.id}`}
                      onClick={() => abrirRegistro(f)}
                    >
                      {cobrar ? <HandCoins className="w-3.5 h-3.5" aria-hidden="true" /> : <Banknote className="w-3.5 h-3.5" aria-hidden="true" />} {cfg.botonAccion}
                    </button>
                  )}
                  <button className="btn-icon" aria-label={`Ver ${cfg.movimientos} de ${cobrar ? 'la factura' : 'la compra'} ${f.id}`} title={`Ver ${cfg.movimientos}`} onClick={() => setViendo(f)}>
                    <History className="w-4 h-4" />
                  </button>
                  <button className="btn-icon" aria-label={`Estado de cuenta de ${f[cfg.terceroKey]?.nombre}`} title="Estado de cuenta (PDF)" onClick={() => descargarEstadoCuenta(f)}>
                    <FileDown className="w-4 h-4" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <TablePagination total={lista?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />

      {/* ── Registrar abono / pago ── */}
      <Modal
        open={!!registrando} onClose={() => setRegistrando(null)} title={cfg.tituloAccion} size="md"
        description={registrando ? `${registrando[cfg.terceroKey]?.nombre} · ${cfg.prefijo}${String(registrando.id).padStart(4, '0')} · saldo ${formatCOP(registrando.saldo_pendiente)}` : undefined}
      >
        {registrando && (
          <form onSubmit={enviar} className="space-y-4">
            <FormError message={error} onDismiss={() => setError(null)} />
            <div className="space-y-1.5">
              <Field label="Monto ($)" required>
                <input
                  type="number" min="0" step="0.01" autoFocus className="input-field"
                  value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </Field>
              <button type="button" className="text-xs font-medium text-brand-700 hover:text-brand-800" onClick={() => setForm({ ...form, monto: String(registrando.saldo_pendiente) })}>
                Usar el saldo completo ({formatCOP(registrando.saldo_pendiente)})
              </button>
            </div>

            {cobrar ? (
              <>
                <Field label="Medio de pago">
                  <select className="input-field" value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value })}>
                    {Object.entries(MEDIOS_PAGO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                {form.medio === '10' && conCaja && (
                  <p className={`rounded-xl px-3 py-2 text-xs ${cajaActual ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-900'}`}>
                    {cajaActual ? 'El efectivo entra a tu caja abierta y suma a su efectivo esperado.' : 'Para recibir efectivo debes tener tu caja abierta (Caja → Abrir caja).'}
                  </p>
                )}
              </>
            ) : (
              <Field label="¿Con qué se paga?">
                <select className="input-field" value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })}>
                  <option value="OTRO">Banco, transferencia u otro medio</option>
                  {conCaja && <option value="CAJA" disabled={!cajaActual}>Efectivo de la caja{cajaActual ? ` (hay ${formatCOP(cajaActual.resumen.efectivo_esperado)})` : ' — abre tu caja primero'}</option>}
                </select>
              </Field>
            )}

            <Field label="Nota (opcional)">
              <input className="input-field" maxLength={500} placeholder={cobrar ? 'Abono de la quincena…' : 'Transferencia #123…'} value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            </Field>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setRegistrando(null)}>Cancelar</button>
              <button type="submit" disabled={registrar.isPending} className="btn-primary px-6">{registrar.isPending ? 'Registrando…' : cfg.tituloAccion}</button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {/* ── Historial de abonos / pagos de un documento ── */}
      <Modal
        open={!!viendo} onClose={() => setViendo(null)} size="lg"
        title={viendo ? `${cobrar ? 'Abonos' : 'Pagos'} de ${cfg.prefijo}${String(viendo.id).padStart(4, '0')}` : ''}
        description={viendo ? `${viendo[cfg.terceroKey]?.nombre} · total ${formatCOP(viendo.total)} · saldo ${formatCOP(viendo.saldo_pendiente)}` : undefined}
      >
        {viendo && (
          <div className="space-y-4">
            <FormError message={error} onDismiss={() => setError(null)} />
            {movimientos.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay {cfg.movimientos} registrados.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {movimientos.map((m) => (
                  <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${m.estado === 'ANULADO' ? 'opacity-50' : ''}`}>
                    <span className="min-w-0">
                      <span className={`font-semibold ${m.estado === 'ANULADO' ? 'line-through' : ''}`}>{formatCOP(m.monto)}</span>
                      <span className="text-slate-500"> · {new Date(m.fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="text-slate-500"> · {cobrar ? (MEDIOS_PAGO[m.medio_pago] || m.medio_pago) : (m.origen === 'CAJA' ? 'Efectivo de caja' : 'Banco / otro')}</span>
                      <span className="text-slate-500"> · {m.usuario?.nombre}</span>
                      {m.nota && <span className="block text-xs text-slate-500">{m.nota}</span>}
                    </span>
                    {m.estado === 'ANULADO' ? (
                      <span className="text-xs font-semibold text-slate-500">ANULADO</span>
                    ) : esAdmin && (
                      <button
                        type="button" className="btn-secondary gap-1 text-xs" disabled={anular.isPending}
                        aria-label={`Anular ${cobrar ? 'el abono' : 'el pago'} de ${formatCOP(m.monto)}`}
                        onClick={() => anular.mutate(m.id)}
                      >
                        <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Anular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setViendo(null)}>Cerrar</button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export const CuentasCobrar = () => <Cartera tipo="COBRAR" />;
export const CuentasPagar = () => <Cartera tipo="PAGAR" />;
