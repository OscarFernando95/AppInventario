import { useEmpresaQuery } from './useEmpresaQuery';

/**
 * Opciones (interruptores de funciones) de la empresa activa. Cada pantalla pregunta por la suya:
 *
 *   const { opcion } = useOpciones();
 *   {opcion('reservas', true) && <Reservas />}
 *
 * `porOmision` es lo que vale MIENTRAS carga (o si el servidor no la conoce): para las funciones que ya existían se pasa
 * `true` (no parpadean al entrar) y para las nuevas `false` (nacen apagadas). El servidor siempre es quien manda.
 */
export function useOpciones() {
  const { data, isLoading } = useEmpresaQuery(['opciones'], '/opciones', { staleTime: 30_000, refetchOnWindowFocus: true });
  const valores = data?.valores;
  return {
    valores: valores || {},
    catalogo: data?.catalogo || [],
    perfiles: data?.perfiles || [],
    cargando: isLoading,
    opcion: (clave, porOmision = false) => (valores && clave in valores ? valores[clave] : porOmision),
  };
}
