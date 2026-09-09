import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { PackageOpen, Plus } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY_FORM = {
  codigo: '', nombre_producto: '', descripcion: '', precio_unitario: '', stock_actual: '',
  porcentaje_iva: '19', unidad_medida: '94', codigo_estandar: '',
};

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

  const { data: productos = [], isLoading, isError, error, refetch } = useEmpresaQuery(['productos'], '/productos');

  const crearProducto = useMutation({
    mutationFn: (payload) => api.post('/productos', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setShowModal(false);
      setFormData(EMPTY_FORM);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo crear el producto')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    crearProducto.mutate({ ...formData, stock_actual: parseInt(formData.stock_actual, 10) || 0 });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Catálogo e Inventario"
        description="Administra los productos base. El stock aumenta vía Compras."
        action={
          <button
            className="btn-primary gap-2"
            onClick={() => { setFormData(EMPTY_FORM); setFormError(null); setShowModal(true); }}
          >
            <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo Producto
          </button>
        }
      />

      <TableCard>
        <THead>
          <Th>SKU</Th>
          <Th>Producto</Th>
          <Th align="center">Stock Físico</Th>
          <Th align="right">Valor Unitario</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={4}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={productos.length === 0}
            emptyIcon={PackageOpen}
            emptyTitle="No hay productos en el catálogo"
            emptyHint="Crea el primero con «Nuevo Producto»."
          />
          {productos.map((p) => (
            <Tr key={p.id}>
              <Td className="font-mono text-sm text-slate-600 whitespace-nowrap">{p.codigo}</Td>
              <Td className="font-medium text-slate-800">{p.nombre_producto}</Td>
              <Td align="center">
                <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap ${stockTone(p.stock_actual)}`}>
                  {formatCantidad(p.stock_actual)} UD
                </span>
              </Td>
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{formatCOP(p.precio_unitario)}</Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Crear Artículo" size="lg">
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
            <Field label="Stock Físico Inicial" required>
              <input type="number" className="input-field" placeholder="50" value={formData.stock_actual || ''} onChange={(e) => setFormData({ ...formData, stock_actual: e.target.value })} />
            </Field>
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
            <button type="submit" disabled={crearProducto.isPending} className="btn-primary px-6">
              {crearProducto.isPending ? 'Guardando…' : 'Guardar en Base'}
            </button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

export default Inventario;
