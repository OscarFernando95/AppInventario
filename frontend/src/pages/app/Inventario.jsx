import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { PackageOpen, Plus, Upload, FileDown, CheckCircle2, AlertTriangle, Edit } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
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
};

const IMPORT_OPCIONES_INICIALES = { modoCantidad: 'sumar', modoPrecio: 'conservar' };

// La cookie de sesión viaja sola en una navegación normal, así que un <a> a
// esta URL basta para descargar la plantilla sin JS ni volver a pedir empresa.
const URL_PLANTILLA = `${import.meta.env.VITE_API_URL || '/api'}/productos/plantilla`;

/** Umbral por debajo del cual el stock se marca como bajo. */
const STOCK_BAJO = 10;

const stockTone = (stock) => {
  const n = Number(stock);
  if (n >= STOCK_BAJO) return 'bg-emerald-100 text-emerald-800';
  if (n > 0) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
};

const Inventario = () => {
  const queryClient = useQueryClient();
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

  const { data: productos = [], isLoading, isError, error, refetch } = useEmpresaQuery(['productos'], '/productos');

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (q && !(`${p.codigo} ${p.nombre_producto}`.toLowerCase().includes(q))) return false;
      const stock = Number(p.stock_actual);
      if (filtroStock === 'agotado' && stock > 0) return false;
      if (filtroStock === 'bajo' && stock >= STOCK_BAJO) return false;
      return true;
    });
  }, [productos, busqueda, filtroStock]);

  const hayFiltros = !!busqueda || !!filtroStock;

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
    });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (editId) {
      // El stock no se edita aquí (lo mueven compras/ventas); el schema lo omite igual.
      const { stock_actual: _s, ...resto } = formData;
      guardar.mutate(resto);
    } else {
      guardar.mutate({ ...formData, stock_actual: parseInt(formData.stock_actual, 10) || 0 });
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

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => { setBusqueda(''); setFiltroStock(''); }}>
        <SearchInput placeholder="Código o nombre…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-64" />
        <Field label="Stock" className="w-full sm:w-44">
          <select className="input-field" value={filtroStock} onChange={(e) => setFiltroStock(e.target.value)}>
            <option value="">Todos</option>
            <option value="bajo">Stock bajo (&lt; {STOCK_BAJO})</option>
            <option value="agotado">Agotados</option>
          </select>
        </Field>
      </FilterBar>

      <TableCard>
        <THead>
          <Th>SKU</Th>
          <Th>Producto</Th>
          <Th align="center">Stock Físico</Th>
          <Th align="right">Valor Unitario</Th>
          <Th align="center" className="w-20">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5}
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
              <Td className="font-medium text-slate-800">{p.nombre_producto}</Td>
              <Td align="center">
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap ${stockTone(p.stock_actual)}`}>
                  {formatCantidad(p.stock_actual)} UD
                </span>
              </Td>
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{formatCOP(p.precio_unitario)}</Td>
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
            <Field label="Precio de Venta ($)" required>
              <input type="number" step="0.01" className="input-field" placeholder="1500.00" value={formData.precio_unitario || ''} onChange={(e) => setFormData({ ...formData, precio_unitario: e.target.value })} />
            </Field>
            {editId ? (
              <Field label="Stock actual" hint="El stock se ajusta con Compras y Ventas, no aquí.">
                <input className="input-field bg-slate-50 text-slate-500" value={`${formatCantidad(productos.find((p) => p.id === editId)?.stock_actual ?? 0)} UD`} readOnly />
              </Field>
            ) : (
              <Field label="Stock Físico Inicial" required>
                <input type="number" className="input-field" placeholder="50" value={formData.stock_actual || ''} onChange={(e) => setFormData({ ...formData, stock_actual: e.target.value })} />
              </Field>
            )}
          </div>

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
                <select className="input-field" value={formData.unidad_medida || '94'} onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}>
                  <option value="94">94 - Unidad</option>
                  <option value="KGM">KGM - Kilogramos</option>
                  <option value="LTR">LTR - Litros</option>
                  <option value="MTK">MTK - Metros Cuadrados</option>
                  <option value="HUR">HUR - Hora</option>
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
