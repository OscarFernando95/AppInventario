import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Users, Plus, Edit, Mail, Phone, MapPin, IdCard } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import DaneLocationFields from '../../components/DaneLocationFields';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';

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

  const { data: clientes = [] } = useEmpresaQuery(['clientes'], '/clientes');

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Directorio de Clientes</h2>
          <p className="text-slate-500 mt-1">Gestiona tu cartera de clientes recurrentes para agilizar tus ventas</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => {
          setEditId(null);
          setFormData(EMPTY);
          setFormError(null);
          setShowModal(true);
        }}>
          <Plus className="w-5 h-5" /> Nuevo Cliente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {clientes.length === 0 ? (
          <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-200">
            <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
            <span className="text-lg font-bold text-slate-500">Ningún cliente registrado aún.</span>
          </div>
        ) : clientes.map(c => (
          <div key={c.id} className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm relative group hover:shadow-md transition-shadow">
            <button onClick={() => startEdit(c)} className="absolute top-6 right-6 p-2 bg-slate-50 text-slate-400 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:text-brand-600 hover:bg-brand-50">
              <Edit className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xl">
                {c.nombre.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-slate-800 leading-tight">{c.nombre}</h4>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mt-1">
                  <IdCard className="w-3.5 h-3.5" /> CC / NIT: {c.documento || 'No Provisto'}
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4 text-sm text-slate-600 font-medium">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 opacity-50" /> {c.email || 'N/A'}</div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 opacity-50" /> {c.telefono || 'N/A'}</div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 opacity-50" /> {c.direccion || 'N/A'}</div>
            </div>
          </div>
        ))}
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-2xl shadow-xl relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormError message={formError} onDismiss={() => setFormError(null)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h4 className="font-bold text-brand-600 border-b pb-1 mb-2 text-sm">Información Básica</h4>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre o Razón Social</label><input required className="input-field rounded-xl" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})}/></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">N° Documento</label>
                      <div className="flex gap-1">
                        <select className="input-field rounded-xl w-1/3 px-1" value={formData.tipo_documento || '13'} onChange={e => setFormData({...formData, tipo_documento: e.target.value})}>
                          <option value="13">CC</option>
                          <option value="31">NIT</option>
                          <option value="22">CE</option>
                        </select>
                        <input className="input-field rounded-xl w-2/3" value={formData.documento || ''} onChange={e => setFormData({...formData, documento: e.target.value})}/>
                      </div>
                    </div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">DV</label><input className="input-field rounded-xl" value={formData.dv || ''} onChange={e => setFormData({...formData, dv: e.target.value})}/></div>
                  </div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Correo</label><input type="email" className="input-field rounded-xl" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono</label><input className="input-field rounded-xl" value={formData.telefono || ''} onChange={e => setFormData({...formData, telefono: e.target.value})}/></div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-brand-600 border-b pb-1 mb-2 text-sm">Información Tributaria (DIAN)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo Persona</label>
                      <select className="input-field rounded-xl" value={formData.tipo_persona || '2'} onChange={e => setFormData({...formData, tipo_persona: e.target.value})}>
                        <option value="1">Jurídica</option>
                        <option value="2">Natural</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Régimen</label>
                      <select className="input-field rounded-xl" value={formData.regimen_fiscal || 'R-99-PN'} onChange={e => setFormData({...formData, regimen_fiscal: e.target.value})}>
                        <option value="O-48">O-48 Resp. IVA</option>
                        <option value="R-99-PN">R-99-PN No Resp.</option>
                        <option value="O-13">O-13 Gran Cont.</option>
                        <option value="O-47">O-47 Simple</option>
                      </select>
                    </div>
                  </div>

                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección Física</label><input className="input-field rounded-xl" value={formData.direccion || ''} onChange={e => setFormData({...formData, direccion: e.target.value})}/></div>
                  <DaneLocationFields
                    departamento={formData.departamento_dane || ''}
                    municipio={formData.municipio_dane || ''}
                    onChange={(patch) => setFormData({ ...formData, ...patch })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">{editId ? 'Guardar Cambios' : 'Dar de Alta'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Clientes;
