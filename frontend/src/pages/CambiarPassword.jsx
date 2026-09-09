import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { Lock, Loader2, ShieldCheck, LogOut } from 'lucide-react';
import AuthCard, { AuthNotice } from '../components/ui/AuthCard';

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

  return (
    <AuthCard
      icon={ShieldCheck}
      title="Cambia tu contraseña"
      description={
        user?.mustChangePassword
          ? 'Por seguridad debes definir una contraseña nueva antes de continuar.'
          : 'Define una contraseña nueva para tu cuenta.'
      }
    >
      <AuthNotice tone="error">{error}</AuthNotice>
      <AuthNotice tone="success">{aviso}</AuthNotice>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="pwd-actual" className="block text-sm font-medium text-slate-300 mb-2">Contraseña actual</label>
          <input id="pwd-actual" type="password" required autoComplete="current-password" className="input-dark" value={actual} onChange={(e) => setActual(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pwd-nueva" className="block text-sm font-medium text-slate-300 mb-2">Nueva contraseña</label>
          <input
            id="pwd-nueva"
            type="password"
            required
            autoComplete="new-password"
            aria-describedby="pwd-nueva-hint"
            className="input-dark"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <p id="pwd-nueva-hint" className="text-xs text-slate-400 mt-1.5">
            Mínimo 8 caracteres, con al menos una letra y un número.
          </p>
        </div>
        <div>
          <label htmlFor="pwd-confirmar" className="block text-sm font-medium text-slate-300 mb-2">Confirmar nueva contraseña</label>
          <input id="pwd-confirmar" type="password" required autoComplete="new-password" className="input-dark" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full py-3.5 gap-2 focus-visible:ring-offset-dark-800">
          {isLoading
            ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Guardando…" />
            : <><Lock className="w-4 h-4" aria-hidden="true" /> Guardar contraseña</>}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-dark-700">
        <p className="text-sm font-medium text-slate-200 mb-1">Sesiones activas</p>
        <p className="text-xs text-slate-400 mb-4">
          Cierra la sesión en cualquier otro dispositivo o navegador donde tu cuenta siga abierta. Esta sesión se mantiene.
        </p>
        <button type="button" onClick={cerrarOtrasSesiones} disabled={cerrandoSesiones} className="btn-dark gap-2">
          {cerrandoSesiones
            ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Cerrando…" />
            : <><LogOut className="w-4 h-4" aria-hidden="true" /> Cerrar mis otras sesiones</>}
        </button>
      </div>
    </AuthCard>
  );
};

export default CambiarPassword;
