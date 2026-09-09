import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';

// Catálogos estáticos (DANE / CIIU) y lista de módulos. Datos que no cambian en
// runtime: se cachean de forma indefinida y se comparten entre páginas.
const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 1 };

export function useDepartamentos() {
  return useQuery({
    queryKey: ['catalogo', 'departamentos'],
    queryFn: async () => (await api.get('/catalogos/departamentos')).data,
    ...STATIC,
  });
}

export function useMunicipios(departamentoCodigo) {
  // Se trae la lista completa una vez y se filtra en cliente (1123 registros).
  return useQuery({
    queryKey: ['catalogo', 'municipios'],
    queryFn: async () => (await api.get('/catalogos/municipios')).data,
    ...STATIC,
    select: (todos) =>
      departamentoCodigo
        ? todos.filter((m) => m.departamento_codigo === departamentoCodigo)
        : todos,
  });
}

export function useCiiu() {
  return useQuery({
    queryKey: ['catalogo', 'ciiu'],
    queryFn: async () => (await api.get('/catalogos/ciiu')).data,
    ...STATIC,
  });
}

export function useModulos() {
  return useQuery({
    queryKey: ['catalogo', 'modulos'],
    queryFn: async () => (await api.get('/modulos')).data,
    staleTime: 5 * 60 * 1000,
  });
}
