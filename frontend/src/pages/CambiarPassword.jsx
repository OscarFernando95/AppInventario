import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Lock, Loader2, ShieldCheck, LogOut } from 'lucide-react';

const CambiarPassword = () => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cerrandoSesiones, setCerrandoSesiones] = useState(false);
  const [aviso, setAviso] = useState('');

  const navigate = useNavigate();
  const { user, clearMustChangePassword } = useAuthStore();

  const destino = user?.rol === 'BACKOFFICE_ADMIN' ? '/backoffice' : '/app';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (nueva !== confirmar) {
      setError('La nueva contraseña y su confirmación no coinciden');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/change-password', { actual, nueva });
      clearMustChangePassword();
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  const cerrarOtrasSesiones = async () => {
    setError('');
    setAviso('');
    setCerrandoSesiones(true);
    try {
      const { data } = await api.post('/auth/logout-all?mantener_actual=true');
      setAviso(`Se cerraron ${data?.revocadas ?? 0} sesión(es) en otros dispositivos.`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cerrar las otras sesiones');
    } finally {
      setCerrandoSesiones(false);
    }
  };

  const inputClass =
    'block w-full px-4 py-3 bg-dark-900/50 border border-dark-700 outline-none rounded-xl focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 text-white placeholder-slate-600 transition-all';

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center relative overflow-hidden text-slate-100 p-4">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-dark-800/80 backdrop-blur-xl border border-dark-700/50 p-8 sm:p-10 rounded-3xl shadow-2xl relative z-10">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/30">
            <ShieldCheck className="w-8 h-8 text-white stroke-[1.5]" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">Cambia tu contraseña</h1>
          <p className="text-slate-400 text-sm">
            {user?.mustChangePassword
              ? 'Por seguridad debes definir una contraseña nueva antes de continuar.'
              : 'Define una contraseña nueva para tu cuenta.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {aviso && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm text-center">
            {aviso}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Contraseña actual</label>
            <input type="password" required className={inputClass} value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Nueva contraseña</label>
            <input type="password" required className={inputClass} value={nueva} onChange={(e) => setNueva(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1.5">Mínimo 8 caracteres, con al menos una letra y un número.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Confirmar nueva contraseña</label>
            <input type="password" required className={inputClass} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 active:scale-[0.98] outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Lock className="w-4 h-4" /> Guardar contraseña</>}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-dark-700/60">
          <p className="text-sm font-medium text-slate-300 mb-1">Sesiones activas</p>
          <p className="text-xs text-slate-500 mb-4">
            Cierra la sesión en cualquier otro dispositivo o navegador donde tu cuenta siga abierta. Esta sesión se mantiene.
          </p>
          <button
            type="button"
            onClick={cerrarOtrasSesiones}
            disabled={cerrandoSesiones}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-slate-200 bg-dark-900/50 border border-dark-700 hover:bg-dark-700/50 active:scale-[0.98] outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {cerrandoSesiones ? <Loader2 className="w-5 h-5 animate-spin" /> : <><LogOut className="w-4 h-4" /> Cerrar mis otras sesiones</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CambiarPassword;
