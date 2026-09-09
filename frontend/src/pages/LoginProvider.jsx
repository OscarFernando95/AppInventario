import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Lock, User, Loader2, Building } from 'lucide-react';
import AuthCard, { AuthNotice } from '../components/ui/AuthCard';

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
      const { usuario } = response.data;

      login(usuario);

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

  if (tempUser) {
    return (
      <AuthCard
        icon={Building}
        title="Selecciona un Entorno"
        description="Tu cuenta está vinculada a múltiples dominios"
      >
        <div className="space-y-3 animate-fade-in">
          {tempUser.empresas.map((emp) => (
            <button
              key={emp.id}
              onClick={() => handleSelectCompany(emp)}
              className="w-full flex items-center justify-between p-4 bg-dark-900/50 border border-dark-700 rounded-xl
                         hover:border-brand-400/60 hover:bg-dark-700/50 transition-all cursor-pointer group
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="font-semibold text-slate-100 group-hover:text-brand-300">{emp.nombre}</span>
              <span className="text-xs font-semibold bg-brand-500/15 text-brand-200 px-2.5 py-1 rounded-md">Entrar</span>
            </button>
          ))}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={Lock} title="Gestión de Inventario">
      <AuthNotice tone="error">{error}</AuthNotice>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="login-username" className="block text-sm font-medium text-slate-300 mb-2">
            Usuario de Acceso
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-slate-400 group-focus-within:text-brand-300 transition-colors" aria-hidden="true" />
            </div>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              className="input-dark pl-11"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-2">
            Contraseña
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-brand-300 transition-colors" aria-hidden="true" />
            </div>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              className="input-dark pl-11"
              placeholder="••••••••"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3.5 focus-visible:ring-offset-dark-800"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Entrando…" /> : 'Entrar al Sistema'}
        </button>
      </form>
    </AuthCard>
  );
};

export default LoginProvider;
