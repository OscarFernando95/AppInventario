import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Truck, Plus, Edit, Phone, Mail, UserCircle, MapPin } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import DaneLocationFields from '../../components/DaneLocationFields';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { GridState } from '../../components/ui/DataState';

const EMPTY = {
  nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '',
  departamento_dane: '', municipio_dane: '',
};

const Proveedores = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState(null);

  const { data: proveedores = [], isLoading, isError, error, refetch } = useEmpresaQuery(['proveedores'], '/proveedores');

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/proveedores/${editId}`, data) : api.post('/proveedores', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setShowModal(false);
      setEditId(null);
      setFormData(EMPTY);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el proveedor')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    guardar.mutate(formData);
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setFormError(null);
    setFormData({
      nombre: p.nombre, nit: p.nit, contacto: p.contacto, telefono: p.telefono, email: p.email,
      direccion: p.direccion, departamento_dane: p.departamento_dane || '', municipio_dane: p.municipio_dane || '',
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Directorio Proveedores"
        description="Registra a quienes te suministran inventario físico."
        action={
          <button
            className="btn-primary gap-2"
            onClick={() => { setEditId(null); setFormData(EMPTY); setFormError(null); setShowModal(true); }}
          >
            <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo Proveedor
          </button>
        }
      />

      {/* Mismo rol que la grilla de Clientes, así que los mismos breakpoints:
          antes esta iba a 2 columnas en xl y la de clientes en md. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GridState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={refetch}
          isEmpty={proveedores.length === 0}
          emptyIcon={Truck}
          emptyTitle="Ningún proveedor registrado aún"
          emptyHint="Crea el primero con «Nuevo Proveedor»."
        />
        {proveedores.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow"
          >
            <button
              onClick={() => startEdit(p)}
              aria-label={`Editar ${p.nombre}`}
              className="btn-icon absolute top-6 right-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <Edit className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-semibold text-xl">
                {p.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-800 leading-tight truncate">{p.nombre}</h4>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-1">
                  NIT: {p.nit || 'No Provisto'}
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4 text-sm text-slate-600">
              <div className="flex items-center gap-2"><UserCircle className="w-4 h-4 text-slate-400" aria-hidden="true" /> {p.contacto || 'Sin contacto'}</div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" aria-hidden="true" /> {p.telefono || 'N/A'}</div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" aria-hidden="true" /> {p.email || 'N/A'}</div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" aria-hidden="true" /> {p.direccion || 'N/A'}</div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Razón Social" required>
              <input className="input-field" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} />
            </Field>
            <Field label="NIT" required>
              <input className="input-field" value={formData.nit} onChange={(e) => setFormData({ ...formData, nit: e.target.value })} />
            </Field>
          </div>

          <Field label="Nombre Contacto" required>
            <input className="input-field" value={formData.contacto} onChange={(e) => setFormData({ ...formData, contacto: e.target.value })} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Teléfono Directo">
              <input className="input-field" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} />
            </Field>
            <Field label="Correo">
              <input type="email" className="input-field" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </Field>
          </div>

          <Field label="Sede Principal Física">
            <input className="input-field" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} />
          </Field>

          <DaneLocationFields
            departamento={formData.departamento_dane}
            municipio={formData.municipio_dane}
            onChange={(patch) => setFormData({ ...formData, ...patch })}
          />

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
              {guardar.isPending ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar'}
            </button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

export default Proveedores;
