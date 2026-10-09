import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { ChefHat, Plus, Trash2, Edit, TrendingUp, Soup, Undo2, Hourglass, Lightbulb } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { unidadCorta } from '../../utils/unidades';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import SearchableSelect from '../../components/SearchableSelect';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import { usePermisos } from '../../hooks/usePermisos';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';
import TablePagination from '../../components/ui/TablePagination';

const LIMIT_PRODUCCION = 15;
const fmtFecha = (v) => new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const fmtDia = (v) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : 'Sin vencimiento');
const TONO_LOTE = {
  VIGENTE: 'bg-emerald-100 text-emerald-800',
  POR_VENCER: 'bg-amber-100 text-amber-800',
  VENCIDO: 'bg-red-100 text-red-800',
};
const TEXTO_LOTE = { VIGENTE: 'Vigente', POR_VENCER: 'Por vencer', VENCIDO: 'Vencido' };

const pct = (n) => `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
const toneMargen = (p) => (p >= 50 ? 'text-emerald-700' : p >= 20 ? 'text-amber-700' : 'text-red-700');

const Stat = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="card-container p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
  </div>
);

/* ───────────────────────── Rentabilidad ───────────────────────── */
const Rentabilidad = () => {
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const hayFiltros = !!rango.desde || !!rango.hasta;

  const { data: real, isLoading, isError, error, refetch } = useEmpresaQuery(['rentabilidad', rango], async () => {
    const params = {};
    Object.entries(rango).forEach(([k, v]) => { if (v) params[k] = v; });
    return (await api.get('/recetas/rentabilidad', { params })).data;
  });
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');

  // Costo teórico del menú: los menos rentables primero (los que hay que revisar).
  const menu = useMemo(
    () => productos
      .filter((p) => p.tipo === 'RECETA' || (p.tipo === 'VENTA' && Number(p.costo) > 0))
      .sort((a, b) => Number(a.margen_pct) - Number(b.margen_pct)),
    [productos]
  );
  const totales = real?.totales;

  return (
    <div className="space-y-6">
      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => setRango({ desde: '', hasta: '' })}>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </Field>
      </FilterBar>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Ingresos (sin IVA)" value={formatCOP(totales?.ingresos ?? 0)} />
        <Stat label="Costo de lo vendido" value={formatCOP(totales?.costo ?? 0)} />
        <Stat label="Margen" value={formatCOP(totales?.margen ?? 0)} tone="text-emerald-700" />
        <Stat label="Margen %" value={pct(totales?.margen_pct ?? 0)} tone={toneMargen(totales?.margen_pct ?? 0)} />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Lo vendido</h3>
        <p className="text-sm text-slate-500 mb-3">Con el costo que tenía cada ingrediente al momento de la venta. No incluye el descuento global de la factura.</p>
        <TableCard>
          <THead>
            <Th>Producto / plato</Th>
            <Th align="right">Unidades</Th>
            <Th align="right">Ingresos</Th>
            <Th align="right">Costo</Th>
            <Th align="right">Margen</Th>
            <Th align="right">%</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={6} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
              isEmpty={(real?.filas || []).length === 0} emptyIcon={TrendingUp}
              emptyTitle="Sin ventas en este rango" emptyHint="Cuando vendas platos o productos con costo, aquí verás su rentabilidad."
            />
            {(real?.filas || []).map((f) => (
              <Tr key={f.productoId}>
                <Td className="font-medium text-slate-800">{f.nombre_producto}</Td>
                <Td align="right">{formatCantidad(f.unidades)}</Td>
                <Td align="right">{formatCOP(f.ingresos)}</Td>
                <Td align="right">{formatCOP(f.costo)}</Td>
                <Td align="right" className="font-semibold">{formatCOP(f.margen)}</Td>
                <Td align="right" className={`font-semibold ${toneMargen(f.margen_pct)}`}>{pct(f.margen_pct)}</Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Costo del menú (hoy)</h3>
        <p className="text-sm text-slate-500 mb-3">Con el costo actual de los ingredientes. Ordenado de menor a mayor margen para revisar primero lo que menos deja.</p>
        <TableCard>
          <THead>
            <Th>Plato / producto</Th>
            <Th align="right">Precio sin IVA</Th>
            <Th align="right">Costo</Th>
            <Th align="right">Margen</Th>
            <Th align="right">%</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={5} isLoading={false} isError={false} isEmpty={menu.length === 0} emptyIcon={ChefHat}
              emptyTitle="Aún no hay platos con costo" emptyHint="Crea platos con receta en Inventario y registra el costo de los insumos (o compra con Compras)."
            />
            {menu.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium text-slate-800">{p.nombre_producto}</Td>
                <Td align="right">{formatCOP(p.precio_neto)}</Td>
                <Td align="right">{Number(p.costo) > 0 ? formatCOP(p.costo) : <span className="text-slate-400">Sin costo</span>}</Td>
                <Td align="right" className="font-semibold">{formatCOP(p.margen)}</Td>
                <Td align="right" className={`font-semibold ${toneMargen(p.margen_pct)}`}>{Number(p.costo) > 0 ? pct(p.margen_pct) : '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    </div>
  );
};

/* ───────────────────────── Modificadores ───────────────────────── */
const EMPTY_MOD = { nombre: '', precio_extra: '', activo: true, items: [] };

const resumenItems = (items = []) => items
  .map((i) => `${Number(i.cantidad) > 0 ? '+' : '−'}${formatCantidad(Math.abs(Number(i.cantidad)))} ${unidadCorta(i.insumo?.unidad_medida)} ${i.insumo?.nombre_producto || ''}`.trim())
  .join(' · ');

const Modificadores = () => {
  const queryClient = useQueryClient();
  const { data: mods = [], isLoading, isError, error, refetch } = useEmpresaQuery(['modificadores', 'todos'], '/modificadores?todos=1');
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_MOD);
  const [formError, setFormError] = useState(null);

  // Ingredientes posibles: todo lo que no sea un plato.
  const opciones = useMemo(
    () => productos.filter((p) => p.tipo !== 'RECETA').map((p) => ({ value: String(p.id), label: `${p.nombre_producto} (${unidadCorta(p.unidad_medida)})`, keywords: p.codigo })),
    [productos]
  );
  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const cerrar = () => { setShowModal(false); setEditId(null); setForm(EMPTY_MOD); setFormError(null); };

  const guardar = useMutation({
    mutationFn: (payload) => (editId ? api.put(`/modificadores/${editId}`, payload) : api.post('/modificadores', payload)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['empresa'] }); cerrar(); },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el modificador')),
  });

  const abrirEdicion = (m) => {
    setEditId(m.id);
    setFormError(null);
    setForm({
      nombre: m.nombre,
      precio_extra: Number(m.precio_extra) ? String(Number(m.precio_extra)) : '',
      activo: m.activo,
      // En pantalla: acción (agrega/quita) + cantidad positiva; al guardar se vuelve a firmar.
      items: m.items.map((i) => ({
        insumoId: String(i.insumoId), accion: Number(i.cantidad) < 0 ? 'quita' : 'agrega', cantidad: String(Math.abs(Number(i.cantidad))),
      })),
    });
    setShowModal(true);
  };

  const setItem = (idx, patch) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.');
    if (form.items.some((i) => !i.insumoId || !(Number(i.cantidad) > 0))) {
      return setFormError('Cada ingrediente necesita un insumo y una cantidad mayor a 0.');
    }
    guardar.mutate({
      nombre: form.nombre.trim(),
      precio_extra: Number(form.precio_extra) || 0,
      activo: form.activo,
      items: form.items.map((i) => ({ insumoId: Number(i.insumoId), cantidad: (i.accion === 'quita' ? -1 : 1) * Number(i.cantidad) })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">
          Extras («extra shot») y quitados («sin azúcar») que se eligen al vender un plato: suman al precio y ajustan lo que se descuenta del inventario.
        </p>
        <button className="btn-primary gap-2" onClick={() => { setForm(EMPTY_MOD); setEditId(null); setFormError(null); setShowModal(true); }}>
          <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo modificador
        </button>
      </div>

      <TableCard>
        <THead>
          <Th>Modificador</Th>
          <Th align="right">Precio extra</Th>
          <Th>Ajuste de ingredientes</Th>
          <Th align="center">Estado</Th>
          <Th align="center" className="w-20">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={mods.length === 0} emptyIcon={ChefHat} emptyTitle="Aún no hay modificadores" emptyHint="Crea el primero con «Nuevo modificador»."
          />
          {mods.map((m) => (
            <Tr key={m.id}>
              <Td className="font-medium text-slate-800">{m.nombre}</Td>
              <Td align="right" className="whitespace-nowrap">{Number(m.precio_extra) > 0 ? `+${formatCOP(m.precio_extra)}` : 'Sin costo'}</Td>
              <Td className="text-sm text-slate-600">{resumenItems(m.items) || <span className="text-slate-400">Solo precio</span>}</Td>
              <Td align="center">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${m.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {m.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </Td>
              <Td align="center">
                <button className="btn-icon" aria-label={`Editar ${m.nombre}`} onClick={() => abrirEdicion(m)}><Edit className="w-4 h-4" /></button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal open={showModal} onClose={cerrar} title={editId ? 'Editar modificador' : 'Nuevo modificador'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre" required>
              <input className="input-field" placeholder="Extra shot / Sin azúcar" maxLength={100} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Precio extra ($)" hint="Se suma al precio del plato (IVA incluido). 0 si es gratis.">
              <input type="number" min="0" step="0.01" className="input-field" placeholder="0" value={form.precio_extra} onChange={(e) => setForm({ ...form, precio_extra: e.target.value })} />
            </Field>
          </div>

          <fieldset className="rounded-xl border border-slate-200 p-4 space-y-3">
            <legend className="px-2 text-sm font-semibold text-brand-800">Ajuste de ingredientes (por porción)</legend>
            {form.items.length === 0 && <p className="text-sm text-slate-500">Sin ajuste de inventario: solo cambia el precio.</p>}
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[6.5rem_1fr_6rem_auto] gap-2 items-end">
                <Field label={idx === 0 ? 'Acción' : undefined}>
                  <select className="input-field" value={it.accion} onChange={(e) => setItem(idx, { accion: e.target.value })}>
                    <option value="agrega">Agrega</option>
                    <option value="quita">Quita</option>
                  </select>
                </Field>
                <Field label={idx === 0 ? 'Ingrediente' : undefined}>
                  <SearchableSelect options={opciones} value={it.insumoId} onChange={(v) => setItem(idx, { insumoId: v })} placeholder="Buscar…" allowClear={false} />
                </Field>
                <Field label={idx === 0 ? `Cant.${it.insumoId ? ` (${unidadCorta(productoPorId.get(Number(it.insumoId))?.unidad_medida)})` : ''}` : undefined}>
                  <input type="number" min="0" step="any" className="input-field" value={it.cantidad} onChange={(e) => setItem(idx, { cantidad: e.target.value })} />
                </Field>
                <button type="button" className="btn-icon mb-0.5" aria-label="Quitar ingrediente" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" className="btn-secondary gap-2 text-sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { insumoId: '', accion: 'agrega', cantidad: '' }] }))}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Agregar ingrediente
            </button>
            <p className="text-xs text-slate-500">«Quita» resta del consumo del plato (sin bajar de 0). Puedes usar preparaciones: «Quita 150 ml de Salsa» saca sus ingredientes.</p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Activo (aparece al vender)
          </label>

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={cerrar}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

/* ───────────────────────── Lotes en existencia y sugerencias ───────────────────────── */
const LotesYSugerencias = ({ onUsar, onDescartar, descartando }) => {
  const [dias, setDias] = useState('14');
  const [cobertura, setCobertura] = useState('1');
  const { data: lotes = [] } = useEmpresaQuery(['produccion', 'lotes'], '/produccion/lotes');
  const { data: sug } = useEmpresaQuery(['produccion', 'sugerencias', dias, cobertura], async () => (
    (await api.get('/produccion/sugerencias', { params: { dias: Number(dias) || 14, cobertura: Number(cobertura) || 1 } })).data
  ));
  const conExistencias = lotes.filter((p) => p.lotes.length > 0);
  const sugerencias = (sug?.sugerencias || []).filter((s) => s.consumo_periodo > 0 || s.stock > 0);
  if (lotes.length === 0) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <section aria-label="Lotes en existencia" className="card-container p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Hourglass className="w-5 h-5 text-brand-700" aria-hidden="true" /> Lotes en existencia</h3>
        {conExistencias.length === 0 ? (
          <p className="text-sm text-slate-500">No hay preparaciones en existencia.</p>
        ) : conExistencias.map((p) => (
          <div key={p.productoId} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-800">{p.nombre_producto} <span className="font-normal text-slate-500">· hay {formatCantidad(p.stock)} {unidadCorta(p.unidad_medida)}</span></p>
              {p.vencido > 0 && (
                <button type="button" className="btn-danger text-xs px-3 py-1.5" disabled={descartando} onClick={() => onDescartar(p)}>
                  Descartar {formatCantidad(p.vencido)} {unidadCorta(p.unidad_medida)} vencidos
                </button>
              )}
            </div>
            {!p.vida_util_dias && <p className="text-xs text-slate-500 mt-1">Sin vida útil configurada: en Inventario puedes indicar cuántos días dura un lote.</p>}
            <ul className="mt-2 space-y-1 text-sm">
              {p.lotes.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">Lote del {fmtDia(String(l.fecha).slice(0, 10))} · {formatCantidad(l.restante)} {unidadCorta(p.unidad_medida)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{l.vence_en ? `vence ${fmtDia(l.vence_en)}` : ''}</span>
                    <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${TONO_LOTE[l.estado]}`}>{TEXTO_LOTE[l.estado]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Cuánto producir" className="card-container p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Lightbulb className="w-5 h-5 text-amber-600" aria-hidden="true" /> Cuánto producir</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Promediar ventas de (días)" className="w-44">
            <input type="number" min="1" max="90" className="input-field" value={dias} onChange={(e) => setDias(e.target.value)} />
          </Field>
          <Field label="Tener cubiertos (días)" className="w-44">
            <input type="number" min="0.25" step="0.25" className="input-field" value={cobertura} onChange={(e) => setCobertura(e.target.value)} />
          </Field>
        </div>
        {sugerencias.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay ventas de platos con preparaciones por lotes en este periodo.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {sugerencias.map((s) => (
              <li key={s.productoId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{s.nombre_producto}</span>
                  <span className="block text-xs text-slate-500">Se gasta ~{formatCantidad(s.promedio_diario)} {unidadCorta(s.unidad_medida)} al día · hay {formatCantidad(s.stock)}</span>
                </span>
                {s.sugerido > 0 ? (
                  <button type="button" className="btn-secondary text-xs gap-1" onClick={() => onUsar(s)} aria-label={`Producir ${formatCantidad(s.sugerido)} ${unidadCorta(s.unidad_medida)} de ${s.nombre_producto}`}>
                    Producir {formatCantidad(s.sugerido)} {unidadCorta(s.unidad_medida)}
                  </button>
                ) : <span className="text-xs font-semibold text-emerald-700">Alcanza</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

/* ───────────────────────── Producción por lotes ───────────────────────── */
const Produccion = () => {
  const queryClient = useQueryClient();
  const { can } = usePermisos();
  const puedeDeshacer = can('inventario.conteo');
  const verCostos = can('costos.ver');
  const [form, setForm] = useState({ productoId: '', cantidad: '', motivo: '' });
  const [formError, setFormError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [offset, setOffset] = useState(0);
  const [deshacer, setDeshacer] = useState(null);

  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const lotes = useMemo(() => productos.filter((p) => p.tipo === 'PREPARACION' && p.por_lotes), [productos]);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const opciones = useMemo(
    () => lotes.map((p) => ({ value: String(p.id), label: `${p.nombre_producto} · hay ${formatCantidad(p.stock_actual)} ${unidadCorta(p.unidad_medida)}`, keywords: p.codigo })),
    [lotes]
  );
  const prep = porId.get(Number(form.productoId));
  const cantidad = Number(form.cantidad) || 0;

  // Lo que gastaría el lote: cada ingrediente directo × cantidad / rendimiento.
  const necesidades = useMemo(() => {
    if (!prep || !(cantidad > 0)) return [];
    const factor = cantidad / (Number(prep.rendimiento) || 1);
    return (prep.receta || []).map((i) => {
      const ing = porId.get(i.insumoId);
      const necesario = Number(i.cantidad) * factor;
      const esSubreceta = ing?.tipo === 'PREPARACION' && !ing.por_lotes;
      return { ing, necesario, falta: !esSubreceta && ing && Number(ing.stock_actual) < necesario - 1e-9, esSubreceta };
    });
  }, [prep, cantidad, porId]);
  const hayFaltantes = necesidades.some((n) => n.falta);

  const { data: historial, isLoading, isError, error, refetch } = useEmpresaQuery(['produccion', offset], async () => {
    const res = await api.get('/produccion', { params: { limit: LIMIT_PRODUCCION, offset } });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });
  const producir = useMutation({
    mutationFn: (payload) => api.post('/produccion', payload),
    onSuccess: (res) => {
      refrescar();
      setFormError(null);
      setOkMsg(`Producción registrada: ${formatCantidad(res.data.cantidad)} ${unidadCorta(prep?.unidad_medida)} de ${prep?.nombre_producto}.`);
      setForm((f) => ({ ...f, cantidad: '', motivo: '' }));
    },
    onError: (err) => { setOkMsg(null); setFormError(apiError(err, 'No se pudo registrar la producción')); },
  });
  const descartar = useMutation({
    mutationFn: (p) => api.post('/ajustes', { productoId: p.productoId, tipo: 'VENCIDO', cantidad: p.vencido, motivo: 'Lote vencido (producción por lotes)' }),
    onSuccess: (_r, p) => { refrescar(); setFormError(null); setOkMsg(`Se descartaron ${formatCantidad(p.vencido)} ${unidadCorta(p.unidad_medida)} vencidos de ${p.nombre_producto}.`); },
    onError: (err) => { setOkMsg(null); setFormError(apiError(err, 'No se pudo descartar lo vencido')); },
  });
  const anular = useMutation({
    mutationFn: (id) => api.post(`/produccion/${id}/anular`),
    onSuccess: () => { refrescar(); setDeshacer(null); setFormError(null); },
    onError: (err) => { setDeshacer(null); setOkMsg(null); setFormError(apiError(err, 'No se pudo deshacer la producción')); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    setOkMsg(null);
    if (!prep) return setFormError('Elige la preparación que hiciste.');
    if (!(cantidad > 0)) return setFormError('Indica cuánto preparaste (mayor a 0).');
    producir.mutate({ productoId: prep.id, cantidad, motivo: form.motivo.trim() || undefined });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 max-w-3xl">
        Registra lo que preparas en lote («hoy preparé 2 litros de salsa»): se descuentan los ingredientes y la preparación suma su propio stock.
        Al vender un plato que la usa se descuenta ella. Para que una preparación aparezca aquí, márcala «por lotes» en Inventario.
      </p>

      <FormError message={formError} onDismiss={() => setFormError(null)} />
      {okMsg && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">{okMsg}</p>}

      {lotes.length === 0 ? (
        <div className="card-container p-8 text-center text-slate-500">
          <Soup className="w-8 h-8 mx-auto mb-2 text-slate-400" aria-hidden="true" />
          <p className="font-semibold text-slate-700">Aún no hay preparaciones por lotes</p>
          <p className="text-sm mt-1">En Inventario, crea una preparación (o edita una) y marca «Prepararla por lotes».</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card-container p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] gap-4">
            <Field label="Preparación" required>
              <SearchableSelect options={opciones} value={form.productoId} onChange={(v) => setForm({ ...form, productoId: v })} placeholder="Buscar preparación…" allowClear={false} />
            </Field>
            <Field label={`Cantidad preparada${prep ? ` (${unidadCorta(prep.unidad_medida)})` : ''}`} required>
              <input type="number" step="any" min="0" className="input-field" placeholder="2000" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </Field>
            <Field label="Nota (opcional)">
              <input className="input-field" maxLength={500} placeholder="Lote del lunes" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
            </Field>
          </div>

          {necesidades.length > 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Se descontará del inventario</p>
              <ul className="text-sm space-y-1">
                {necesidades.map((n, i) => (
                  <li key={i} className={n.falta ? 'text-red-700 font-semibold' : 'text-slate-700'}>
                    {n.ing?.nombre_producto || 'Ingrediente'}: {formatCantidad(Math.round(n.necesario * 1000) / 1000)} {unidadCorta(n.ing?.unidad_medida)}
                    {n.falta && ` — solo hay ${formatCantidad(n.ing.stock_actual)}`}
                    {n.esSubreceta && <span className="text-slate-500 font-normal"> (sub-receta: se descuentan sus ingredientes)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" className="btn-primary px-6 gap-2" disabled={producir.isPending || hayFaltantes}>
              <Soup className="w-4 h-4" aria-hidden="true" /> {producir.isPending ? 'Registrando…' : 'Registrar producción'}
            </button>
          </div>
        </form>
      )}

      <LotesYSugerencias
        onUsar={(s) => { setForm((f) => ({ ...f, productoId: String(s.productoId), cantidad: String(s.sugerido) })); setOkMsg(null); setFormError(null); }}
        onDescartar={(p) => descartar.mutate(p)}
        descartando={descartar.isPending}
      />

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">Historial de producción</h3>
        <TableCard>
          <THead>
            <Th>Fecha</Th>
            <Th>Preparación</Th>
            <Th align="right">Cantidad</Th>
            {verCostos && <Th align="right">Costo del lote</Th>}
            <Th>Registró</Th>
            <Th align="center">Estado</Th>
            {puedeDeshacer && <Th align="center" className="w-24">Acciones</Th>}
          </THead>
          <tbody>
            <TableState
              colSpan={5 + (verCostos ? 1 : 0) + (puedeDeshacer ? 1 : 0)} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
              isEmpty={(historial?.rows || []).length === 0} emptyIcon={Soup}
              emptyTitle="Aún no hay producciones" emptyHint="Cuando registres un lote aparecerá aquí."
            />
            {(historial?.rows || []).map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-sm">{fmtFecha(r.fecha)}</Td>
                <Td className="font-medium text-slate-800">
                  {r.Producto?.nombre_producto}
                  {r.motivo && <span className="block text-xs font-normal text-slate-500">{r.motivo}</span>}
                </Td>
                <Td align="right" className="whitespace-nowrap">{formatCantidad(r.cantidad)} {unidadCorta(r.Producto?.unidad_medida)}</Td>
                {verCostos && <Td align="right" className="whitespace-nowrap">{formatCOP(r.costo_total)}</Td>}
                <Td className="text-sm">{r.Usuario?.nombre}</Td>
                <Td align="center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${r.estado === 'ACTIVA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {r.estado === 'ACTIVA' ? 'ACTIVA' : 'DESHECHA'}
                  </span>
                </Td>
                {puedeDeshacer && (
                  <Td align="center">
                    {r.estado === 'ACTIVA' && (
                      <button className="btn-icon" aria-label={`Deshacer la producción #${r.id}`} onClick={() => setDeshacer(r)}><Undo2 className="w-4 h-4" /></button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </TableCard>
        <TablePagination total={historial?.total || 0} offset={offset} limit={LIMIT_PRODUCCION} onChange={setOffset} />
      </div>

      <Modal open={!!deshacer} onClose={() => setDeshacer(null)} title="Deshacer producción" size="md">
        {deshacer && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Se devolverán los ingredientes al inventario y se quitarán {formatCantidad(deshacer.cantidad)} {unidadCorta(deshacer.Producto?.unidad_medida)} de «{deshacer.Producto?.nombre_producto}».
              Solo se puede si el lote sigue completo; si ya se usó en platos, regístralo como merma.
            </p>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setDeshacer(null)}>Volver</button>
              <button type="button" className="btn-primary px-6" disabled={anular.isPending} onClick={() => anular.mutate(deshacer.id)}>
                {anular.isPending ? 'Deshaciendo…' : 'Deshacer producción'}
              </button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ───────────────────────── Página ───────────────────────── */
const Recetas = () => {
  const verCostos = usePermisos().can('costos.ver'); // la rentabilidad muestra costos y márgenes
  const [tab, setTab] = useState(verCostos ? 'rentabilidad' : 'modificadores');
  const actual = !verCostos && tab === 'rentabilidad' ? 'modificadores' : tab;
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Recetas y rentabilidad"
        description="Cuánto cuesta y cuánto deja cada plato, las preparaciones por lotes y los modificadores que se ofrecen al vender."
      />
      <Tabs
        tabs={[
          ...(verCostos ? [{ id: 'rentabilidad', label: 'Rentabilidad' }] : []),
          { id: 'produccion', label: 'Producción' },
          { id: 'modificadores', label: 'Modificadores' },
        ]}
        value={actual}
        onChange={setTab}
      />
      {actual === 'rentabilidad' ? <Rentabilidad /> : actual === 'produccion' ? <Produccion /> : <Modificadores />}
    </div>
  );
};

export default Recetas;
