import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { ClipboardCheck, CheckCircle2, MinusCircle } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { unidadCorta } from '../../utils/unidades';
import { useAuthStore } from '../../store/authStore';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import SearchableSelect from '../../components/SearchableSelect';
import SearchInput from '../../components/ui/SearchInput';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const LIMIT = 20;
const TIPOS = {
  MERMA: 'Merma',
  VENCIDO: 'Vencido',
  CONSUMO_INTERNO: 'Consumo interno',
  CONTEO: 'Conteo físico',
};
const FILTROS_VACIOS = { tipo: '', desde: '', hasta: '' };

const fmtFecha = (v) => new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ───────────────────────── Mermas y ajustes ───────────────────────── */
const Mermas = () => {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState({ productoId: '', tipo: 'MERMA', cantidad: '', motivo: '' });
  const [formError, setFormError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const conStock = useMemo(() => productos.filter((p) => !['RECETA', 'PREPARACION'].includes(p.tipo)), [productos]);
  const opciones = useMemo(
    () => conStock.map((p) => ({ value: String(p.id), label: `${p.nombre_producto} · ${formatCantidad(p.stock_actual)} ${unidadCorta(p.unidad_medida)}`, keywords: p.codigo })),
    [conStock]
  );
  const seleccionado = conStock.find((p) => String(p.id) === form.productoId);

  const params = () => {
    const p = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };
  const { data: historial, isLoading, isError, error, refetch } = useEmpresaQuery(['ajustes', filtros, offset], async () => {
    const res = await api.get('/ajustes', { params: { ...params(), limit: LIMIT, offset } });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const { data: resumen } = useEmpresaQuery(['ajustes', 'resumen', filtros.desde, filtros.hasta], async () => {
    const p = {};
    if (filtros.desde) p.desde = filtros.desde;
    if (filtros.hasta) p.hasta = filtros.hasta;
    return (await api.get('/ajustes/resumen', { params: p })).data;
  });

  const registrar = useMutation({
    mutationFn: (payload) => api.post('/ajustes', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setForm({ productoId: '', tipo: form.tipo, cantidad: '', motivo: '' });
      setFormError(null);
      setOkMsg(`Registrado: ${formatCOP(Math.abs(res.data.valor))} de pérdida.`);
    },
    onError: (err) => { setOkMsg(null); setFormError(apiError(err, 'No se pudo registrar el ajuste')); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    setOkMsg(null);
    if (!form.productoId) return setFormError('Elige el producto.');
    if (!(Number(form.cantidad) > 0)) return setFormError('La cantidad debe ser mayor a 0.');
    registrar.mutate({
      productoId: Number(form.productoId), tipo: form.tipo, cantidad: Number(form.cantidad), motivo: form.motivo || undefined,
    });
  };

  const actualizarFiltro = (patch) => { setOffset(0); setFiltros((prev) => ({ ...prev, ...patch })); };
  const perdidas = (resumen?.por_tipo || []).filter((r) => r.valor !== 0);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="card-container p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Registrar una salida de inventario</h3>
        <FormError message={formError} onDismiss={() => setFormError(null)} />
        {okMsg && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {okMsg}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <Field label="Producto" required className="md:col-span-5">
            <SearchableSelect options={opciones} value={form.productoId} onChange={(v) => setForm({ ...form, productoId: v })} placeholder="Buscar producto o insumo…" />
          </Field>
          <Field label="Motivo del ajuste" required className="md:col-span-3">
            <select className="input-field" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="MERMA">Merma (se dañó / se cayó)</option>
              <option value="VENCIDO">Vencido</option>
              <option value="CONSUMO_INTERNO">Consumo interno</option>
            </select>
          </Field>
          <Field label={`Cantidad${seleccionado ? ` (${unidadCorta(seleccionado.unidad_medida)})` : ''}`} required className="md:col-span-2">
            <input type="number" min="0" step="any" className="input-field" placeholder="0" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
          </Field>
          <button type="submit" disabled={registrar.isPending} className="btn-primary md:col-span-2 h-[42px]">
            {registrar.isPending ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
        <Field label="Detalle (opcional)">
          <input className="input-field" maxLength={500} placeholder="Se humedeció el empaque, cumpleaños del personal…" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
        </Field>
      </form>

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Tipo" className="w-full sm:w-48">
          <select className="input-field" value={filtros.tipo} onChange={(e) => actualizarFiltro({ tipo: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
      </FilterBar>

      {perdidas.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {perdidas.map((r) => (
            <div key={r.tipo} className="card-container px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{TIPOS[r.tipo] || r.tipo} · {r.num}</p>
              <p className={`text-lg font-bold ${r.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCOP(r.valor)}</p>
            </div>
          ))}
          <div className="card-container px-4 py-3 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total valorizado</p>
            <p className={`text-lg font-bold ${resumen.valor_total < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCOP(resumen.valor_total)}</p>
          </div>
        </div>
      )}

      <TableCard>
        <THead>
          <Th>Fecha</Th>
          <Th>Producto</Th>
          <Th>Tipo</Th>
          <Th align="right">Antes → Después</Th>
          <Th align="right">Diferencia</Th>
          <Th align="right">Valor</Th>
          <Th>Registró</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={7} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={(historial?.rows || []).length === 0} emptyIcon={ClipboardCheck}
            emptyTitle={hayFiltros ? 'Sin ajustes para este filtro' : 'Aún no hay ajustes'} emptyHint="Aquí queda el historial de mermas, vencidos y conteos."
          />
          {(historial?.rows || []).map((a) => {
            const u = unidadCorta(a.Producto?.unidad_medida);
            return (
              <Tr key={a.id}>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(a.fecha)}</Td>
                <Td className="font-medium text-slate-800">
                  {a.Producto?.nombre_producto}
                  {a.motivo && <span className="block text-xs font-normal text-slate-500">{a.motivo}</span>}
                </Td>
                <Td><span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-700 whitespace-nowrap">{TIPOS[a.tipo] || a.tipo}</span></Td>
                <Td align="right" className="text-sm whitespace-nowrap">{formatCantidad(a.cantidad_anterior)} → {formatCantidad(a.cantidad_nueva)} {u}</Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${Number(a.diferencia) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(a.diferencia) > 0 ? '+' : ''}{formatCantidad(a.diferencia)} {u}
                </Td>
                <Td align="right" className="font-semibold whitespace-nowrap">{formatCOP(a.valor)}</Td>
                <Td className="text-sm text-slate-600">{a.Usuario?.nombre}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <TablePagination total={historial?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />
    </div>
  );
};

/* ───────────────────────── Conteo físico ───────────────────────── */
const Conteo = () => {
  const queryClient = useQueryClient();
  const { data: productos = [], isLoading, isError, error, refetch } = useEmpresaQuery(['productos'], '/productos');
  const [busqueda, setBusqueda] = useState('');
  const [contado, setContado] = useState({}); // productoId -> texto del input
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos
      .filter((p) => !['RECETA', 'PREPARACION'].includes(p.tipo))
      .filter((p) => !q || `${p.codigo} ${p.nombre_producto}`.toLowerCase().includes(q));
  }, [productos, busqueda]);

  // Solo se cuentan las filas que el usuario llenó; el resto no se toca.
  const filas = useMemo(() => productos
    .filter((p) => contado[p.id] !== undefined && contado[p.id] !== '')
    .map((p) => {
      const real = Number(contado[p.id]);
      const dif = Math.round((real - Number(p.stock_actual)) * 1000) / 1000;
      return { p, real, dif, valor: dif * Number(p.costo_promedio || 0) };
    }), [productos, contado]);
  const conDiferencia = filas.filter((f) => Math.abs(f.dif) >= 0.0005);
  const valorTotal = conDiferencia.reduce((a, f) => a + f.valor, 0);

  const enviar = useMutation({
    mutationFn: (payload) => api.post('/ajustes/conteo', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setConfirmar(false);
      setContado({});
      setMotivo('');
      setFormError(null);
      setResultado(res.data);
    },
    onError: (err) => { setConfirmar(false); setFormError(apiError(err, 'No se pudo registrar el conteo')); },
  });

  const handleEnviar = () => {
    enviar.mutate({
      motivo: motivo || undefined,
      items: filas.map((f) => ({ productoId: f.p.id, cantidad_contada: f.real })),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 max-w-3xl">
        Cuenta lo que hay en bodega y escríbelo en «Contado». Compara con lo que dice el sistema (stock teórico) y, al confirmar, el stock se corrige y la diferencia queda valorizada.
        Solo se ajustan las filas que llenes.
      </p>

      <FormError message={formError} onDismiss={() => setFormError(null)} />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput placeholder="Código o nombre…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-72" />
        <div className="flex-1" />
        <p className="text-sm text-slate-600">
          {filas.length} contado(s) · {conDiferencia.length} con diferencia ·{' '}
          <strong className={valorTotal < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(valorTotal)}</strong>
        </p>
        <button className="btn-primary" disabled={filas.length === 0} onClick={() => { setFormError(null); setConfirmar(true); }}>
          Revisar y confirmar
        </button>
      </div>

      <TableCard>
        <THead>
          <Th>Producto</Th>
          <Th align="right">En sistema</Th>
          <Th align="center" className="w-40">Contado</Th>
          <Th align="right">Diferencia</Th>
          <Th align="right">Valor</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={lista.length === 0} emptyIcon={ClipboardCheck}
            emptyTitle={busqueda ? 'Sin productos para esta búsqueda' : 'No hay productos para contar'} emptyHint="Aquí aparecen los productos e insumos con stock propio."
          />
          {lista.map((p) => {
            const fila = filas.find((f) => f.p.id === p.id);
            const u = unidadCorta(p.unidad_medida);
            return (
              <Tr key={p.id}>
                <Td className="font-medium text-slate-800">
                  {p.nombre_producto}
                  <span className="block text-xs font-mono font-normal text-slate-500">{p.codigo}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">{formatCantidad(p.stock_actual)} {u}</Td>
                <Td align="center">
                  <input
                    type="number" min="0" step="any" className="input-field text-right" aria-label={`Contado de ${p.nombre_producto}`}
                    value={contado[p.id] ?? ''} onChange={(e) => setContado((c) => ({ ...c, [p.id]: e.target.value }))}
                  />
                </Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${!fila ? 'text-slate-300' : Math.abs(fila.dif) < 0.0005 ? 'text-emerald-700' : fila.dif < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  {!fila ? '—' : Math.abs(fila.dif) < 0.0005 ? 'Cuadra' : `${fila.dif > 0 ? '+' : ''}${formatCantidad(fila.dif)} ${u}`}
                </Td>
                <Td align="right" className="whitespace-nowrap">{fila && Math.abs(fila.dif) >= 0.0005 ? formatCOP(fila.valor) : '—'}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Confirmar conteo físico" description="El stock del sistema se reemplaza por lo contado en las filas con diferencia." size="lg">
        <div className="space-y-4">
          {conDiferencia.length === 0 ? (
            <p className="text-sm text-emerald-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Todo lo contado cuadra con el sistema. No hay nada que ajustar.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <tbody>
                  {conDiferencia.map((f) => (
                    <tr key={f.p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-800">{f.p.nombre_producto}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">{formatCantidad(f.p.stock_actual)} → {formatCantidad(f.real)}</td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${f.dif < 0 ? 'text-red-700' : 'text-amber-700'}`}>{formatCOP(f.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-slate-700">Total valorizado: <strong className={valorTotal < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(valorTotal)}</strong></p>
          <Field label="Motivo / referencia (opcional)">
            <input className="input-field" maxLength={500} placeholder="Inventario de cierre de mes" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setConfirmar(false)}>Volver</button>
            <button type="button" className="btn-primary px-6" disabled={enviar.isPending} onClick={handleEnviar}>
              {enviar.isPending ? 'Aplicando…' : 'Aplicar conteo'}
            </button>
          </ModalActions>
        </div>
      </Modal>

      <Modal open={!!resultado} onClose={() => setResultado(null)} title="Conteo registrado" size="md">
        {resultado && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Stock corregido.</p>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>{resultado.ajustados} producto(s) ajustado(s)</li>
              <li className="flex items-center gap-1.5"><MinusCircle className="w-4 h-4 text-slate-400" aria-hidden="true" /> {resultado.sin_cambio} sin diferencia</li>
              <li>Valor de la diferencia: <strong className={resultado.valor_total < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(resultado.valor_total)}</strong></li>
            </ul>
            <ModalActions>
              <button type="button" className="btn-primary px-6" onClick={() => setResultado(null)}>Cerrar</button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ───────────────────────── Página ───────────────────────── */
const Ajustes = () => {
  const esAdmin = useAuthStore((s) => s.user?.rol === 'FRONT_ADMIN');
  const [tab, setTab] = useState('mermas');
  const tabs = [{ id: 'mermas', label: 'Mermas y ajustes' }, ...(esAdmin ? [{ id: 'conteo', label: 'Conteo físico' }] : [])];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Ajustes de inventario"
        description="Registra mermas y vencidos, y cuadra el stock del sistema con lo que realmente hay."
      />
      <Tabs tabs={tabs} value={esAdmin ? tab : 'mermas'} onChange={setTab} />
      {tab === 'conteo' && esAdmin ? <Conteo /> : <Mermas />}
    </div>
  );
};

export default Ajustes;
