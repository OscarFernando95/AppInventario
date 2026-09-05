import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { Briefcase, Plus, Edit } from 'lucide-react';
import { formatCOP } from '../../utils/format';

const Servicios = () => {
  const [servicios, setServicios] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ 
    nombre: '', descripcion: '', precio: '',
    porcentaje_iva: '19', unidad_medida: 'ZZ', codigo_estandar: ''
  });
  const [editId, setEditId] = useState(null);

  const fetchServicios = async () => {
    try {
      const res = await api.get('/servicios');
      setServicios(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchServicios(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/servicios/${editId}`, formData);
      } else {
        await api.post('/servicios', formData);
      }
      setShowModal(false);
      setEditId(null);
      setFormData({ 
        nombre: '', descripcion: '', precio: '',
        porcentaje_iva: '19', unidad_medida: 'ZZ', codigo_estandar: ''
      });
      fetchServicios();
    } catch (err) { alert('Error al guardar servicio'); }
  };

  const startEdit = (s) => {
    setEditId(s.id);
    setFormData({ 
      nombre: s.nombre, descripcion: s.descripcion, precio: s.precio,
      porcentaje_iva: s.porcentaje_iva || '19', unidad_medida: s.unidad_medida || 'ZZ', codigo_estandar: s.codigo_estandar || ''
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Catálogo de Servicios</h2>
          <p className="text-slate-500 mt-1">Servicios intangibles que monetizan pero no descuentan inventario</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { 
          setEditId(null); 
          setFormData({ 
            nombre: '', descripcion: '', precio: '',
            porcentaje_iva: '19', unidad_medida: 'ZZ', codigo_estandar: ''
          }); 
          setShowModal(true); 
        }}>
          <Plus className="w-5 h-5" /> Nuevo Servicio
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Servicio</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Descripción</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-right">Precio Base</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-center w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {servicios.length === 0 ? (
              <tr><td colSpan="4" className="text-center py-12 text-slate-400 font-bold">Aún no ofreces servicios adicionales.</td></tr>
            ) : servicios.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                   <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg"><Briefcase className="w-5 h-5"/></div> {s.nombre}
                </td>
                <td className="px-6 py-4 font-medium text-slate-500 max-w-xs truncate">{s.descripcion}</td>
                <td className="px-6 py-4 text-right font-black text-brand-600">
                  {formatCOP(s.precio)}
                </td>
                <td className="px-6 py-4 text-center">
                  <button onClick={() => startEdit(s)} className="p-2 text-slate-400 hover:text-brand-600 bg-slate-50 rounded-xl hover:bg-brand-50 transition-all font-bold text-xs"><Edit className="w-4 h-4"/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-xl relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre del Servicio</label><input required className="input-field rounded-xl" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})}/></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Precio Fijo ($)</label><input type="number" step="0.01" required className="input-field rounded-xl" value={formData.precio || ''} onChange={e => setFormData({...formData, precio: e.target.value})}/></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Código Estandar</label><input className="input-field rounded-xl" placeholder="999999" value={formData.codigo_estandar || ''} onChange={e => setFormData({...formData, codigo_estandar: e.target.value})}/></div>
              </div>
              
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Detalles Cortos</label><textarea className="input-field rounded-xl h-24 resize-none" value={formData.descripcion || ''} onChange={e => setFormData({...formData, descripcion: e.target.value})}/></div>

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
                    <select className="input-field rounded-xl" value={formData.unidad_medida || 'ZZ'} onChange={e => setFormData({...formData, unidad_medida: e.target.value})}>
                      <option value="ZZ">ZZ - Mutuamente definido (Servicios)</option>
                      <option value="HUR">HUR - Hora</option>
                      <option value="DAY">DAY - Día</option>
                      <option value="MON">MON - Mes</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">{editId ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Servicios;
