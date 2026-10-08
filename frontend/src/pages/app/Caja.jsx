import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { HandCoins, Wallet, LockKeyhole, Unlock, FileDown, Receipt, Banknote, TrendingUp, TrendingDown, History, CheckCircle2, ArrowUpFromLine, Scale } from 'lucide-react';
import { formatCOP } from '../../utils/format';
import { etiquetaPago } from '../../utils/mediosPago';
import { CATEGORIAS_GASTO } from '../../utils/gastos';
import { generateCajaPDF } from '../../utils/generateCajaPDF';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
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

const LIMIT = 15;
const FILTROS_VACIOS = { desde: '', hasta: '', estado: '' };

const fmtFecha = (v) => (v
  ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

const Stat = ({ icon, label, value, tone = 'bg-brand-50 text-brand-700' }) => {
  const Icon = icon;
  return (
    <div className="card-container p-5 flex items-center gap-4">
      <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
};

const Caja = () => {
  const queryClient = useQueryClient();
  const { can } = usePermisos();
  const veBalance = can('caja.balance');
  const veTodas = can('caja.todas');
  const activeEmpresa = useAuthStore((s) => s.activeEmpresa);

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const [formError, setFormError] = useState(null);

  const [showAbrir, setShowAbrir] = useState(false);
  const [abrirForm, setAbrirForm] = useState({ monto_inicial: '', observaciones: '' });

  const [cerrandoId, setCerrandoId] = useState(null); // id de la caja que se está cerrando
  const [cierreForm, setCierreForm] = useState({ monto_contado: '', observaciones: '' });
  const [cerradaOk, setCerradaOk] = useState(null); // caja recién cerrada (para ofrecer el PDF)

  const { data: cajaActual, isLoading: cargandoActual } = useEmpresaQuery(['caja', 'actual'], '/caja/actual');
  const conGastos = (activeEmpresa?.modulos || []).includes('Gastos');
  const conCobrar = (activeEmpresa?.modulos || []).includes('Cuentas por cobrar');
  const conMesas = (activeEmpresa?.modulos || []).includes('Mesas');

  // Base sugerida al abrir: lo contado en el último cierre (o el capital inicial si es la primera caja).
  const { data: baseSugerida } = useEmpresaQuery(['caja', 'base-sugerida'], '/caja/base-sugerida', { enabled: showAbrir });

  // Dinero de la empresa frente a su capital inicial (solo administrador).
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' });
  const { data: balance } = useEmpresaQuery(['caja', 'balance', periodo], async () => {
    const params = {};
    Object.entries(periodo).forEach(([k, v]) => { if (v) params[k] = v; });
    return (await api.get('/caja/balance', { params })).data;
  }, { enabled: veBalance });

  // Sacar dinero de la caja: retiro, o pago de un gasto en efectivo.
  const [showEgreso, setShowEgreso] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ modo: 'RETIRO', concepto: '', monto: '', categoria: 'SERVICIOS' });

  const {
    data: historial, isLoading, isError, error, refetch,
  } = useEmpresaQuery(['caja', 'historial', filtros, offset], async () => {
    const params = { limit: LIMIT, offset };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    const res = await api.get('/caja', { params });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const cajas = historial?.rows || [];
  const hayFiltros = Object.values(filtros).some(Boolean);

  // Detalle (con resumen en vivo) de la caja que se va a cerrar.
  const empresaId = activeEmpresa?.id;
  const { data: detalleCierre, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['empresa', empresaId ?? null, 'caja', 'detalle', cerrandoId],
    queryFn: async () => (await api.get(`/caja/${cerrandoId}`)).data,
    enabled: cerrandoId != null,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });

  const actualizarFiltro = (patch) => {
    setOffset(0);
    setFiltros((prev) => ({ ...prev, ...patch }));
  };

  const abrir = useMutation({
    mutationFn: (payload) => api.post('/caja/abrir', payload),
    onSuccess: () => {
      invalidar();
      setShowAbrir(false);
      setAbrirForm({ monto_inicial: '', observaciones: '' });
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo abrir la caja')),
  });

  const egreso = useMutation({
    mutationFn: ({ modo, concepto, monto, categoria }) => (modo === 'RETIRO' || modo === 'PROPINA'
      ? api.post('/caja/retiros', { tipo: modo, concepto, monto })
      : api.post('/gastos', { categoria, descripcion: concepto, monto, pagar_desde_caja: true })),
    onSuccess: () => {
      invalidar();
      setShowEgreso(false);
      setEgresoForm({ modo: 'RETIRO', concepto: '', monto: '', categoria: 'SERVICIOS' });
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo registrar el egreso')),
  });

  const cerrar = useMutation({
    mutationFn: ({ id, ...payload }) => api.post(`/caja/${id}/cerrar`, payload),
    onSuccess: (res) => {
      invalidar();
      setCerrandoId(null);
      setCierreForm({ monto_contado: '', observaciones: '' });
      setFormError(null);
      setCerradaOk(res.data);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo cerrar la caja')),
  });

  const descargarPDF = async (id) => {
    try {
      const { data } = await api.get(`/caja/${id}`);
      generateCajaPDF(data);
    } catch (err) {
      setFormError(apiError(err, 'No se pudo generar el PDF'));
    }
  };

  const handleAbrir = (e) => {
    e.preventDefault();
    setFormError(null);
    abrir.mutate({
      monto_inicial: Number(abrirForm.monto_inicial) || 0,
      observaciones: abrirForm.observaciones || undefined,
    });
  };

  const handleEgreso = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!egresoForm.concepto.trim()) return setFormError(egresoForm.modo === 'GASTO' ? 'Describe el gasto.' : 'Indica el concepto.');
    if (!(Number(egresoForm.monto) > 0)) return setFormError('El monto debe ser mayor a 0.');
    egreso.mutate({ ...egresoForm, concepto: egresoForm.concepto.trim(), monto: Number(egresoForm.monto) });
  };

  const handleCerrar = (e) => {
    e.preventDefault();
    setFormError(null);
    if (cierreForm.monto_contado === '' || Number(cierreForm.monto_contado) < 0) {
      return setFormError('Indica el efectivo contado en la caja (puede ser 0).');
    }
    cerrar.mutate({
      id: cerrandoId,
      monto_contado: Number(cierreForm.monto_contado),
      observaciones: cierreForm.observaciones || undefined,
    });
  };

  const iniciarCierre = (id) => {
    setFormError(null);
    setCierreForm({ monto_contado: '', observaciones: '' });
    setCerrandoId(id);
  };

  const resumenActual = cajaActual?.resumen;
  const diferenciaEnVivo = detalleCierre && cierreForm.monto_contado !== ''
    ? Number(cierreForm.monto_contado) - detalleCierre.resumen.efectivo_esperado
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Caja"
        description="Abre tu turno con la base de efectivo y ciérralo al terminar para obtener el reporte en PDF."
        action={!cargandoActual && !cajaActual && (
          <button className="btn-primary gap-2" onClick={() => { setFormError(null); setShowAbrir(true); }}>
            <Unlock className="w-5 h-5" aria-hidden="true" /> Abrir caja
          </button>
        )}
      />

      {formError && !showAbrir && !showEgreso && cerrandoId == null && (
        <FormError message={formError} onDismiss={() => setFormError(null)} />
      )}

      {cajaActual ? (
        <section aria-label="Caja abierta" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" /> CAJA ABIERTA
              </span>
              desde {fmtFecha(cajaActual.fecha_apertura)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/ventas" className="btn-secondary gap-2"><Receipt className="w-4 h-4" aria-hidden="true" /> Ir a vender</Link>
              <button className="btn-secondary gap-2" onClick={() => { setFormError(null); setShowEgreso(true); }}>
                <ArrowUpFromLine className="w-4 h-4" aria-hidden="true" /> Sacar dinero / pagar
              </button>
              <button className="btn-primary gap-2" onClick={() => iniciarCierre(cajaActual.id)}>
                <LockKeyhole className="w-4 h-4" aria-hidden="true" /> Cerrar caja
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${(conCobrar ? 1 : 0) + (Number(resumenActual.propinas_efectivo) > 0 ? 1 : 0) === 2 ? 'xl:grid-cols-7' : (conCobrar || Number(resumenActual.propinas_efectivo) > 0) ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
            <Stat icon={Banknote} label="Base inicial" value={formatCOP(cajaActual.monto_inicial)} />
            <Stat icon={Receipt} label={`Ventas (${resumenActual.num_ventas})`} value={formatCOP(resumenActual.total_ventas)} tone="bg-emerald-50 text-emerald-700" />
            <Stat icon={TrendingUp} label="Ventas en efectivo" value={formatCOP(resumenActual.ventas_efectivo)} tone="bg-amber-50 text-amber-700" />
            {Number(resumenActual.propinas_efectivo) > 0 && <Stat icon={HandCoins} label="Propinas en efectivo" value={formatCOP(resumenActual.propinas_efectivo)} tone="bg-violet-50 text-violet-700" />}
            {conCobrar && <Stat icon={HandCoins} label="Abonos en efectivo" value={formatCOP(resumenActual.abonos_efectivo)} tone="bg-sky-50 text-sky-700" />}
            <Stat icon={TrendingDown} label="Egresos de caja" value={formatCOP(resumenActual.total_egresos)} tone="bg-red-50 text-red-700" />
            <Stat icon={Wallet} label="Efectivo esperado" value={formatCOP(resumenActual.efectivo_esperado)} tone="bg-brand-100 text-brand-800" />
          </div>

          {cajaActual.movimientos?.length > 0 && (
            <div className="card-container p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Egresos del turno</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {cajaActual.movimientos.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <span className="text-slate-600 min-w-0 truncate">
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 mr-2">{{ RETIRO: 'Retiro', GASTO: 'Gasto', COMPRA: 'Compra', DEVOLUCION: 'Devolución', PAGO_PROV: 'Pago proveedor', PROPINA: 'Propinas' }[m.tipo]}</span>
                      {m.concepto}
                    </span>
                    <span className="font-semibold text-red-700 whitespace-nowrap">−{formatCOP(m.monto)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resumenActual.medios.length > 0 && (
            <div className="card-container p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Por medio de pago</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {resumenActual.medios.map((m) => (
                  <li key={`${m.forma_pago}-${m.medio_pago}`} className="flex justify-between py-2">
                    <span className="text-slate-600">{etiquetaPago(m.forma_pago, m.medio_pago)} · {m.num} venta(s)</span>
                    <span className="font-semibold text-slate-800">{formatCOP(m.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : !cargandoActual && (
        <div className="card-container p-10 text-center">
          <Wallet className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <p className="font-semibold text-slate-800">No tienes una caja abierta</p>
          <p className="text-sm text-slate-500 mt-1">Ábrela con la base de efectivo con la que empiezas para poder registrar ventas.</p>
        </div>
      )}

      {veBalance && balance && (
        <section aria-label="Dinero de la empresa" className="card-container p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Scale className="w-5 h-5 text-slate-500" aria-hidden="true" /> Dinero de la empresa</h3>
            <div className="flex flex-wrap items-end gap-2 text-xs text-slate-500">
              <label className="flex flex-col gap-1">Periodo desde
                <input type="date" className="input-field py-1.5" value={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">hasta
                <input type="date" className="input-field py-1.5" value={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} />
              </label>
              {(periodo.desde || periodo.hasta) && <button type="button" className="btn-secondary py-1.5" onClick={() => setPeriodo({ desde: '', hasta: '' })}>Quitar periodo</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Capital inicial</p>
              <p className="text-xl font-bold text-slate-800">{formatCOP(balance.capital_inicial)}</p>
            </div>
            <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-800">Dinero actual</p>
              <p className="text-xl font-bold text-brand-800">{formatCOP(balance.dinero_actual)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${balance.variacion >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{balance.variacion >= 0 ? 'Ha crecido' : 'Ha disminuido'}</p>
              <p className={`text-xl font-bold ${balance.variacion >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {balance.variacion >= 0 ? '+' : ''}{formatCOP(balance.variacion)}
                {balance.variacion_pct !== null && <span className="text-sm font-semibold"> ({balance.variacion_pct >= 0 ? '+' : ''}{balance.variacion_pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%)</span>}
              </p>
            </div>
          </div>
          {balance.capital_inicial === 0 && (
            <p className="text-xs text-amber-700">Esta empresa no tiene capital inicial registrado, así que no se puede medir el crecimiento en %. Se define al crear o editar la empresa (backoffice).</p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th scope="col" className="py-2 font-semibold">Movimiento</th>
                <th scope="col" className="py-2 text-right font-semibold">Acumulado</th>
                {balance.periodo && <th scope="col" className="py-2 text-right font-semibold">Periodo</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['Ventas cobradas (contado)', '+', 'ventas', 'text-emerald-700'],
                ['Abonos de clientes (ventas a crédito)', '+', 'abonos', 'text-emerald-700'],
                ['Compras de contado', '−', 'compras', 'text-red-700'],
                ['Pagos a proveedores (compras a crédito)', '−', 'pagos_proveedores', 'text-red-700'],
                ['Gastos', '−', 'gastos', 'text-red-700'],
                ['Retiros de caja', '−', 'retiros', 'text-red-700'],
                ['Devoluciones a clientes', '−', 'devoluciones', 'text-red-700'],
              ].map(([nombre, signo, clave, tono]) => (
                <tr key={clave}>
                  <td className="py-2 text-slate-700">{nombre}</td>
                  <td className={`py-2 text-right font-semibold ${tono}`}>{signo}{formatCOP(balance.acumulado[clave])}</td>
                  {balance.periodo && <td className={`py-2 text-right font-semibold ${tono}`}>{signo}{formatCOP(balance.periodo[clave])}</td>}
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2 text-slate-800">Resultado</td>
                <td className="py-2 text-right text-slate-800">{formatCOP(balance.acumulado.neto)}</td>
                {balance.periodo && <td className="py-2 text-right text-slate-800">{formatCOP(balance.periodo.neto)}</td>}
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-slate-500">
            Dinero actual = capital inicial + ventas de contado + abonos − compras de contado − pagos a proveedores − gastos − retiros − devoluciones. Los pagos en efectivo de la caja ya están dentro de esos rubros.
            {balance.cartera && (balance.cartera.por_cobrar > 0 || balance.cartera.por_pagar > 0) && (
              <> Aún no es dinero: te deben <strong>{formatCOP(balance.cartera.por_cobrar)}</strong>{balance.cartera.vencido_cobrar > 0 && <> ({formatCOP(balance.cartera.vencido_cobrar)} vencido)</>} y debes <strong>{formatCOP(balance.cartera.por_pagar)}</strong>{balance.cartera.vencido_pagar > 0 && <> ({formatCOP(balance.cartera.vencido_pagar)} vencido)</>}.</>
            )}
            {' '}Efectivo en cajas abiertas ahora: <strong>{formatCOP(balance.efectivo_en_cajas)}</strong>.
          </p>
        </section>
      )}

      <div className="flex items-center gap-2 pt-2">
        <History className="w-5 h-5 text-slate-500" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-slate-800">Historial de cajas</h3>
        {!veTodas && <span className="text-xs text-slate-500">(solo las tuyas)</span>}
      </div>

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
        <Field label="Estado" className="w-full sm:w-40">
          <select className="input-field" value={filtros.estado} onChange={(e) => actualizarFiltro({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="ABIERTA">Abiertas</option>
            <option value="CERRADA">Cerradas</option>
          </select>
        </Field>
      </FilterBar>

      <TableCard>
        <THead>
          <Th>N°</Th>
          <Th>Cajero</Th>
          <Th>Apertura</Th>
          <Th>Cierre</Th>
          <Th align="right">Ventas</Th>
          <Th align="right">Diferencia</Th>
          <Th align="center">Estado</Th>
          <Th align="right">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={8}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={cajas.length === 0}
            emptyIcon={Wallet}
            emptyTitle={hayFiltros ? 'Sin cajas para este filtro' : 'Aún no hay cajas registradas'}
            emptyHint={hayFiltros ? 'Prueba con otro rango de fechas.' : 'Abre la primera con «Abrir caja».'}
          />
          {cajas.map((c) => {
            const cerrada = c.estado === 'CERRADA';
            const dif = Number(c.diferencia || 0);
            return (
              <Tr key={c.id}>
                <Td className="font-mono text-sm text-slate-600 whitespace-nowrap">CAJA-{String(c.id).padStart(4, '0')}</Td>
                <Td className="font-medium text-slate-800">{c.usuario?.nombre || '—'}</Td>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(c.fecha_apertura)}</Td>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(c.fecha_cierre)}</Td>
                <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{cerrada ? formatCOP(c.total_ventas) : '—'}</Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${!cerrada ? 'text-slate-400' : dif === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {cerrada ? formatCOP(dif) : '—'}
                </Td>
                <Td align="center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${cerrada ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                    {cerrada ? 'CERRADA' : 'ABIERTA'}
                  </span>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {cerrada ? (
                      <button className="btn-icon" aria-label={`Descargar PDF de la caja ${c.id}`} title="Descargar PDF" onClick={() => descargarPDF(c.id)}>
                        <FileDown className="w-4 h-4" />
                      </button>
                    ) : (veTodas || c.id === cajaActual?.id) && (
                      <button className="btn-secondary gap-1.5 text-xs" onClick={() => iniciarCierre(c.id)}>
                        <LockKeyhole className="w-3.5 h-3.5" aria-hidden="true" /> Cerrar
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>

      <TablePagination total={historial?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />

      {/* ── Abrir caja ── */}
      <Modal open={showAbrir} onClose={() => setShowAbrir(false)} title="Abrir caja" description="Cuenta el efectivo con el que empiezas el turno." size="md">
        <form onSubmit={handleAbrir} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <Field label="Base inicial en efectivo ($)" hint="Es el efectivo con el que se mueve esta caja. Puede ser 0.">
            <input
              type="number" min="0" step="0.01" autoFocus className="input-field" placeholder={baseSugerida?.monto ? String(baseSugerida.monto) : '50000'}
              value={abrirForm.monto_inicial} onChange={(e) => setAbrirForm({ ...abrirForm, monto_inicial: e.target.value })}
            />
          </Field>
          {baseSugerida?.origen && (
            <button
              type="button"
              className="w-full text-left rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-900 hover:bg-brand-100 transition-colors"
              onClick={() => setAbrirForm({ ...abrirForm, monto_inicial: String(baseSugerida.monto) })}
            >
              <span className="font-semibold">Usar {formatCOP(baseSugerida.monto)}</span>
              <span className="block text-xs text-brand-800/80">
                {baseSugerida.origen === 'CIERRE_ANTERIOR' ? 'Lo contado en el último cierre de caja.' : 'El capital inicial de la empresa (primera caja).'}
              </span>
            </button>
          )}
          <Field label="Observaciones">
            <input
              className="input-field" placeholder="Opcional" maxLength={500}
              value={abrirForm.observaciones} onChange={(e) => setAbrirForm({ ...abrirForm, observaciones: e.target.value })}
            />
          </Field>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowAbrir(false)}>Cancelar</button>
            <button type="submit" disabled={abrir.isPending} className="btn-primary px-6">{abrir.isPending ? 'Abriendo…' : 'Abrir caja'}</button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Sacar dinero / pagar ── */}
      <Modal open={showEgreso} onClose={() => setShowEgreso(false)} title="Sacar dinero de la caja" description={cajaActual ? `Hay ${formatCOP(cajaActual.resumen.efectivo_esperado)} en efectivo.` : undefined} size="md">
        <form onSubmit={handleEgreso} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div role="radiogroup" aria-label="Tipo de egreso" className="grid grid-cols-2 gap-2">
            {[['RETIRO', 'Retiro de efectivo', 'Sacar dinero (consignación, entrega al dueño…)'], ...(conGastos ? [['GASTO', 'Pagar un gasto', 'Domicilio, insumo menor, recibo…']] : []), ...(conMesas ? [['PROPINA', 'Entregar propinas', 'Dinero de propinas que se reparte al personal']] : [])].map(([valor, titulo, ayuda]) => (
              <label key={valor} className={`rounded-xl border p-3 cursor-pointer text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600 ${egresoForm.modo === valor ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" className="sr-only" name="modo-egreso" checked={egresoForm.modo === valor} onChange={() => setEgresoForm({ ...egresoForm, modo: valor })} />
                <span className="font-semibold text-slate-800">{titulo}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{ayuda}</span>
              </label>
            ))}
          </div>
          {egresoForm.modo === 'GASTO' && (
            <Field label="Categoría">
              <select className="input-field" value={egresoForm.categoria} onChange={(e) => setEgresoForm({ ...egresoForm, categoria: e.target.value })}>
                {Object.entries(CATEGORIAS_GASTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          <Field label={egresoForm.modo === 'GASTO' ? 'Descripción del gasto' : 'Concepto'} required>
            <input className="input-field" maxLength={255} autoFocus placeholder={egresoForm.modo === 'RETIRO' ? 'Consignación al banco' : egresoForm.modo === 'PROPINA' ? 'Propinas del turno' : 'Pago domiciliario'} value={egresoForm.concepto} onChange={(e) => setEgresoForm({ ...egresoForm, concepto: e.target.value })} />
          </Field>
          <Field label="Monto ($)" required>
            <input type="number" min="0" step="0.01" className="input-field" value={egresoForm.monto} onChange={(e) => setEgresoForm({ ...egresoForm, monto: e.target.value })} />
          </Field>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowEgreso(false)}>Cancelar</button>
            <button type="submit" disabled={egreso.isPending} className="btn-primary px-6">{egreso.isPending ? 'Registrando…' : 'Registrar egreso'}</button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Cerrar caja ── */}
      <Modal open={cerrandoId != null} onClose={() => setCerrandoId(null)} title="Cerrar caja" description="Cuenta el efectivo que hay en la caja y compáralo con lo esperado." size="lg">
        <form onSubmit={handleCerrar} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />

          {cargandoDetalle || !detalleCierre ? (
            <p className="text-sm text-slate-500" role="status">Calculando totales…</p>
          ) : (
            <>
              <dl className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
                {[
                  ['Base inicial', formatCOP(detalleCierre.monto_inicial)],
                  [`Ventas del turno (${detalleCierre.resumen.num_ventas})`, formatCOP(detalleCierre.resumen.total_ventas)],
                  ['Ventas en efectivo', formatCOP(detalleCierre.resumen.ventas_efectivo)],
                  ...(Number(detalleCierre.resumen.propinas_efectivo) > 0 ? [['Propinas en efectivo (no son ventas)', `+${formatCOP(detalleCierre.resumen.propinas_efectivo)}`]] : []),
                  ...(Number(detalleCierre.resumen.abonos_efectivo) > 0 ? [['Abonos de clientes en efectivo', `+${formatCOP(detalleCierre.resumen.abonos_efectivo)}`]] : []),
                  ['Egresos de caja (retiros y pagos)', `−${formatCOP(detalleCierre.resumen.total_egresos)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">{k}</dt><dd className="font-semibold text-slate-800">{v}</dd></div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-brand-50">
                  <dt className="font-semibold text-brand-800">Efectivo esperado</dt>
                  <dd className="font-bold text-brand-800">{formatCOP(detalleCierre.resumen.efectivo_esperado)}</dd>
                </div>
              </dl>

              <Field label="Efectivo contado ($)" required>
                <input
                  type="number" min="0" step="0.01" autoFocus className="input-field" placeholder="0"
                  value={cierreForm.monto_contado} onChange={(e) => setCierreForm({ ...cierreForm, monto_contado: e.target.value })}
                />
              </Field>

              {diferenciaEnVivo !== null && (
                <p
                  role="status"
                  className={`text-sm font-semibold rounded-xl px-4 py-2.5 ${
                    Math.abs(diferenciaEnVivo) < 0.005 ? 'bg-emerald-50 text-emerald-800'
                      : diferenciaEnVivo > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  {Math.abs(diferenciaEnVivo) < 0.005
                    ? 'La caja cuadra.'
                    : diferenciaEnVivo > 0 ? `Sobran ${formatCOP(diferenciaEnVivo)}.` : `Faltan ${formatCOP(Math.abs(diferenciaEnVivo))}.`}
                </p>
              )}

              <Field label="Observaciones del cierre">
                <input
                  className="input-field" placeholder="Opcional" maxLength={500}
                  value={cierreForm.observaciones} onChange={(e) => setCierreForm({ ...cierreForm, observaciones: e.target.value })}
                />
              </Field>
            </>
          )}

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setCerrandoId(null)}>Cancelar</button>
            <button type="submit" disabled={cerrar.isPending || !detalleCierre} className="btn-primary px-6">
              {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
            </button>
          </ModalActions>
        </form>
      </Modal>

      {/* ── Cierre exitoso ── */}
      <Modal open={!!cerradaOk} onClose={() => setCerradaOk(null)} title="Caja cerrada" size="md">
        {cerradaOk && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> CAJA-{String(cerradaOk.id).padStart(4, '0')} cerrada correctamente.
            </p>
            <dl className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Total vendido</dt><dd className="font-semibold">{formatCOP(cerradaOk.total_ventas)}</dd></div>
              {Number(cerradaOk.propinas_efectivo) > 0 && (
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Propinas en efectivo</dt><dd className="font-semibold">+{formatCOP(cerradaOk.propinas_efectivo)}</dd></div>
              )}
              {Number(cerradaOk.abonos_efectivo) > 0 && (
                <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Abonos en efectivo</dt><dd className="font-semibold">+{formatCOP(cerradaOk.abonos_efectivo)}</dd></div>
              )}
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Egresos de caja</dt><dd className="font-semibold">−{formatCOP(cerradaOk.total_egresos)}</dd></div>
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Efectivo esperado</dt><dd className="font-semibold">{formatCOP(cerradaOk.efectivo_esperado)}</dd></div>
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-600">Efectivo contado</dt><dd className="font-semibold">{formatCOP(cerradaOk.monto_contado)}</dd></div>
              <div className="flex justify-between px-4 py-2.5">
                <dt className="text-slate-600">Diferencia</dt>
                <dd className={`font-bold ${Number(cerradaOk.diferencia) === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCOP(cerradaOk.diferencia)}</dd>
              </div>
            </dl>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setCerradaOk(null)}>Cerrar</button>
              <button type="button" className="btn-primary gap-2 px-6" onClick={() => descargarPDF(cerradaOk.id)}>
                <FileDown className="w-4 h-4" aria-hidden="true" /> Descargar PDF
              </button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Caja;
