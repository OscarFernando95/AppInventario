import { QueryClient } from '@tanstack/react-query';

// Un dato de servidor se considera "fresco" 30 s: durante ese tiempo, volver a
// una vista ya visitada no dispara otra petición (deduplicación + caché).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
