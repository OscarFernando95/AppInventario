import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Briefcase, Plus, Edit } from 'lucide-react';
import { formatCOP } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useTextFilter } from '../../hooks/useTextFilter';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import SearchInput from '../../components/ui/SearchInput';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY = {
  nombre: '', descripcion: '', precio: '',
  porcentaje_iva: '19', unidad_medida: 'ZZ', codigo_estandar: '',
};

const Servicios = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [formError, setFormError] = useState(null);

  const { data: servicios = [], isLoading, isError, error, refetch } = useEmpresaQuery(['servicios'], '/servicios');
  const { busqueda, setBusqueda, filtrados } = useTextFilter(servicios, ['nombre', 'descripcion']);

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/servicios/${editId}`, data) : api.post('/servicios', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setShowModal(false);
      setEditId(null);
      setFormData(EMPTY);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el servicio')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    guardar.mutate(formData);
  };

  const startEdit = (s) => {
    setEditId(s.id);
    setFormError(null);
    setFormData({
      nombre: s.nombre, descripcion: s.descripcion, precio: s.precio,
      porcentaje_iva: s.porcentaje_iva || '19', unidad_medida: s.unidad_medida || 'ZZ', codigo_estandar: s.codigo_estandar || ''
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Catálogo de Servicios"
        description="Servicios intangibles que monetizan pero no descuentan inventario"
        action={
          <button
            className="btn-primary gap-2"
            onClick={() => { setEditId(null); setFormData(EMPTY); setFormError(null); setShowModal(true); }}
          >
            <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo Servicio
          </button>
        }
      />

      <FilterBar hayFiltros={!!busqueda} onLimpiar={() => setBusqueda('')}>
        <SearchInput placeholder="Nombre o descripción…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-72" />
      </FilterBar>

      <TableCard>
        <THead>
          <Th>Servicio</Th>
          <Th>Descripción</Th>
          <Th align="right">Precio Base</Th>
          <Th align="center" className="w-24">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={4}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={filtrados.length === 0}
            emptyIcon={Briefcase}
            emptyTitle={busqueda ? 'Sin servicios para esta búsqueda' : 'Aún no ofreces servicios adicionales'}
            emptyHint={busqueda ? 'Prueba con otro texto.' : 'Crea el primero con «Nuevo Servicio».'}
          />
          {filtrados.map((s) => (
            <Tr key={s.id}>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-50 text-brand-700 rounded-lg shrink-0"><Briefcase className="w-5 h-5" aria-hidden="true" /></div>
                  {s.nombre}
                </div>
              </Td>
              <Td className="text-slate-500 max-w-xs truncate">{s.descripcion}</Td>
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{formatCOP(s.precio)}</Td>
              <Td align="center">
                <button onClick={() => startEdit(s)} aria-label={`Editar ${s.nombre}`} className="btn-icon">
                  <Edit className="w-4 h-4" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Editar Servicio' : 'Nuevo Servicio'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />

          <Field label="Nombre del Servicio" required>
            <input className="input-field" value={formData.nombre || ''} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Precio Fijo ($)" required>
              <input type="number" step="0.01" className="input-field" value={formData.precio || ''} onChange={(e) => setFormData({ ...formData, precio: e.target.value })} />
            </Field>
            <Field label="Código Estandar">
              <input className="input-field" placeholder="999999" value={formData.codigo_estandar || ''} onChange={(e) => setFormData({ ...formData, codigo_estandar: e.target.value })} />
            </Field>
          </div>

          <Field label="Detalles Cortos">
            <textarea className="input-field h-24 resize-none" value={formData.descripcion || ''} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} />
          </Field>

          <div className="border-t border-slate-100 pt-3 mt-3">
            <h4 className="font-semibold text-brand-800 text-sm mb-3">Datos DIAN (Facturación Electrónica)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="% IVA Aplicable">
                <select className="input-field" value={formData.porcentaje_iva || '19'} onChange={(e) => setFormData({ ...formData, porcentaje_iva: e.target.value })}>
                  <option value="19">19% (General)</option>
                  <option value="5">5% (Reducido)</option>
                  <option value="0">0% (Exento/Excluido)</option>
                </select>
              </Field>
              <Field label="Unidad de Medida (UBL)">
                <select className="input-field" value={formData.unidad_medida || 'ZZ'} onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}>
                  <option value="ZZ">ZZ - Mutuamente definido (Servicios)</option>
                  <option value="HUR">HUR - Hora</option>
                  <option value="DAY">DAY - Día</option>
                  <option value="MON">MON - Mes</option>
                </select>
              </Field>
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
              {guardar.isPending ? 'Guardando…' : editId ? 'Actualizar' : 'Guardar'}
            </button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

export default Servicios;
