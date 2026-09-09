import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { UserPlus, Search, Users as UsersIcon } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY = { nombre: '', username: '', contrasena: '', rolId: 3 }; // 3 = FRONT_USER

const AdminUsuarios = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const { data: usuarios = [], isLoading, isError, error, refetch } = useEmpresaQuery(['usuarios-empresa'], '/usuarios');

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    crear.mutate(formData);
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

            <Field label="Nivel de Seguridad">
              <select className="input-field" value={formData.rolId} onChange={(e) => setFormData({ ...formData, rolId: parseInt(e.target.value, 10) })}>
                <option value={3}>Usuario Operativo</option>
                <option value={2}>Administrador Delegado</option>
              </select>
            </Field>

            <button type="submit" disabled={crear.isPending} className="btn-primary w-full py-3 mt-2">
              {crear.isPending ? 'Creando…' : 'Dar de Alta'}
            </button>
          </form>
        </div>

        <div className="xl:col-span-2 space-y-3">
          <h3 className="text-xl font-semibold text-slate-800">Directorio Activo</h3>
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
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      u.Role?.nombre?.includes('Admin') ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {u.Role?.nombre}
                    </span>
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
