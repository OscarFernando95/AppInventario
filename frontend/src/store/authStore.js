import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,    
      token: null,
      isAuthenticated: false,
      activeEmpresa: null,
      
      login: (userData, authToken) => {
        Cookies.set('token', authToken, { expires: 1 });
        const autoActive = userData.empresas?.length === 1 ? userData.empresas[0] : null;
        set({ user: userData, token: authToken, isAuthenticated: true, activeEmpresa: autoActive });
      },
      setActiveEmpresa: (empresaData) => {
        set({ activeEmpresa: empresaData });
      },
      logout: () => {
        Cookies.remove('token');
        set({ user: null, token: null, isAuthenticated: false, activeEmpresa: null });
      }
    }),
    { name: 'auth-storage' }
  )
);
