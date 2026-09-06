import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      activeEmpresa: null,

      login: (userData, authToken) => {
        const autoActive = userData.empresas?.length === 1 ? userData.empresas[0] : null;
        set({ user: userData, token: authToken, isAuthenticated: true, activeEmpresa: autoActive });
      },
      setActiveEmpresa: (empresaData) => {
        set({ activeEmpresa: empresaData });
      },
      // Marca la contraseña como ya cambiada (tras POST /auth/change-password).
      clearMustChangePassword: () => {
        set((state) => ({ user: state.user ? { ...state.user, mustChangePassword: false } : state.user }));
      },
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, activeEmpresa: null });
      },
    }),
    { name: 'auth-storage' }
  )
);
