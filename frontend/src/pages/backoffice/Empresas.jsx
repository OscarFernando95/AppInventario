import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Building2, Plus, Power, ShieldCheck } from 'lucide-react';

const Empresas = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({ 
    nombre: '', nit: '', contacto: '', activa: true, modulosIds: [],
    dv: '', tipo_persona: '1', regimen_fiscal: 'O-48', direccion_fisica: '',
    municipio_dane: '', departamento_dane: '', codigo_ciiu: '', email_facturacion: '',
    resolucion_numero: '', prefijo_facturacion: '', rango_desde: '', rango_hasta: '',
    fecha_vigencia_desde: '', fecha_vigencia_hasta: '', clave_tecnica: ''
  });

  const modulosDisponibles = [
    { id: 1, nombre: 'Inventario' },
    { id: 2, nombre: 'Ventas' },
    { id: 3, nombre: 'Compras' },
    { id: 4, nombre: 'Proveedores' },
    { id: 5, nombre: 'Informes' },
    { id: 6, nombre: 'Clientes' },
    { id: 7, nombre: 'Servicios' },
    { id: 8, nombre: 'Pedidos' }
  ];

  const handleToggleModulo = (id) => {
    setFormData(prev => ({
      ...prev,
      modulosIds: prev.modulosIds.includes(id)
        ? prev.modulosIds.filter(mId => mId !== id)
        : [...prev.modulosIds, id]
    }));
  };

  const { data: empresas = [] } = useQuery({
    queryKey: ['bo-empresas'],
    queryFn: async () => (await api.get('/empresas')).data,
  });

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/empresas/${editId}`, data) : api.post('/empresas', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bo-empresas'] });
      setShowModal(false);
      setEditId(null);
      setFormData({ nombre: '', nit: '', contacto: '', activa: true, modulosIds: [] });
    },
    onError: () => alert('Error al registrar empresa'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    guardar.mutate(formData);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Empresas (Tenants)</h2>
          <p className="text-slate-500 mt-1">Directorio global de empresas suscritas y estado de acceso.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setEditId(null); setFormData({ nombre: '', nit: '', contacto: '', activa: true, modulosIds: [] }); setShowModal(true); }}>
          <Plus className="w-5 h-5"/> Registrar Inquilino
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa / Razón Social</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">NIT / ID Fiscal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Módulos Autorizados</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado de Servicio</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-12 text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                    No hay inquilinos (empresas) registrados.
                  </td>
                </tr>
              ) : empresas.map(emp => (
                <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-brand-500/20">{emp.nombre.charAt(0)}</div>
                    {emp.nombre}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-500">{emp.nit}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{emp.contacto}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                       {emp.Modulos?.slice(0, 3).map(m => <span key={m.id} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{m.nombre_codigo}</span>)}
                       {emp.Modulos?.length > 3 && <span className="text-[10px] font-bold bg-brand-50 text-brand-600 px-2 py-1 rounded-md">+{emp.Modulos.length - 3}</span>}
                       {(!emp.Modulos || emp.Modulos.length === 0) && <span className="text-xs text-slate-400 italic">Ninguno</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm flex items-center gap-2 justify-center w-fit mx-auto ${emp.activa ? 'bg-emerald-100/50 text-emerald-700 border border-emerald-200' : 'bg-red-100/50 text-red-700 border border-red-200'}`}>
                      {emp.activa ? <ShieldCheck className="w-4 h-4"/> : <Power className="w-4 h-4"/>} 
                      {emp.activa ? 'ACTIVO' : 'SUSPENDIDO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => { 
                        setEditId(emp.id); 
                        setFormData({ 
                          nombre: emp.nombre, nit: emp.nit, contacto: emp.contacto, activa: emp.activa, modulosIds: emp.Modulos.map(m=>m.id),
                          dv: emp.dv || '', tipo_persona: emp.tipo_persona || '1', regimen_fiscal: emp.regimen_fiscal || 'O-48', direccion_fisica: emp.direccion_fisica || '',
                          municipio_dane: emp.municipio_dane || '', departamento_dane: emp.departamento_dane || '', codigo_ciiu: emp.codigo_ciiu || '', email_facturacion: emp.email_facturacion || '',
                          resolucion_numero: emp.resolucion_numero || '', prefijo_facturacion: emp.prefijo_facturacion || '', rango_desde: emp.rango_desde || '', rango_hasta: emp.rango_hasta || '',
                          fecha_vigencia_desde: emp.fecha_vigencia_desde || '', fecha_vigencia_hasta: emp.fecha_vigencia_hasta || '', clave_tecnica: emp.clave_tecnica || ''
                        }); 
                        setShowModal(true); 
                      }}
                      className="text-brand-600 hover:text-brand-800 font-bold text-sm px-3 py-1.5 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
                    >Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-[9999] animate-fade-in sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-[2rem] p-8 sm:p-10 w-full max-w-4xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative my-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 border-b border-slate-100 pb-4">{editId ? 'Editar Empresa' : 'Registrar Nuevo Tenant'}</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-bold text-brand-600 border-b pb-2">Datos Comerciales Principales</h4>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Comercial</label><input required className="input-field rounded-xl" placeholder="Empresa XYZ" value={formData.nombre || ''} onChange={e=>setFormData({...formData,nombre:e.target.value})}/></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT</label><input required className="input-field rounded-xl" placeholder="123456789" value={formData.nit || ''} onChange={e=>setFormData({...formData,nit:e.target.value})}/></div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">DV</label><input className="input-field rounded-xl" placeholder="0" value={formData.dv || ''} onChange={e=>setFormData({...formData,dv:e.target.value})}/></div>
                  </div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Contacto General</label><input required className="input-field rounded-xl" placeholder="admin@xyz.com" value={formData.contacto || ''} onChange={e=>setFormData({...formData,contacto:e.target.value})}/></div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo Persona</label>
                      <select className="input-field rounded-xl" value={formData.tipo_persona || '1'} onChange={e=>setFormData({...formData,tipo_persona:e.target.value})}>
                        <option value="1">Jurídica</option><option value="2">Natural</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Régimen</label>
                      <select className="input-field rounded-xl" value={formData.regimen_fiscal || 'O-48'} onChange={e=>setFormData({...formData,regimen_fiscal:e.target.value})}>
                        <option value="O-48">O-48 Responsable IVA</option>
                        <option value="R-99-PN">R-99-PN No Responsable</option>
                        <option value="O-13">O-13 Gran Contribuyente</option>
                        <option value="O-47">O-47 Régimen Simple</option>
                      </select>
                    </div>
                  </div>

                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección y Localización</label><input className="input-field rounded-xl mb-2" placeholder="Dirección Física" value={formData.direccion_fisica || ''} onChange={e=>setFormData({...formData,direccion_fisica:e.target.value})}/>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input-field rounded-xl" placeholder="Dpto (ej. 11)" value={formData.departamento_dane || ''} onChange={e=>setFormData({...formData,departamento_dane:e.target.value})}/>
                      <input className="input-field rounded-xl" placeholder="Mpio (ej. 11001)" value={formData.municipio_dane || ''} onChange={e=>setFormData({...formData,municipio_dane:e.target.value})}/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">CIIU</label><input className="input-field rounded-xl" placeholder="4711" value={formData.codigo_ciiu || ''} onChange={e=>setFormData({...formData,codigo_ciiu:e.target.value})}/></div>
                     <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email FE</label><input className="input-field rounded-xl" type="email" placeholder="fe@xyz.com" value={formData.email_facturacion || ''} onChange={e=>setFormData({...formData,email_facturacion:e.target.value})}/></div>
                  </div>

                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-brand-600 border-b pb-2">Resolución DIAN (Facturación Electrónica)</h4>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Resolución N°</label><input className="input-field rounded-xl" placeholder="18760000001" value={formData.resolucion_numero || ''} onChange={e=>setFormData({...formData,resolucion_numero:e.target.value})}/></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Prefijo</label><input className="input-field rounded-xl" placeholder="SETP" value={formData.prefijo_facturacion || ''} onChange={e=>setFormData({...formData,prefijo_facturacion:e.target.value})}/></div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Desde</label><input type="number" className="input-field rounded-xl" placeholder="1" value={formData.rango_desde || ''} onChange={e=>setFormData({...formData,rango_desde:e.target.value})}/></div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Hasta</label><input type="number" className="input-field rounded-xl" placeholder="5000" value={formData.rango_hasta || ''} onChange={e=>setFormData({...formData,rango_hasta:e.target.value})}/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Vigencia Desde</label><input type="date" className="input-field rounded-xl" value={formData.fecha_vigencia_desde || ''} onChange={e=>setFormData({...formData,fecha_vigencia_desde:e.target.value})}/></div>
                    <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Vigencia Hasta</label><input type="date" className="input-field rounded-xl" value={formData.fecha_vigencia_hasta || ''} onChange={e=>setFormData({...formData,fecha_vigencia_hasta:e.target.value})}/></div>
                  </div>
                  <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Clave Técnica DIAN</label><input className="input-field rounded-xl" placeholder="fc8eac42..." value={formData.clave_tecnica || ''} onChange={e=>setFormData({...formData,clave_tecnica:e.target.value})}/></div>
                  
                  {editId && (
                    <div className="pt-2"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado de la Cuenta (Tenant)</label>
                      <select className="input-field rounded-xl" value={formData.activa} onChange={e=>setFormData({...formData,activa:e.target.value === 'true'})}>
                        <option value="true">Activo (Permitir Acceso)</option>
                        <option value="false">Suspendido (Bloquear Acceso)</option>
                      </select>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4 mt-2">
                    <label className="block text-sm font-bold text-slate-800 mb-3">Permisos a Módulos</label>
                    <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                      {modulosDisponibles.map(mod => (
                        <label key={mod.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${formData.modulosIds?.includes(mod.id) ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500" 
                            checked={formData.modulosIds?.includes(mod.id)}
                            onChange={() => handleToggleModulo(mod.id)}
                          />
                          <span className={`text-xs font-semibold ${formData.modulosIds?.includes(mod.id) ? 'text-brand-700' : 'text-slate-600'}`}>{mod.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-100">
                <button type="button" className="btn-secondary rounded-xl" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary rounded-xl px-6">{editId ? 'Guardar Cambios' : 'Activar Servicio'}</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default Empresas;
