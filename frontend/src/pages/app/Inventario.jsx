import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { PackageOpen, Plus, Upload, FileDown, CheckCircle2, AlertTriangle, Edit, Trash2, UtensilsCrossed } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import SearchableSelect from '../../components/SearchableSelect';
import { UNIDADES, unidadCorta, factorEstandar, etiquetaPresentacion, presentacionDe } from '../../utils/unidades';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY_FORM = {
  codigo: '', nombre_producto: '', descripcion: '', precio_unitario: '', stock_actual: '',
  porcentaje_iva: '19', unidad_medida: '94', codigo_estandar: '',
  tipo: 'VENTA', receta: [], costo_promedio: '', rendimiento: '', por_lotes: false,
  unidad_compra: '', factor_compra: '', presOtra: false, // presentación de compra (kg, caja…)
  stock_minimo: '', stock_objetivo: '', // alerta de reposición
};

const TIPOS = {
  VENTA: { label: 'Producto', tone: 'bg-slate-100 text-slate-700' },
  INSUMO: { label: 'Insumo', tone: 'bg-amber-100 text-amber-800' },
  PREPARACION: { label: 'Preparación', tone: 'bg-violet-100 text-violet-800' },
  RECETA: { label: 'Plato', tone: 'bg-brand-100 text-brand-800' },
};

/** Tipos con receta (sin stock propio) y tipos que no llevan precio de venta. */
const CON_RECETA = ['RECETA', 'PREPARACION'];
const SIN_PRECIO = ['INSUMO', 'PREPARACION'];

const IMPORT_OPCIONES_INICIALES = { modoCantidad: 'sumar', modoPrecio: 'conservar' };

// La cookie de sesión viaja sola en una navegación normal, así que un <a> a
// esta URL basta para descargar la plantilla sin JS ni volver a pedir empresa.
const URL_PLANTILLA = `${import.meta.env.VITE_API_URL || '/api'}/productos/plantilla`;

/** Color según el estado de stock que calcula el servidor con el MÍNIMO de cada producto. */
const TONO_ESTADO = {
  OK: 'bg-emerald-100 text-emerald-800',
  BAJO: 'bg-amber-100 text-amber-800',
  AGOTADO: 'bg-red-100 text-red-800',
};
const stockTone = (p) => TONO_ESTADO[p.estado_stock] || TONO_ESTADO.OK;

const pct = (n) => `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;

const Inventario = () => {
  const queryClient = useQueryClient();
  const conRecetas = useAuthStore((st) => (st.activeEmpresa?.modulos || []).includes('Recetas'));
  const verCostos = usePermisos().can('costos.ver'); // sin él no se muestran ni se editan costos ni márgenes
  const columnaCosto = conRecetas && verCostos;
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [editId, setEditId] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importOpciones, setImportOpciones] = useState(IMPORT_OPCIONES_INICIALES);
  const [importError, setImportError] = useState(null);
  const [importResultado, setImportResultado] = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroStock, setFiltroStock] = useState(''); // '' | 'bajo' | 'agotado'
  const [filtroTipo, setFiltroTipo] = useState(''); // '' | 'VENTA' | 'INSUMO' | 'RECETA'

  const { data: productos = [], isLoading, isError, error, refetch } = useEmpresaQuery(['productos'], '/productos');

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (q && !(`${p.codigo} ${p.nombre_producto}`.toLowerCase().includes(q))) return false;
      if (filtroTipo && (p.tipo || 'VENTA') !== filtroTipo) return false;
      if (filtroStock === 'agotado' && p.estado_stock !== 'AGOTADO') return false;
      if (filtroStock === 'bajo' && !p.alerta_stock) return false; // en o bajo su mínimo (o agotado con mínimo)
      return true;
    });
  }, [productos, busqueda, filtroStock, filtroTipo]);

  const hayFiltros = !!busqueda || !!filtroStock || !!filtroTipo;

  // Ingredientes posibles: todo lo que no sea un plato (y no el propio plato).
  const opcionesIngrediente = useMemo(
    () => productos
      .filter((p) => p.tipo !== 'RECETA' && p.id !== editId)
      .map((p) => ({ value: String(p.id), label: `${p.nombre_producto} (${unidadCorta(p.unidad_medida)})`, keywords: p.codigo })),
    [productos, editId]
  );
  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const guardar = useMutation({
    mutationFn: (payload) => (editId ? api.put(`/productos/${editId}`, payload) : api.post('/productos', payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setShowModal(false);
      setEditId(null);
      setFormData(EMPTY_FORM);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el producto')),
  });

  const abrirNuevo = () => {
    setEditId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setFormError(null);
    setFormData({
      codigo: p.codigo || '', nombre_producto: p.nombre_producto || '', descripcion: p.descripcion || '',
      precio_unitario: p.precio_unitario ?? '', stock_actual: '',
      porcentaje_iva: p.porcentaje_iva ?? '19', unidad_medida: p.unidad_medida || '94',
      codigo_estandar: p.codigo_estandar || '',
      tipo: p.tipo || 'VENTA',
      costo_promedio: CON_RECETA.includes(p.tipo) ? '' : String(Number(p.costo_promedio ?? 0) || ''),
      rendimiento: p.tipo === 'PREPARACION' ? String(Number(p.rendimiento)) : '',
      por_lotes: p.tipo === 'PREPARACION' && !!p.por_lotes,
      stock_minimo: Number(p.stock_minimo) ? String(Number(p.stock_minimo)) : '',
      stock_objetivo: p.stock_objetivo != null ? String(Number(p.stock_objetivo)) : '',
      unidad_compra: p.unidad_compra || '',
      factor_compra: p.unidad_compra ? String(Number(p.factor_compra)) : '',
      presOtra: !!p.unidad_compra && !UNIDADES.some((u) => u.value === p.unidad_compra),
      receta: (p.receta || []).map((i) => ({ insumoId: String(i.insumoId), cantidad: String(Number(i.cantidad)) })),
    });
    setShowModal(true);
  };

  // Presentación de compra: al elegir una unidad estándar (kg, lb, L…) el factor se sugiere solo.
  const elegirPresentacion = (valor) => {
    if (valor === '') return setFormData((f) => ({ ...f, unidad_compra: '', factor_compra: '', presOtra: false }));
    if (valor === '__otra') return setFormData((f) => ({ ...f, unidad_compra: '', factor_compra: '', presOtra: true }));
    setFormData((f) => ({ ...f, unidad_compra: valor, presOtra: false, factor_compra: String(factorEstandar(f.unidad_medida, valor) ?? '') }));
  };
  // Si cambia la unidad base y la presentación es estándar, el factor se recalcula.
  const cambiarUnidadBase = (unidad) => setFormData((f) => {
    const sugerido = !f.presOtra && f.unidad_compra ? factorEstandar(unidad, f.unidad_compra) : undefined;
    return { ...f, unidad_medida: unidad, ...(sugerido ? { factor_compra: String(sugerido) } : {}) };
  });

  const setReceta = (receta) => setFormData((prev) => ({ ...prev, receta }));
  const updateIngrediente = (idx, patch) => setReceta(formData.receta.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);

    const esPlato = CON_RECETA.includes(formData.tipo);
    const payload = {
      ...formData,
      // Un insumo / preparación no se vende: el precio no aplica (el backend lo exige, va en 0).
      precio_unitario: SIN_PRECIO.includes(formData.tipo) ? (formData.precio_unitario || 0) : formData.precio_unitario,
      costo_promedio: esPlato || formData.costo_promedio === '' ? undefined : Number(formData.costo_promedio),
      rendimiento: formData.tipo === 'PREPARACION' ? Number(formData.rendimiento) : undefined,
      por_lotes: formData.tipo === 'PREPARACION' ? !!formData.por_lotes : undefined,
      // Presentación de compra: vacía = se compra en la unidad base (null la quita al editar).
      unidad_compra: esPlato ? undefined : (formData.unidad_compra.trim() || null),
      factor_compra: !esPlato && formData.unidad_compra.trim() ? Number(formData.factor_compra) : undefined,
      presOtra: undefined,
      stock_minimo: Number(formData.stock_minimo) || 0,
      stock_objetivo: formData.stock_objetivo === '' ? null : Number(formData.stock_objetivo),
      receta: undefined,
    };
    if (payload.unidad_compra && !(payload.factor_compra > 0)) {
      return setFormError('Indica cuántas unidades base trae la presentación de compra.');
    }
    if (formData.tipo === 'PREPARACION' && !(payload.rendimiento > 0)) {
      return setFormError('Indica cuánto rinde la preparación (p. ej. 1000 ml).');
    }
    if (esPlato) {
      const items = formData.receta.filter((r) => r.insumoId || r.cantidad);
      if (items.length === 0) return setFormError('Agrega al menos un ingrediente a la receta.');
      if (items.some((r) => !r.insumoId || !(Number(r.cantidad) > 0))) {
        return setFormError('Cada ingrediente necesita un insumo y una cantidad mayor a 0.');
      }
      payload.receta = items.map((r) => ({ insumoId: Number(r.insumoId), cantidad: Number(r.cantidad) }));
    }

    if (editId) {
      // El stock no se edita aquí (lo mueven compras/ventas); el schema lo omite igual.
      delete payload.stock_actual;
      guardar.mutate(payload);
    } else {
      guardar.mutate({ ...payload, stock_actual: esPlato ? 0 : (parseFloat(formData.stock_actual) || 0) });
    }
  };

  const cerrarImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportOpciones(IMPORT_OPCIONES_INICIALES);
    setImportError(null);
    setImportResultado(null);
  };

  const importarProductos = useMutation({
    mutationFn: (datosFormulario) => api.post('/productos/importar', datosFormulario),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setImportResultado(res.data);
      setImportError(null);
    },
    onError: (err) => setImportError(apiError(err, 'No se pudo procesar el archivo')),
  });

  const handleImportSubmit = (e) => {
    e.preventDefault();
    if (!importFile) return setImportError('Selecciona un archivo .xlsx primero.');
    setImportError(null);
    const datosFormulario = new FormData();
    datosFormulario.append('archivo', importFile);
    datosFormulario.append('modoCantidad', importOpciones.modoCantidad);
    datosFormulario.append('modoPrecio', importOpciones.modoPrecio);
    importarProductos.mutate(datosFormulario);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Catálogo e Inventario"
        description="Administra los productos base. El stock aumenta vía Compras."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary gap-2"
              onClick={() => { cerrarImportModal(); setShowImportModal(true); }}
            >
              <Upload className="w-5 h-5" aria-hidden="true" /> Importar Excel
            </button>
            <button className="btn-primary gap-2" onClick={abrirNuevo}>
              <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo Producto
            </button>
          </div>
        }
      />

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => { setBusqueda(''); setFiltroStock(''); setFiltroTipo(''); }}>
        <SearchInput placeholder="Código o nombre…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-64" />
        {conRecetas && (
          <Field label="Tipo" className="w-full sm:w-44">
            <select className="input-field" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([valor, t]) => <option key={valor} value={valor}>{t.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Stock" className="w-full sm:w-44">
          <select className="input-field" value={filtroStock} onChange={(e) => setFiltroStock(e.target.value)}>
            <option value="">Todos</option>
            <option value="bajo">En o bajo su mínimo</option>
            <option value="agotado">Agotados</option>
          </select>
        </Field>
      </FilterBar>

      <TableCard>
        <THead>
          <Th>SKU</Th>
          <Th>Producto</Th>
          <Th align="center">Stock / Disponible</Th>
          {columnaCosto && <Th align="right">Costo / Margen</Th>}
          <Th align="right">Valor Unitario</Th>
          <Th align="center" className="w-20">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={columnaCosto ? 6 : 5}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={productosFiltrados.length === 0}
            emptyIcon={PackageOpen}
            emptyTitle={hayFiltros ? 'Sin productos para esta búsqueda' : 'No hay productos en el catálogo'}
            emptyHint={hayFiltros ? 'Prueba con otro texto o quita el filtro de stock.' : 'Crea el primero con «Nuevo Producto».'}
          />
          {productosFiltrados.map((p) => (
            <Tr key={p.id}>
              <Td className="font-mono text-sm text-slate-600 whitespace-nowrap">{p.codigo}</Td>
              <Td className="font-medium text-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  {p.nombre_producto}
                  {conRecetas && p.tipo && p.tipo !== 'VENTA' && (
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${TIPOS[p.tipo]?.tone}`}>{TIPOS[p.tipo]?.label}</span>
                  )}
                </div>
              </Td>
              <Td align="center">
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap ${stockTone(p)}`}>
                  {p.tipo === 'RECETA'
                    ? `${formatCantidad(p.disponible)} porciones`
                    : p.tipo === 'PREPARACION'
                      ? (p.por_lotes
                        ? `${formatCantidad(p.stock_actual)} ${unidadCorta(p.unidad_medida)} preparados`
                        : `${formatCantidad(p.disponible)} ${unidadCorta(p.unidad_medida)} producibles`)
                      : `${formatCantidad(p.stock_actual)} ${unidadCorta(p.unidad_medida)}`}
                </span>
                {Number(p.stock_minimo) > 0 && (
                  <span className={`block text-[11px] mt-1 ${p.alerta_stock ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                    {p.estado_stock === 'AGOTADO' ? 'Agotado · ' : p.alerta_stock ? 'Bajo el mínimo · ' : ''}mín. {formatCantidad(p.stock_minimo)}
                  </span>
                )}
                {p.tipo !== 'PREPARACION' && p.tipo !== 'RECETA' && presentacionDe(p) && presentacionDe(p).factor !== 1 && Number(p.stock_actual) > 0 && (
                  <span className="block text-[11px] text-slate-500 mt-1">≈ {formatCantidad(Number(p.stock_actual) / presentacionDe(p).factor)} {etiquetaPresentacion(p.unidad_compra)}</span>
                )}
              </Td>
              {columnaCosto && (
                <Td align="right" className="text-xs text-slate-600 whitespace-nowrap">
                  {p.tipo === 'INSUMO' || p.tipo === 'PREPARACION'
                    ? `${formatCOP(p.costo)} / ${unidadCorta(p.unidad_medida)}`
                    : Number(p.costo) > 0
                      ? <>{formatCOP(p.costo)} · <span className={p.margen_pct >= 50 ? 'text-emerald-700 font-semibold' : p.margen_pct >= 20 ? 'text-amber-700 font-semibold' : 'text-red-700 font-semibold'}>{pct(p.margen_pct)}</span></>
                      : <span className="text-slate-400">Sin costo</span>}
                </Td>
              )}
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{SIN_PRECIO.includes(p.tipo) ? '—' : formatCOP(p.precio_unitario)}</Td>
              <Td align="center">
                <button onClick={() => startEdit(p)} aria-label={`Editar ${p.nombre_producto}`} className="btn-icon">
                  <Edit className="w-4 h-4" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Editar Artículo' : 'Crear Artículo'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />

          {conRecetas && (
            <Field
              label="¿Qué vas a registrar?"
              hint={{
                VENTA: 'Se compra y se vende tal cual (gaseosa, snack…).',
                INSUMO: 'Ingrediente: se compra y se gasta en recetas; no se vende solo.',
                PREPARACION: 'Sub-receta (salsa, masa…): la usan otros platos; no se vende ni se compra.',
                RECETA: 'Plato o bebida preparada: al venderlo descuenta sus ingredientes.',
              }[formData.tipo]}
            >
              <select className="input-field" value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}>
                <option value="VENTA">Producto de venta</option>
                <option value="INSUMO">Insumo (ingrediente)</option>
                <option value="PREPARACION">Preparación (sub-receta)</option>
                <option value="RECETA">Plato (con receta)</option>
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Código SKU" required>
              <input className="input-field" placeholder="PROD-001" value={formData.codigo || ''} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} />
            </Field>
            <Field label="Código Estandar">
              <input className="input-field" placeholder="999999" value={formData.codigo_estandar || ''} onChange={(e) => setFormData({ ...formData, codigo_estandar: e.target.value })} />
            </Field>
          </div>

          <Field label="Descripción" required>
            <input className="input-field" placeholder="Laptop Gamer ZX" value={formData.nombre_producto || ''} onChange={(e) => setFormData({ ...formData, nombre_producto: e.target.value })} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!SIN_PRECIO.includes(formData.tipo) && (
              <Field label={formData.tipo === 'RECETA' ? 'Precio del plato ($)' : 'Precio de Venta ($)'} required>
                <input type="number" step="0.01" className="input-field" placeholder="1500.00" value={formData.precio_unitario || ''} onChange={(e) => setFormData({ ...formData, precio_unitario: e.target.value })} />
              </Field>
            )}
            {formData.tipo === 'PREPARACION' ? (
              <Field label="Rendimiento de la receta" required hint="Cuánto produce esta receta, en la unidad de medida (p. ej. 1000 ml).">
                <input type="number" step="any" min="0" className="input-field" placeholder="1000" value={formData.rendimiento} onChange={(e) => setFormData({ ...formData, rendimiento: e.target.value })} />
              </Field>
            ) : formData.tipo === 'RECETA' ? (
              <Field label="Disponibilidad" hint="Sale de los ingredientes: se calcula sola.">
                <input className="input-field bg-slate-50 text-slate-500" readOnly value={editId ? `${formatCantidad(productoPorId.get(editId)?.porciones_disponibles ?? 0)} porciones` : 'Se calcula con la receta'} />
              </Field>
            ) : editId ? (
              <Field label="Stock actual" hint="El stock se ajusta con Compras y Ventas, no aquí.">
                <input className="input-field bg-slate-50 text-slate-500" value={`${formatCantidad(productoPorId.get(editId)?.stock_actual ?? 0)} ${unidadCorta(formData.unidad_medida)}`} readOnly />
              </Field>
            ) : (
              <Field label="Stock Físico Inicial" required>
                <input type="number" step="any" min="0" className="input-field" placeholder="50" value={formData.stock_actual || ''} onChange={(e) => setFormData({ ...formData, stock_actual: e.target.value })} />
              </Field>
            )}
          </div>

          {columnaCosto && !CON_RECETA.includes(formData.tipo) && (
            <Field
              label={`Costo por ${unidadCorta(formData.unidad_medida)} ($)`}
              hint="Con cada compra se recalcula como promedio ponderado. Úsalo para fijar el costo inicial."
            >
              <input
                type="number" step="any" min="0" className="input-field" placeholder="0"
                value={formData.costo_promedio} onChange={(e) => setFormData({ ...formData, costo_promedio: e.target.value })}
              />
            </Field>
          )}

          {formData.tipo === 'PREPARACION' && (
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox" className="mt-0.5 w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                checked={!!formData.por_lotes} onChange={(e) => setFormData({ ...formData, por_lotes: e.target.checked })}
              />
              <span>
                <strong className="text-slate-800">Prepararla por lotes (con su propio stock)</strong>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Registras «hoy preparé 2 litros» en Recetas → Producción: se descuentan los ingredientes y se suma el stock de la
                  preparación. Al vender un plato se descuenta ella, no sus ingredientes; si no hay, no se puede vender.
                  Sin marcar, los ingredientes se descuentan al vender cada plato.
                </span>
              </span>
            </label>
          )}

          <fieldset className="rounded-xl border border-slate-200 p-4 space-y-3">
            <legend className="px-2 text-sm font-semibold text-brand-800">Alerta de reposición</legend>
            <p className="text-xs text-slate-500">
              Avisa cuando {formData.tipo === 'RECETA' ? 'las porciones que se pueden preparar' : formData.tipo === 'PREPARACION' ? 'las unidades que se pueden producir' : 'el stock'} lleguen
              a este mínimo y sugiere cuánto pedir. 0 = sin alerta.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`Stock mínimo (${formData.tipo === 'RECETA' ? 'porciones' : unidadCorta(formData.unidad_medida)})`}>
                <input type="number" step="any" min="0" className="input-field" placeholder="0" value={formData.stock_minimo} onChange={(e) => setFormData({ ...formData, stock_minimo: e.target.value })} />
              </Field>
              <Field label={`Reponer hasta (${formData.tipo === 'RECETA' ? 'porciones' : unidadCorta(formData.unidad_medida)})`} hint="Opcional. Vacío = el doble del mínimo.">
                <input type="number" step="any" min="0" className="input-field" placeholder="Automático" value={formData.stock_objetivo} onChange={(e) => setFormData({ ...formData, stock_objetivo: e.target.value })} />
              </Field>
            </div>
          </fieldset>

          {!CON_RECETA.includes(formData.tipo) && (
            <fieldset className="rounded-xl border border-slate-200 p-4 space-y-3">
              <legend className="px-2 text-sm font-semibold text-brand-800">Presentación de compra (opcional)</legend>
              <p className="text-xs text-slate-500">
                ¿Compras en una unidad y gastas en otra (compras en kg, gastas en {unidadCorta(formData.unidad_medida)})? Indícalo y podrás registrar compras y pedidos
                en esa presentación. El stock, las recetas y el costo siguen en <strong>{unidadCorta(formData.unidad_medida)}</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Compro en">
                  <select className="input-field" value={formData.presOtra ? '__otra' : formData.unidad_compra} onChange={(e) => elegirPresentacion(e.target.value)}>
                    <option value="">Igual que la unidad base</option>
                    {UNIDADES.filter((u) => u.value !== formData.unidad_medida).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    <option value="__otra">Otra (caja, bulto, paquete…)</option>
                  </select>
                </Field>
                {formData.presOtra && (
                  <Field label="Nombre de la presentación">
                    <input className="input-field" maxLength={30} placeholder="Caja x24" value={formData.unidad_compra} onChange={(e) => setFormData({ ...formData, unidad_compra: e.target.value })} />
                  </Field>
                )}
                {formData.unidad_compra.trim() !== '' && (
                  <Field
                    label={`1 ${etiquetaPresentacion(formData.unidad_compra)} = … ${unidadCorta(formData.unidad_medida)}`}
                    hint={factorEstandar(formData.unidad_medida, formData.unidad_compra) ? 'Equivalencia estándar; puedes ajustarla.' : 'Cuántas unidades base trae cada presentación.'}
                  >
                    <input type="number" step="any" min="0" className="input-field" placeholder="1000" value={formData.factor_compra} onChange={(e) => setFormData({ ...formData, factor_compra: e.target.value })} />
                  </Field>
                )}
              </div>
            </fieldset>
          )}

          {CON_RECETA.includes(formData.tipo) && (
            <fieldset className="rounded-xl border border-slate-200 p-4 space-y-3">
              <legend className="px-2 text-sm font-semibold text-brand-800 flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4" aria-hidden="true" />
                {formData.tipo === 'PREPARACION' ? `Ingredientes para todo el lote${formData.rendimiento ? ` (${formData.rendimiento} ${unidadCorta(formData.unidad_medida)})` : ''}` : 'Receta (ingredientes por 1 porción)'}
              </legend>

              {formData.receta.length === 0 && (
                <p className="text-sm text-slate-500">Aún no hay ingredientes. Agrega los insumos que consume una porción.</p>
              )}

              {formData.receta.map((r, idx) => {
                const insumo = productoPorId.get(Number(r.insumoId));
                return (
                  <div key={idx} className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
                    <Field label={idx === 0 ? 'Ingrediente' : undefined}>
                      <SearchableSelect
                        options={opcionesIngrediente}
                        value={r.insumoId}
                        onChange={(v) => updateIngrediente(idx, { insumoId: v })}
                        placeholder="Buscar insumo…"
                        allowClear={false}
                      />
                    </Field>
                    <Field label={idx === 0 ? `Cantidad${insumo ? ` (${unidadCorta(insumo.unidad_medida)})` : ''}` : undefined}>
                      <input
                        type="number" step="any" min="0" className="input-field" placeholder="15"
                        value={r.cantidad} onChange={(e) => updateIngrediente(idx, { cantidad: e.target.value })}
                      />
                    </Field>
                    <button
                      type="button" className="btn-icon mb-0.5" aria-label="Quitar ingrediente"
                      onClick={() => setReceta(formData.receta.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {opcionesIngrediente.length === 0 && (
                <p className="text-xs text-amber-700">Primero crea los insumos (tipo «Insumo») para poder armar recetas.</p>
              )}
              <button
                type="button" className="btn-secondary gap-2 text-sm"
                onClick={() => setReceta([...formData.receta, { insumoId: '', cantidad: '' }])}
              >
                <Plus className="w-4 h-4" aria-hidden="true" /> Agregar ingrediente
              </button>
            </fieldset>
          )}

          {verCostos && CON_RECETA.includes(formData.tipo) && editId && productoPorId.get(editId) && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-slate-600">
                Costo {formData.tipo === 'RECETA' ? 'por porción' : `por ${unidadCorta(formData.unidad_medida)}`}:{' '}
                <strong className="text-slate-800">{formatCOP(productoPorId.get(editId).costo)}</strong>
              </span>
              {formData.tipo === 'RECETA' && Number(productoPorId.get(editId).costo) > 0 && (
                <span className="text-slate-600">
                  Margen: <strong className="text-slate-800">{formatCOP(productoPorId.get(editId).margen)} ({pct(productoPorId.get(editId).margen_pct)})</strong>
                </span>
              )}
              <span className="text-xs text-slate-500 w-full">Calculado con el costo actual de los ingredientes; cambia cuando compras a otro precio.</span>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3 mt-3">
            <h4 className="font-semibold text-brand-800 text-sm mb-3">Datos DIAN (Facturación Electrónica)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="% IVA Aplicable">
                <select className="input-field" value={formData.porcentaje_iva || '19'} onChange={(e) => setFormData({ ...formData, porcentaje_iva: e.target.value })}>
                  <option value="19">19% (General)</option>
                  <option value="5">5% (Reducido)</option>
                  <option value="0">0% (Exento/Excluido)</option>
                </select>
              </Field>
              <Field label="Unidad de Medida (UBL)">
                <select className="input-field" value={formData.unidad_medida || '94'} onChange={(e) => cambiarUnidadBase(e.target.value)}>
                  {UNIDADES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
              {guardar.isPending ? 'Guardando…' : editId ? 'Actualizar' : 'Guardar en Base'}
            </button>
          </ModalActions>
        </form>
      </Modal>

      <Modal
        open={showImportModal}
        onClose={cerrarImportModal}
        title="Importar Inventario desde Excel"
        description={importResultado ? undefined : 'Crea productos nuevos o actualiza los que ya existan (por código).'}
        size="lg"
      >
        {importResultado ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                <p className="text-3xl font-bold text-emerald-700">{importResultado.creados.length}</p>
                <p className="text-sm font-medium text-emerald-800 mt-1">Productos creados</p>
              </div>
              <div className="rounded-xl bg-brand-50 border border-brand-200 p-4 text-center">
                <p className="text-3xl font-bold text-brand-700">{importResultado.actualizados.length}</p>
                <p className="text-sm font-medium text-brand-800 mt-1">Productos actualizados</p>
              </div>
            </div>

            {importResultado.omitidos.length > 0 ? (
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  {importResultado.omitidos.length} fila(s) omitida(s)
                </p>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {importResultado.omitidos.map((o) => (
                        <tr key={o.fila} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">Fila {o.fila}</td>
                          <td className="px-3 py-2 text-slate-700">{o.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Sin filas omitidas.
              </p>
            )}

            <ModalActions>
              <button type="button" className="btn-primary px-6" onClick={cerrarImportModal}>Cerrar</button>
            </ModalActions>
          </div>
        ) : (
          <form onSubmit={handleImportSubmit} className="space-y-4">
            <FormError message={importError} onDismiss={() => setImportError(null)} />

            <Field label="Archivo (.xlsx)" required>
              <input
                type="file"
                accept=".xlsx"
                className="input-field file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:font-medium file:text-sm"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </Field>

            <a
              href={URL_PLANTILLA}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              <FileDown className="w-4 h-4" aria-hidden="true" /> Descargar plantilla de ejemplo
            </a>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <fieldset>
                <legend className="block text-sm font-medium text-slate-700 mb-1.5">Si el producto ya existe, la cantidad debe</legend>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="modoCantidad"
                      checked={importOpciones.modoCantidad === 'sumar'}
                      onChange={() => setImportOpciones((o) => ({ ...o, modoCantidad: 'sumar' }))}
                      className="text-brand-700 focus:ring-brand-600"
                    />
                    Sumarse a la cantidad actual
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="modoCantidad"
                      checked={importOpciones.modoCantidad === 'reemplazar'}
                      onChange={() => setImportOpciones((o) => ({ ...o, modoCantidad: 'reemplazar' }))}
                      className="text-brand-700 focus:ring-brand-600"
                    />
                    Reemplazar por la del archivo
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="block text-sm font-medium text-slate-700 mb-1.5">El precio debe</legend>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="modoPrecio"
                      checked={importOpciones.modoPrecio === 'conservar'}
                      onChange={() => setImportOpciones((o) => ({ ...o, modoPrecio: 'conservar' }))}
                      className="text-brand-700 focus:ring-brand-600"
                    />
                    Conservar el actual
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="modoPrecio"
                      checked={importOpciones.modoPrecio === 'actualizar'}
                      onChange={() => setImportOpciones((o) => ({ ...o, modoPrecio: 'actualizar' }))}
                      className="text-brand-700 focus:ring-brand-600"
                    />
                    Actualizar al del archivo
                  </label>
                </div>
              </fieldset>
            </div>

            <ModalActions>
              <button type="button" className="btn-secondary" onClick={cerrarImportModal}>Cancelar</button>
              <button type="submit" disabled={importarProductos.isPending} className="btn-primary gap-2 px-6">
                {importarProductos.isPending ? 'Procesando…' : (<><Upload className="w-4 h-4" aria-hidden="true" /> Importar</>)}
              </button>
            </ModalActions>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default Inventario;
