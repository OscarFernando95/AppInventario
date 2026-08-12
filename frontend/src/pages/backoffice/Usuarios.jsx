import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { UserPlus, User } from 'lucide-react';

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', username: '', contrasena: '', rolId: 2, empresaIds: [] });

  const handleToggleEmpresa = (id) => {
    setFormData(prev => ({
      ...prev,
      empresaIds: prev.empresaIds.includes(id)
        ? prev.empresaIds.filter(eId => eId !== id)
        : [...prev.empresaIds, id]
    }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [resUsers, resEmpresas] = await Promise.all([
        api.get('/usuarios'),
        api.get('/empresas')
      ]);
      setUsuarios(resUsers.data);
      setEmpresas(resEmpresas.data);
    } catch(err){}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.rolId !== 1 && formData.empresaIds.length === 0) {
      alert('Debe seleccionar al menos una empresa para usuarios inquilinos');
      return;
    }
    try {
      if (editId) {
        await api.put(`/usuarios/${editId}`, formData);
      } else {
        await api.post('/usuarios', formData);
      }
      setShowModal(false);
      setEditId(null);
      setFormData({ nombre: '', username: '', contrasena: '', rolId: 2, empresaIds: [] });
      fetchData();
    } catch (err) { alert('Error al crear administrador'); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Cuentas de Acceso</h2>
          <p className="text-slate-500 mt-1">Gestión global de credenciales y administradores de inquilinos (Tenants).</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setEditId(null); setFormData({ nombre: '', username: '', contrasena: '', rolId: 2, empresaIds: [] }); setShowModal(true); }}>
          <UserPlus className="w-5 h-5"/> Asignar Administrador
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre Completo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa Asignada</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Nivel</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600 shadow-inner">
                      {u.nombre.charAt(0)}
                    </div>
                    {u.nombre}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-medium tracking-wide">@{u.username}</td>
                  <td className="px-6 py-4 font-bold text-brand-600">
                    {u.rolId === 1 ? 'Acceso Global (BackOffice)' : (u.Empresas && u.Empresas.length > 0 ? u.Empresas.map(e=>e.nombre).join(', ') : <span className="text-red-400 font-normal italic">Sin Empresas</span>)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm ${u.rolId === 1 ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                      {u.Role?.nombre?.toUpperCase() || 'USUARIO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm ${u.estado ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                      {u.estado ? 'ACTIVO' : 'SUSPENDIDO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => { setEditId(u.id); setFormData({ nombre: u.nombre, username: u.username, contrasena: '', rolId: u.rolId, estado: u.estado, empresaIds: u.Empresas ? u.Empresas.map(e=>e.id) : [] }); setShowModal(true); }}
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
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Usuario' : 'Vincular Usuario'}</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Ref.</label><input required className="input-field rounded-xl" placeholder="Juan Gerente" value={formData.nombre} onChange={e=>setFormData({...formData,nombre:e.target.value})}/></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Username (Log-In)</label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input required className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all" placeholder="admin_empresax" value={formData.username} onChange={e=>setFormData({...formData,username:e.target.value})}/>
                </div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Constraseña Gen.</label><input type="password" required={!editId} className="input-field rounded-xl" placeholder={editId ? '(Dejar vacío para no cambiar)' : 'Obligatorio genérica'} value={formData.contrasena} onChange={e=>setFormData({...formData,contrasena:e.target.value})}/></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nivel de Acceso</label>
                <select className="input-field rounded-xl" value={formData.rolId} onChange={e=>setFormData({...formData,rolId:parseInt(e.target.value)})}>
                  <option value={1}>Súper Administrador (Global)</option>
                  <option value={2}>Administrador de Empresa</option>
                  <option value={3}>Usuario Operativo</option>
                </select>
              </div>
              
              {editId && (
                <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado de la Cuenta</label>
                  <select className="input-field rounded-xl" value={formData.estado !== false} onChange={e=>setFormData({...formData,estado:e.target.value === 'true'})}>
                    <option value="true">Activo (Permitir Acceso)</option>
                    <option value="false">Suspendido (Bloquear Acceso)</option>
                  </select>
                </div>
              )}

              {formData.rolId !== 1 && (
                <div className="border-t border-slate-100 pt-4 mt-6">
                  <label className="block text-sm font-bold text-slate-800 mb-3">Asignar a Empresas</label>
                  <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-2">
                    {empresas.map(emp => (
                      <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formData.empresaIds.includes(emp.id) ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500" 
                          checked={formData.empresaIds.includes(emp.id)}
                          onChange={() => handleToggleEmpresa(emp.id)}
                        />
                        <span className={`text-sm font-semibold truncate ${formData.empresaIds.includes(emp.id) ? 'text-brand-700' : 'text-slate-600'}`}>{emp.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">Crear Acceso</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default Usuarios;
