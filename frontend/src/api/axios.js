import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use(
  (config) => {
    const state = useAuthStore.getState();
    if (state.token) {
      config.headers['Authorization'] = `Bearer ${state.token}`;
    }
    if (state.activeEmpresa) {
      config.headers['X-Empresa-Id'] = state.activeEmpresa.id;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Solo un 401 (sesión inválida/expirada) cierra la sesión. Un 403
    // (sin permiso para ese recurso o esa empresa) NO debe desloguear:
    // se deja que la vista muestre el error.
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
