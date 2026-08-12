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
    if (error.response?.status === 401 || error.response?.status === 403) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
