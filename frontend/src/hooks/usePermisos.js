import { useAuthStore } from '../store/authStore';

/**
 * Lo que el usuario puede hacer en la empresa activa. Los permisos y los módulos a los que entra
 * viajan en la sesión (`/auth/me`); el backend los vuelve a exigir en cada petición, esto solo
 * decide qué se muestra. Un BACKOFFICE_ADMIN no opera una empresa, así que no tiene permisos.
 */
export function usePermisos() {
  const permisos = useAuthStore((s) => s.activeEmpresa?.permisos);
  // Sesiones guardadas antes de existir los roles no traen `acceso`: valen los módulos de la empresa hasta que /auth/me las refresque.
  const acceso = useAuthStore((s) => s.activeEmpresa?.acceso ?? s.activeEmpresa?.modulos);
  const modulos = useAuthStore((s) => s.activeEmpresa?.modulos);
  return {
    can: (codigo) => (permisos || []).includes(codigo),
    /** ¿La empresa lo contrató y el rol del usuario lo deja entrar? */
    puedeEntrar: (modulo) => (acceso || []).includes(modulo),
    /** ¿La empresa lo tiene contratado? (para reglas de negocio, no para el menú) */
    tieneModulo: (modulo) => (modulos || []).includes(modulo),
  };
}
