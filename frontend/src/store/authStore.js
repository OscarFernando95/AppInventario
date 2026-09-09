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
