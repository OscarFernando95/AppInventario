import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';

/**
 * useQuery acotado a la empresa activa. El id de la empresa forma parte de la
 * queryKey, así que al cambiar de empresa se muestran (o se vuelven a pedir)
 * los datos correctos automáticamente. Las peticiones no se lanzan hasta que
 * hay una empresa activa (o el usuario es de BackOffice).
 *
 *   const { data, isLoading } = useEmpresaQuery(['productos'], '/productos');
 *   const { data } = useEmpresaQuery(['dashboard'], async () => (await api.get('/reportes/dashboard')).data);
 */
export function useEmpresaQuery(key, urlOrFn, options = {}) {
  const empresaId = useAuthStore((s) => s.activeEmpresa?.id);
  const isBackoffice = useAuthStore((s) => s.user?.rol === 'BACKOFFICE_ADMIN');

  const queryFn =
    typeof urlOrFn === 'function'
      ? urlOrFn
      : async () => {
          const res = await api.get(urlOrFn);
          return res.data;
        };

  return useQuery({
    queryKey: ['empresa', empresaId ?? null, ...(Array.isArray(key) ? key : [key])],
    queryFn,
    enabled: (isBackoffice || Boolean(empresaId)) && (options.enabled ?? true),
    ...options,
  });
}
