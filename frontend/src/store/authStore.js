import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useAuthStore = create(
  persist(
    (set) => ({
      // El token NO se guarda aquí: vive en una cookie httpOnly que el navegador
      // envía sola. Solo persistimos datos de UI (usuario, empresa activa).
      user: null,
      isAuthenticated: false,
      activeEmpresa: null,

      login: (userData) => {
        const autoActive = userData.empresas?.length === 1 ? userData.empresas[0] : null;
        set({ user: userData, isAuthenticated: true, activeEmpresa: autoActive });
      },
      setActiveEmpresa: (empresaData) => {
        set({ activeEmpresa: empresaData });
      },
      // Refresca rol, empresas y módulos con los datos ACTUALES del servidor (GET
      // /auth/me), para que un cambio de módulos hecho en el backoffice se vea sin
      // cerrar sesión. No toca nada si no cambió, para no re-renderizar en balde.
      syncSesion: (datos) => {
        set((state) => {
          if (!state.user || !datos) return state;
          const empresas = datos.empresas || [];
          const activa = state.activeEmpresa
            ? empresas.find((e) => e.id === state.activeEmpresa.id) || null
            : (empresas.length === 1 ? empresas[0] : null);
          const mismo = JSON.stringify([state.user.empresas, state.user.rol, state.user.nombre, state.activeEmpresa])
            === JSON.stringify([empresas, datos.rol, datos.nombre, activa]);
          if (mismo) return state;
          return { user: { ...state.user, nombre: datos.nombre, rol: datos.rol, empresas }, activeEmpresa: activa };
        });
      },
      clearMustChangePassword: () => {
        set((state) => ({ user: state.user ? { ...state.user, mustChangePassword: false } : state.user }));
      },
      logout: async () => {
        try {
          await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch {
          /* la cookie se limpia igual en el cliente */
        }
        set({ user: null, isAuthenticated: false, activeEmpresa: null });
      },
    }),
    { name: 'auth-storage' }
  )
);
