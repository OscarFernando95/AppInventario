import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { UserPlus, Shield, Mail, Search, Trash2, User } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';

const EMPTY = { nombre: '', username: '', contrasena: '', rolId: 3 }; // 3 = FRONT_USER

const AdminUsuarios = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(EMPTY);

  const { data: usuarios = [] } = useEmpresaQuery(['usuarios-empresa'], '/usuarios');

  const crear = useMutation({
    mutationFn: (data) => api.post('/usuarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setFormData(EMPTY);
    },
    onError: () => alert('Error en API al crear usuario. Verifica el backend.'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    crear.mutate(formData);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Personal</h2>
          <p className="text-slate-500 mt-1">Controla quién tiene acceso al sistema de tu empresa</p>
        </div>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Buscar empleado..."
            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none w-64 shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Formulario */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm h-fit">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-brand-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Nuevo Gestor</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Completo</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre de Usuario</label>
              <div className="relative">
                <User className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Seña de Acceso</label>
              <input
                type="password"
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={formData.contrasena}
                onChange={e => setFormData({...formData, contrasena: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nivel de Seguridad</label>
              <div className="relative">
                <Shield className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all appearance-none"
                  value={formData.rolId}
                  onChange={e => setFormData({...formData, rolId: parseInt(e.target.value)})}
                >
                  <option value={3}>Usuario Operativo</option>
                  <option value={2}>Administrador Delegado</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 mt-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(14,165,233,0.39)] transition-all active:scale-[0.98]"
            >
              Dar de Alta
            </button>
          </form>
        </div>

        {/* Lista de Usuarios */}
        <div className="xl:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="text-xl font-bold text-slate-800 mb-6">Directorio Activo</h3>
          
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="pb-3 font-semibold px-4 whitespace-nowrap">Nombre</th>
                  <th className="pb-3 font-semibold px-4 whitespace-nowrap">Usuario</th>
                  <th className="pb-3 font-semibold px-4 whitespace-nowrap">Rol</th>
                  <th className="pb-3 font-semibold px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shadow-inner">
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-700">{u.nombre}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-slate-500 text-sm font-medium">@{u.username}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        u.Role?.nombre.includes('Admin') ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {u.Role?.nombre}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminUsuarios;
