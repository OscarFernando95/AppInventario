import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { UserPlus, Search, Users as UsersIcon } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { usePermisos } from '../../hooks/usePermisos';
import { useAuthStore } from '../../store/authStore';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

// El rol se elige en un solo campo: `base:<rolId>` (Operativo = 3, Administrador = 2) o `propio:<id>` (rol de la empresa).
const EMPTY = { nombre: '', username: '', contrasena: '', rol: 'base:3' };

const cuerpoDeRol = (rol) => {
  const [tipo, id] = rol.split(':');
  return tipo === 'propio' ? { rolEmpresaId: Number(id) } : { rolId: Number(id) };
};

const AdminUsuarios = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const { can, puedeEntrar } = usePermisos();
  const miId = useAuthStore((s) => s.user?.id);
  const { data: usuarios = [], isLoading, isError, error, refetch } = useEmpresaQuery(['usuarios-empresa'], '/usuarios');

  // Roles propios de la empresa (solo si contrató "Roles y permisos"). Sin ellos quedan los dos roles base de siempre.
  const conRoles = puedeEntrar('Roles y permisos');
  const { data: catalogoRoles } = useEmpresaQuery(['roles'], '/roles', { enabled: conRoles });
  const propios = catalogoRoles?.propios || [];
  const misPermisos = new Set(catalogoRoles?.mis_permisos || []);
  const opcionesDeRol = [
    { valor: 'base:3', nombre: 'Usuario Operativo', permitido: true },
    { valor: 'base:2', nombre: 'Administrador Delegado', permitido: !conRoles || (catalogoRoles?.base || []).find((r) => r.clave === 'FRONT_ADMIN')?.permisos.every((p) => misPermisos.has(p)) },
    ...propios.map((r) => ({ valor: `propio:${r.id}`, nombre: r.nombre, permitido: r.permisos.every((p) => misPermisos.has(p)) })),
  ];
  const valorDeRol = (u) => (u.rolEmpresaId ? `propio:${u.rolEmpresaId}` : `base:${u.rolId}`);

  // El buscador existía en la UI pero no tenía estado ni onChange: era una caja
  // de texto que no filtraba nada. Ahora filtra por nombre y username.
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nombre?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q)
    );
  }, [usuarios, busqueda]);

  const crear = useMutation({
    mutationFn: (data) => api.post('/usuarios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setFormData(EMPTY);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo crear el usuario')),
  });

  const [errorRol, setErrorRol] = useState(null);
  const cambiarRol = useMutation({
    mutationFn: ({ id, rol }) => api.put(`/usuarios/${id}`, cuerpoDeRol(rol)),
    onSuccess: () => { setErrorRol(null); queryClient.invalidateQueries({ queryKey: ['empresa'] }); },
    onError: (err) => setErrorRol(apiError(err, 'No se pudo cambiar el rol')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    const { rol, ...resto } = formData;
    crear.mutate({ ...resto, ...cuerpoDeRol(rol) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Gestión de Personal"
        description="Controla quién tiene acceso al sistema de tu empresa"
        action={
          <div className="relative">
            <label htmlFor="buscar-empleado" className="sr-only">Buscar empleado</label>
            <Search className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              id="buscar-empleado"
              type="search"
              placeholder="Buscar empleado…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="input-field pl-10 w-full sm:w-64"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        <div className="card-container p-6 sm:p-8 h-fit">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-brand-700" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800">Nuevo Gestor</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormError message={formError} onDismiss={() => setFormError(null)} />

            <Field label="Nombre Completo" required>
              <input type="text" className="input-field" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} />
            </Field>

            <Field label="Nombre de Usuario" required>
              <input type="text" className="input-field" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
            </Field>

            <Field label="Seña de Acceso" required>
              <input type="password" className="input-field" value={formData.contrasena} onChange={(e) => setFormData({ ...formData, contrasena: e.target.value })} />
            </Field>

            <Field label="Nivel de Seguridad" hint={conRoles && can('roles.gestionar') ? 'Los roles propios se crean en «Roles y permisos».' : undefined}>
              <select className="input-field" value={formData.rol} onChange={(e) => setFormData({ ...formData, rol: e.target.value })}>
                {opcionesDeRol.map((o) => <option key={o.valor} value={o.valor} disabled={!o.permitido}>{o.nombre}</option>)}
              </select>
            </Field>

            <button type="submit" disabled={crear.isPending} className="btn-primary w-full py-3 mt-2">
              {crear.isPending ? 'Creando…' : 'Dar de Alta'}
            </button>
          </form>
        </div>

        <div className="xl:col-span-2 space-y-3">
          <h3 className="text-xl font-semibold text-slate-800">Directorio Activo</h3>
          <FormError message={errorRol} onDismiss={() => setErrorRol(null)} />
          <TableCard>
            <THead>
              <Th>Nombre</Th>
              <Th>Usuario</Th>
              <Th>Rol</Th>
            </THead>
            <tbody>
              <TableState
                colSpan={3}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={refetch}
                isEmpty={filtrados.length === 0}
                emptyIcon={UsersIcon}
                emptyTitle={busqueda ? 'Sin coincidencias' : 'Todavía no hay personal registrado'}
                emptyHint={busqueda ? 'Prueba con otro nombre o usuario.' : 'Crea el primero con el formulario de la izquierda.'}
              />
              {filtrados.map((u) => (
                <Tr key={u.id}>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-semibold text-sm">
                        {u.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800">{u.nombre}</span>
                    </div>
                  </Td>
                  <Td className="text-slate-500 text-sm whitespace-nowrap">@{u.username}</Td>
                  <Td>
                    {u.id === miId || u.Role?.tipo === 'BACKOFFICE_ADMIN' ? (
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-brand-100 text-brand-800">{u.rol_nombre}</span>
                    ) : (
                      <select
                        className="input-field py-1.5 text-sm w-auto" aria-label={`Rol de ${u.nombre}`}
                        value={valorDeRol(u)} disabled={cambiarRol.isPending}
                        onChange={(e) => { setErrorRol(null); cambiarRol.mutate({ id: u.id, rol: e.target.value }); }}
                      >
                        {opcionesDeRol.map((o) => <option key={o.valor} value={o.valor} disabled={!o.permitido}>{o.nombre}</option>)}
                      </select>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </div>
      </div>
    </div>
  );
};

export default AdminUsuarios;
