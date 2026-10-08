import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { ChefHat, Plus, Trash2, Edit, TrendingUp } from 'lucide-react';
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

/* ───────────────────────── Página ───────────────────────── */
const Recetas = () => {
  const verCostos = usePermisos().can('costos.ver'); // la rentabilidad muestra costos y márgenes
  const [tab, setTab] = useState(verCostos ? 'rentabilidad' : 'modificadores');
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Recetas y rentabilidad"
        description="Cuánto cuesta y cuánto deja cada plato, y los modificadores que se ofrecen al vender."
      />
      <Tabs
        tabs={[...(verCostos ? [{ id: 'rentabilidad', label: 'Rentabilidad' }] : []), { id: 'modificadores', label: 'Modificadores' }]}
        value={verCostos ? tab : 'modificadores'}
        onChange={setTab}
      />
      {verCostos && tab === 'rentabilidad' ? <Rentabilidad /> : <Modificadores />}
    </div>
  );
};

export default Recetas;
