import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { UserPlus, Users as UsersIcon } from 'lucide-react';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY = { nombre: '', username: '', contrasena: '', rolId: 2, empresaIds: [] };

const Badge = ({ tone, children }) => (
  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${tone}`}>
    {children}
  </span>
);

const Usuarios = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const [formError, setFormError] = useState(null);

  const { data: usuarios = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bo-usuarios'],
    queryFn: async () => (await api.get('/usuarios')).data,
  });
  const { data: empresas = [] } = useQuery({
    queryKey: ['bo-empresas'],
    queryFn: async () => (await api.get('/empresas')).data,
  });

  const handleToggleEmpresa = (id) => {
    setFormData((prev) => ({
      ...prev,
      empresaIds: prev.empresaIds.includes(id)
        ? prev.empresaIds.filter((eId) => eId !== id)
        : [...prev.empresaIds, id],
    }));
  };

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/usuarios/${editId}`, data) : api.post('/usuarios', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bo-usuarios'] });
      // Mismo caso que en Empresas.jsx: el contador "Usuarios totales" del
      // dashboard vive en ['usuarios', 'count'], no en ['bo-usuarios'].
      queryClient.invalidateQueries({ queryKey: ['usuarios', 'count'] });
      setShowModal(false);
      setEditId(null);
      setFormData(EMPTY);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el administrador')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (formData.rolId !== 1 && formData.empresaIds.length === 0) {
      setFormError('Debe seleccionar al menos una empresa para usuarios inquilinos.');
      return;
    }
    guardar.mutate(formData);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Cuentas de Acceso"
        description="Gestión global de credenciales y administradores de inquilinos (Tenants)."
        action={
          <button
            className="btn-primary gap-2"
            onClick={() => { setEditId(null); setFormData(EMPTY); setFormError(null); setShowModal(true); }}
          >
            <UserPlus className="w-5 h-5" aria-hidden="true" /> Asignar Administrador
          </button>
        }
      />

      <TableCard>
        <THead>
          <Th>Nombre Completo</Th>
          <Th>Username</Th>
          <Th>Empresa Asignada</Th>
          <Th align="center">Nivel</Th>
          <Th align="center">Estado</Th>
          <Th align="right">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={6}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={usuarios.length === 0}
            emptyIcon={UsersIcon}
            emptyTitle="No hay cuentas creadas"
            emptyHint="Crea la primera con «Asignar Administrador»."
          />
          {usuarios.map((u) => (
            <Tr key={u.id}>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center font-semibold text-slate-700">
                    {u.nombre.charAt(0)}
                  </div>
                  {u.nombre}
                </div>
              </Td>
              <Td className="text-slate-500 whitespace-nowrap">@{u.username}</Td>
              <Td className="text-slate-700">
                {u.rolId === 1
                  ? 'Acceso Global (BackOffice)'
                  : u.Empresas?.length > 0
                    ? u.Empresas.map((e) => e.nombre).join(', ')
                    : <span className="text-red-700 italic">Sin Empresas</span>}
              </Td>
              <Td align="center">
                <Badge tone={u.rolId === 1 ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700'}>
                  {u.Role?.nombre?.toUpperCase() || 'USUARIO'}
                </Badge>
              </Td>
              <Td align="center">
                <Badge tone={u.estado ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                  {u.estado ? 'ACTIVO' : 'SUSPENDIDO'}
                </Badge>
              </Td>
              <Td align="right">
                <button
                  onClick={() => {
                    setEditId(u.id);
                    setFormError(null);
                    setFormData({
                      nombre: u.nombre, username: u.username, contrasena: '', rolId: u.rolId,
                      estado: u.estado, empresaIds: u.Empresas ? u.Empresas.map((e) => e.id) : [],
                    });
                    setShowModal(true);
                  }}
                  aria-label={`Editar ${u.nombre}`}
                  className="text-brand-800 hover:text-brand-900 font-medium text-sm px-3 py-1.5 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  Editar
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Editar Usuario' : 'Vincular Usuario'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormError message={formError} onDismiss={() => setFormError(null)} />

          <Field label="Nombre Ref." required>
            <input className="input-field" placeholder="Juan Gerente" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} />
          </Field>

          <Field label="Username (Log-In)" required>
            <input className="input-field" placeholder="admin_empresax" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
          </Field>

          <Field
            label="Contraseña Gen."
            required={!editId}
            hint={editId ? 'Déjalo vacío para no cambiarla.' : undefined}
          >
            <input
              type="password"
              className="input-field"
              placeholder={editId ? '(Sin cambios)' : 'Obligatorio'}
              value={formData.contrasena}
              onChange={(e) => setFormData({ ...formData, contrasena: e.target.value })}
            />
          </Field>

          <Field label="Nivel de Acceso">
            <select className="input-field" value={formData.rolId} onChange={(e) => setFormData({ ...formData, rolId: parseInt(e.target.value, 10) })}>
              <option value={1}>Súper Administrador (Global)</option>
              <option value={2}>Administrador de Empresa</option>
              <option value={3}>Usuario Operativo</option>
            </select>
          </Field>

          {editId && (
            <Field label="Estado de la Cuenta">
              <select className="input-field" value={formData.estado !== false} onChange={(e) => setFormData({ ...formData, estado: e.target.value === 'true' })}>
                <option value="true">Activo (Permitir Acceso)</option>
                <option value="false">Suspendido (Bloquear Acceso)</option>
              </select>
            </Field>
          )}

          {formData.rolId !== 1 && (
            <fieldset className="border-t border-slate-100 pt-4 mt-6">
              <legend className="text-sm font-medium text-slate-700 mb-3">Asignar a Empresas</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-2">
                {empresas.map((emp) => (
                  <label
                    key={emp.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-brand-600 ${
                      formData.empresaIds.includes(emp.id) ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                      checked={formData.empresaIds.includes(emp.id)}
                      onChange={() => handleToggleEmpresa(emp.id)}
                    />
                    <span className={`text-sm font-medium truncate ${formData.empresaIds.includes(emp.id) ? 'text-brand-800' : 'text-slate-700'}`}>
                      {emp.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
              {guardar.isPending ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Crear Acceso'}
            </button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

export default Usuarios;
