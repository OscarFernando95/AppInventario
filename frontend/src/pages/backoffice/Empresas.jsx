import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { Building2, Plus, Power, ShieldCheck } from 'lucide-react';

const Empresas = () => {
  const [empresas, setEmpresas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', nit: '', contacto: '', activa: true, modulosIds: [] });

  const modulosDisponibles = [
    { id: 1, nombre: 'Inventario' },
    { id: 2, nombre: 'Ventas' },
    { id: 3, nombre: 'Compras' },
    { id: 4, nombre: 'Proveedores' },
    { id: 5, nombre: 'Informes' },
    { id: 6, nombre: 'Clientes' },
    { id: 7, nombre: 'Servicios' },
    { id: 8, nombre: 'Pedidos' }
  ];

  const handleToggleModulo = (id) => {
    setFormData(prev => ({
      ...prev,
      modulosIds: prev.modulosIds.includes(id)
        ? prev.modulosIds.filter(mId => mId !== id)
        : [...prev.modulosIds, id]
    }));
  };

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const fetchEmpresas = async () => {
    try {
      const res = await api.get('/empresas');
      setEmpresas(res.data);
    } catch (err) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/empresas/${editId}`, formData);
      } else {
        await api.post('/empresas', formData);
      }
      setShowModal(false);
      setEditId(null);
      setFormData({ nombre: '', nit: '', contacto: '', activa: true, modulosIds: [] });
      fetchEmpresas();
    } catch (err) { alert('Error al registrar empresa'); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Empresas (Tenants)</h2>
          <p className="text-slate-500 mt-1">Directorio global de empresas suscritas y estado de acceso.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setEditId(null); setFormData({ nombre: '', nit: '', contacto: '', activa: true, modulosIds: [] }); setShowModal(true); }}>
          <Plus className="w-5 h-5"/> Registrar Inquilino
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa / Razón Social</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">NIT / ID Fiscal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Módulos Autorizados</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado de Servicio</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-12 text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                    No hay inquilinos (empresas) registrados.
                  </td>
                </tr>
              ) : empresas.map(emp => (
                <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-brand-500/20">{emp.nombre.charAt(0)}</div>
                    {emp.nombre}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-500">{emp.nit}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{emp.contacto}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                       {emp.Modulos?.slice(0, 3).map(m => <span key={m.id} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{m.nombre_codigo}</span>)}
                       {emp.Modulos?.length > 3 && <span className="text-[10px] font-bold bg-brand-50 text-brand-600 px-2 py-1 rounded-md">+{emp.Modulos.length - 3}</span>}
                       {(!emp.Modulos || emp.Modulos.length === 0) && <span className="text-xs text-slate-400 italic">Ninguno</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm flex items-center gap-2 justify-center w-fit mx-auto ${emp.activa ? 'bg-emerald-100/50 text-emerald-700 border border-emerald-200' : 'bg-red-100/50 text-red-700 border border-red-200'}`}>
                      {emp.activa ? <ShieldCheck className="w-4 h-4"/> : <Power className="w-4 h-4"/>} 
                      {emp.activa ? 'ACTIVO' : 'SUSPENDIDO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => { setEditId(emp.id); setFormData({ nombre: emp.nombre, nit: emp.nit, contacto: emp.contacto, activa: emp.activa, modulosIds: emp.Modulos.map(m=>m.id) }); setShowModal(true); }}
                      className="text-brand-600 hover:text-brand-800 font-bold text-sm px-3 py-1.5 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                    >Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-[9999] animate-fade-in sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 sm:p-10 w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Empresa' : 'Registrar Nuevo Tenant'}</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Comercial</label><input required className="input-field rounded-xl" placeholder="Empresa XYZ" value={formData.nombre} onChange={e=>setFormData({...formData,nombre:e.target.value})}/></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT o Doc. Comercial</label><input required className="input-field rounded-xl" placeholder="123456789-0" value={formData.nit} onChange={e=>setFormData({...formData,nit:e.target.value})}/></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Datos de Contacto</label><input required className="input-field rounded-xl" placeholder="admin@xyz.com" value={formData.contacto} onChange={e=>setFormData({...formData,contacto:e.target.value})}/></div>
              {editId && (
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado de la Cuenta</label>
                  <select className="input-field rounded-xl" value={formData.activa} onChange={e=>setFormData({...formData,activa:e.target.value === 'true'})}>
                    <option value="true">Activo (Permitir Acceso)</option>
                    <option value="false">Suspendido (Bloquear Acceso)</option>
                  </select>
                </div>
              )}
              
              <div className="border-t border-slate-100 pt-4 mt-6">
                <label className="block text-sm font-bold text-slate-800 mb-3">Permisos a Módulos (Tenants)</label>
                <div className="grid grid-cols-2 gap-3">
                  {modulosDisponibles.map(mod => (
                    <label key={mod.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formData.modulosIds.includes(mod.id) ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500" 
                        checked={formData.modulosIds.includes(mod.id)}
                        onChange={() => handleToggleModulo(mod.id)}
                      />
                      <span className={`text-sm font-semibold ${formData.modulosIds.includes(mod.id) ? 'text-brand-700' : 'text-slate-600'}`}>{mod.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">{editId ? 'Guardar Cambios' : 'Activar Servicio'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default Empresas;
