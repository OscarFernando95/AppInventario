import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Lock, User, Loader2, Building } from 'lucide-react';

const LoginProvider = () => {
  const [username, setUsername] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tempUser, setTempUser] = useState(null);
  
  const navigate = useNavigate();
  const { login, setActiveEmpresa } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { username, contrasena });
      const { token, usuario } = response.data;
      
      login(usuario, token);

      if (usuario.mustChangePassword) {
        navigate('/cambiar-password', { replace: true });
      } else if (usuario.rol === 'BACKOFFICE_ADMIN') {
        navigate('/backoffice');
      } else if (usuario.empresas?.length > 1) {
        setTempUser(usuario);
      } else if (usuario.empresas?.length === 1) {
        navigate('/app');
      } else {
        setError('No tienes empresas asignadas en el sistema');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCompany = (empresa) => {
    setActiveEmpresa(empresa);
    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center relative overflow-hidden text-slate-100">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-brand-900/30 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-md bg-dark-800/80 backdrop-blur-xl border border-dark-700/50 p-8 sm:p-10 rounded-3xl shadow-2xl relative z-10 transition-all">
        {tempUser ? (
          <div className="animate-fade-in space-y-6">
            <div className="text-center mb-6">
               <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/30">
                 <Building className="w-8 h-8 text-white stroke-[1.5]" />
               </div>
               <h2 className="text-2xl font-bold text-white mb-2">Selecciona un Entorno</h2>
               <p className="text-slate-400 text-sm">Tu cuenta está vinculada a múltiples dominios</p>
            </div>
            <div className="space-y-3">
              {tempUser.empresas.map(emp => (
                <button 
                  key={emp.id}
                  onClick={() => handleSelectCompany(emp)}
                  className="w-full flex items-center justify-between p-4 bg-dark-900/50 border border-dark-700 hover:border-brand-500/50 hover:bg-dark-700/50 transition-all rounded-xl cursor-pointer group"
                >
                   <span className="font-bold text-slate-200 group-hover:text-brand-400">{emp.nombre}</span>
                   <span className="text-xs font-bold bg-brand-500/10 text-brand-400 px-2.5 py-1 rounded-md">Entrar</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/30">
                <Lock className="w-8 h-8 text-white stroke-[1.5]" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Gestión de Inventario</h1>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm text-center flex items-center justify-center gap-2">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Usuario de Acceso</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-400">
                    <User className="h-5 w-5 text-slate-500 group-focus-within:text-brand-400" />
                  </div>
                  <input
                    type="text"
                    required
                    className="block w-full pl-11 pr-4 py-3 bg-dark-900/50 border border-dark-700 outline-none rounded-xl focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 text-white placeholder-slate-600 transition-all"
                    placeholder="admin"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Contraseña</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-400">
                    <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-brand-400" />
                  </div>
                  <input
                    type="password"
                    required
                    className="block w-full pl-11 pr-4 py-3 bg-dark-900/50 border border-dark-700 outline-none rounded-xl focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 text-white placeholder-slate-600 transition-all"
                    placeholder="••••••••"
                    value={contrasena}
                    onChange={e => setContrasena(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-[0_4px_14px_0_rgba(14,165,233,0.39)] text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 hover:shadow-[0_6px_20px_rgba(14,165,233,0.23)] active:scale-[0.98] outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar al Sistema'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginProvider;
