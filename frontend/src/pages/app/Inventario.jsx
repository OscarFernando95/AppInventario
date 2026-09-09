import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { PackageOpen, Plus, Loader2 } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';

const EMPTY_FORM = {
  codigo: '', nombre_producto: '', descripcion: '', precio_unitario: '', stock_actual: '',
  porcentaje_iva: '19', unidad_medida: '94', codigo_estandar: '',
};

const Inventario = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);

  const { data: productos = [], isLoading } = useEmpresaQuery(['productos'], '/productos');

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Catálogo e Inventario</h2>
          <p className="text-slate-500 mt-1">Administra los productos base. El stock aumenta vía Compras.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => {
          setFormData(EMPTY_FORM);
          setFormError(null);
          setShowModal(true);
        }}>
          <Plus className="w-5 h-5" /> Nuevo Producto
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Producto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-center">Stock Físico</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-right">Valor Unitario</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="4" className="text-center py-12 text-slate-400">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin opacity-40" />
                  </td>
                </tr>
              ) : productos.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-12 text-slate-400">
                    <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No hay productos en el catálogo
                  </td>
                </tr>
              ) : productos.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-500">{p.codigo}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{p.nombre_producto}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide ${Number(p.stock_actual) >= 10 ? 'bg-emerald-100 text-emerald-700' : Number(p.stock_actual) > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {formatCantidad(p.stock_actual)} UD
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-700">
                    {formatCOP(p.precio_unitario)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-[9999] animate-fade-in sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 sm:p-10 w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">Crear Artículo</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormError message={formError} onDismiss={() => setFormError(null)} />
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Código SKU</label><input required className="input-field rounded-xl" placeholder="PROD-001" value={formData.codigo || ''} onChange={e => setFormData({...formData, codigo: e.target.value})}/></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Código Estandar</label><input className="input-field rounded-xl" placeholder="999999" value={formData.codigo_estandar || ''} onChange={e => setFormData({...formData, codigo_estandar: e.target.value})}/></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción</label><input required className="input-field rounded-xl" placeholder="Laptop Gamer ZX" value={formData.nombre_producto || ''} onChange={e => setFormData({...formData, nombre_producto: e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Precio de Venta ($)</label><input type="number" step="0.01" required className="input-field rounded-xl" placeholder="1500.00" value={formData.precio_unitario || ''} onChange={e => setFormData({...formData, precio_unitario: e.target.value})}/></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Stock Físico Inicial</label><input type="number" required className="input-field rounded-xl" placeholder="50" value={formData.stock_actual || ''} onChange={e => setFormData({...formData, stock_actual: e.target.value})}/></div>
              </div>

              <div className="border-t border-slate-100 pt-3 mt-3">
                <h4 className="font-bold text-brand-600 text-sm mb-3">Datos DIAN (Facturación Electrónica)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">% IVA Aplicable</label>
                    <select className="input-field rounded-xl" value={formData.porcentaje_iva || '19'} onChange={e => setFormData({...formData, porcentaje_iva: e.target.value})}>
                      <option value="19">19% (General)</option>
                      <option value="5">5% (Reducido)</option>
                      <option value="0">0% (Exento/Excluido)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unidad de Medida (UBL)</label>
                    <select className="input-field rounded-xl" value={formData.unidad_medida || '94'} onChange={e => setFormData({...formData, unidad_medida: e.target.value})}>
                      <option value="94">94 - Unidad</option>
                      <option value="KGM">KGM - Kilogramos</option>
                      <option value="LTR">LTR - Litros</option>
                      <option value="MTK">MTK - Metros Cuadrados</option>
                      <option value="HUR">HUR - Hora</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" disabled={crearProducto.isPending} className="btn-primary rounded-xl px-6 disabled:opacity-50">
                  {crearProducto.isPending ? 'Guardando…' : 'Guardar en Base'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Inventario;
