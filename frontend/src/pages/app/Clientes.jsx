import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Users, Plus, Edit, Mail, Phone, MapPin, IdCard } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useTextFilter } from '../../hooks/useTextFilter';
import DaneLocationFields from '../../components/DaneLocationFields';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import { GridState } from '../../components/ui/DataState';

const EMPTY = {
  nombre: '', documento: '', email: '', telefono: '', direccion: '',
  tipo_documento: '13', dv: '', tipo_persona: '2', regimen_fiscal: 'R-99-PN',
  departamento_dane: '', municipio_dane: '',
};

const Clientes = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState(null);

  const { data: clientes = [], isLoading, isError, error, refetch } = useEmpresaQuery(['clientes'], '/clientes');
  const { busqueda, setBusqueda, filtrados } = useTextFilter(clientes, ['nombre', 'documento']);

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/clientes/${editId}`, data) : api.post('/clientes', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setShowModal(false);
      setEditId(null);
      setFormData(EMPTY);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el cliente')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    guardar.mutate(formData);
  };

  const startCreate = () => {
    setEditId(null);
    setFormData(EMPTY);
    setFormError(null);
    setShowModal(true);
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setFormError(null);
    setFormData({
      nombre: c.nombre, documento: c.documento, email: c.email, telefono: c.telefono, direccion: c.direccion,
      tipo_documento: c.tipo_documento || '13', dv: c.dv || '', tipo_persona: c.tipo_persona || '2', regimen_fiscal: c.regimen_fiscal || 'R-99-PN',
      departamento_dane: c.departamento_dane || '', municipio_dane: c.municipio_dane || ''
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Directorio de Clientes"
        description="Gestiona tu cartera de clientes recurrentes para agilizar tus ventas"
        action={
          <button className="btn-primary gap-2" onClick={startCreate}>
            <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo Cliente
          </button>
        }
      />

      <FilterBar hayFiltros={!!busqueda} onLimpiar={() => setBusqueda('')}>
        <SearchInput placeholder="Nombre o documento…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-72" />
      </FilterBar>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GridState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={refetch}
          isEmpty={filtrados.length === 0}
          emptyIcon={Users}
          emptyTitle={busqueda ? 'Sin clientes para esta búsqueda' : 'Ningún cliente registrado aún'}
          emptyHint={busqueda ? 'Prueba con otro texto.' : 'Crea el primero con «Nuevo Cliente».'}
        />
        {filtrados.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow"
          >
            <button
              onClick={() => startEdit(c)}
              aria-label={`Editar ${c.nombre}`}
              className="btn-icon absolute top-6 right-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <Edit className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-brand-100 text-brand-800 flex items-center justify-center font-semibold text-xl">
                {c.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-800 leading-tight truncate">{c.nombre}</h4>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-1">
                  <IdCard className="w-3.5 h-3.5" aria-hidden="true" /> CC / NIT: {c.documento || 'No Provisto'}
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4 text-sm text-slate-600">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" aria-hidden="true" /> {c.email || 'N/A'}</div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" aria-hidden="true" /> {c.telefono || 'N/A'}</div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" aria-hidden="true" /> {c.direccion || 'N/A'}</div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <h4 className="font-semibold text-brand-800 border-b border-slate-100 pb-1 mb-2 text-sm">Información Básica</h4>

              <Field label="Nombre o Razón Social" required>
                <input className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field label="N° Documento">
                    <div className="flex gap-1">
                      <label htmlFor="cliente-tipo-doc" className="sr-only">Tipo de documento</label>
                      <select
                        id="cliente-tipo-doc"
                        className="input-field w-1/3 px-1"
                        value={formData.tipo_documento || '13'}
                        onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value })}
                      >
                        <option value="13">CC</option>
                        <option value="31">NIT</option>
                        <option value="22">CE</option>
                      </select>
                      <input
                        aria-label="Número de documento"
                        className="input-field w-2/3"
                        value={formData.documento || ''}
                        onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                      />
                    </div>
                  </Field>
                </div>
                <Field label="DV">
                  <input className="input-field" value={formData.dv || ''} onChange={(e) => setFormData({ ...formData, dv: e.target.value })} />
                </Field>
              </div>

              <Field label="Correo">
                <input type="email" className="input-field" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </Field>

              <Field label="Teléfono">
                <input className="input-field" value={formData.telefono || ''} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} />
              </Field>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-brand-800 border-b border-slate-100 pb-1 mb-2 text-sm">Información Tributaria (DIAN)</h4>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo Persona">
                  <select className="input-field" value={formData.tipo_persona || '2'} onChange={(e) => setFormData({ ...formData, tipo_persona: e.target.value })}>
                    <option value="1">Jurídica</option>
                    <option value="2">Natural</option>
                  </select>
                </Field>
                <Field label="Régimen">
                  <select className="input-field" value={formData.regimen_fiscal || 'R-99-PN'} onChange={(e) => setFormData({ ...formData, regimen_fiscal: e.target.value })}>
                    <option value="O-48">O-48 Resp. IVA</option>
                    <option value="R-99-PN">R-99-PN No Resp.</option>
                    <option value="O-13">O-13 Gran Cont.</option>
                    <option value="O-47">O-47 Simple</option>
                  </select>
                </Field>
              </div>

              <Field label="Dirección Física">
                <input className="input-field" value={formData.direccion || ''} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} />
              </Field>

              <DaneLocationFields
                departamento={formData.departamento_dane || ''}
                municipio={formData.municipio_dane || ''}
                onChange={(patch) => setFormData({ ...formData, ...patch })}
              />
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
              {guardar.isPending ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Dar de Alta'}
            </button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

export default Clientes;
