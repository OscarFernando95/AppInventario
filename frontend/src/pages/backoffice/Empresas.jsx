import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Building2, Plus, Power, ShieldCheck, FileText, Boxes, ArrowLeft } from 'lucide-react';
import SearchableSelect from '../../components/SearchableSelect';
import DaneLocationFields from '../../components/DaneLocationFields';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import { calcularDV } from '../../utils/nit';
import { useCiiu, useModulos } from '../../hooks/useCatalogos';

const EMPTY = {
  nombre: '', nit: '', contacto: '', activa: true, modulosIds: [],
  dv: '', tipo_persona: '1', regimen_fiscal: 'O-48', direccion_fisica: '',
  municipio_dane: '', departamento_dane: '', codigo_ciiu: '', email_facturacion: '',
  resolucion_numero: '', prefijo_facturacion: '', rango_desde: '', rango_hasta: '',
  fecha_vigencia_desde: '', fecha_vigencia_hasta: '', clave_tecnica: '', tipo_empresa: 'SIMPLE',
};

const Empresas = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [tipo, setTipo] = useState(null); // 'SIMPLE' | 'FACTURACION_ELECTRONICA' | null (paso selector)
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState(EMPTY);

  const { data: modulos = [] } = useModulos();
  const { data: ciiu = [] } = useCiiu();

  const inventarioId = useMemo(
    () => modulos.find((m) => m.nombre_codigo === 'Inventario')?.id ?? null,
    [modulos]
  );

  const ciiuOptions = useMemo(
    () => ciiu.map((a) => ({
      value: a.codigo,
      label: `${a.codigo} — ${a.descripcion}`,
      keywords: a.descripcion,
    })),
    [ciiu]
  );

  const setField = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  const handleNit = (value) => setField({ nit: value, dv: calcularDV(value) });

  const handleToggleModulo = (id) => {
    setFormData((prev) => ({
      ...prev,
      modulosIds: prev.modulosIds.includes(id)
        ? prev.modulosIds.filter((mId) => mId !== id)
        : [...prev.modulosIds, id],
    }));
  };

  const { data: empresas = [] } = useQuery({
    queryKey: ['bo-empresas'],
    queryFn: async () => (await api.get('/empresas')).data,
  });

  const cerrar = () => {
    setShowModal(false);
    setEditId(null);
    setTipo(null);
    setFormError(null);
    setFormData(EMPTY);
  };

  const guardar = useMutation({
    mutationFn: (data) => (editId ? api.put(`/empresas/${editId}`, data) : api.post('/empresas', data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bo-empresas'] });
      cerrar();
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo registrar la empresa')),
  });

  const abrirNuevo = () => {
    setEditId(null);
    setTipo(null);
    setFormError(null);
    setFormData({ ...EMPTY, modulosIds: inventarioId ? [inventarioId] : [] });
    setShowModal(true);
  };

  const elegirTipo = (t) => {
    setTipo(t);
    setField({ tipo_empresa: t });
  };

  const abrirEdicion = (emp) => {
    setEditId(emp.id);
    setTipo(emp.tipo_empresa || 'FACTURACION_ELECTRONICA');
    setFormError(null);
    setFormData({
      nombre: emp.nombre, nit: emp.nit || '', contacto: emp.contacto || '', activa: emp.activa,
      modulosIds: emp.Modulos.map((m) => m.id),
      dv: emp.dv || calcularDV(emp.nit), tipo_persona: emp.tipo_persona || '1',
      regimen_fiscal: emp.regimen_fiscal || 'O-48', direccion_fisica: emp.direccion_fisica || '',
      municipio_dane: emp.municipio_dane || '', departamento_dane: emp.departamento_dane || '',
      codigo_ciiu: emp.codigo_ciiu || '', email_facturacion: emp.email_facturacion || '',
      resolucion_numero: emp.resolucion_numero || '', prefijo_facturacion: emp.prefijo_facturacion || '',
      rango_desde: emp.rango_desde || '', rango_hasta: emp.rango_hasta || '',
      fecha_vigencia_desde: emp.fecha_vigencia_desde || '', fecha_vigencia_hasta: emp.fecha_vigencia_hasta || '',
      clave_tecnica: emp.clave_tecnica || '', tipo_empresa: emp.tipo_empresa || 'FACTURACION_ELECTRONICA',
    });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    guardar.mutate(formData);
  };

  const modulosBloque = (
    <div className="border-t border-slate-100 pt-4 mt-2">
      <label className="block text-sm font-bold text-slate-800 mb-3">Módulos habilitados</label>
      <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
        {modulos.map((mod) => {
          const activo = formData.modulosIds?.includes(mod.id);
          const esBase = mod.id === inventarioId;
          return (
            <label
              key={mod.id}
              className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                activo ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                checked={!!activo}
                onChange={() => handleToggleModulo(mod.id)}
              />
              <span className={`text-xs font-semibold ${activo ? 'text-brand-700' : 'text-slate-600'}`}>
                {mod.nombre_codigo}
              </span>
              {esBase && (
                <span className="text-[9px] font-bold uppercase bg-brand-600 text-white px-1.5 py-0.5 rounded">base</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );

  const localizacionBloque = (
    <DaneLocationFields
      departamento={formData.departamento_dane}
      municipio={formData.municipio_dane}
      onChange={setField}
    />
  );

  const ciiuBloque = (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Actividad económica (CIIU)</label>
      <SearchableSelect
        options={ciiuOptions}
        value={formData.codigo_ciiu}
        onChange={(v) => setField({ codigo_ciiu: v })}
        placeholder="Buscar por código o descripción…"
      />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Gestión de Empresas (Tenants)</h2>
          <p className="text-slate-500 mt-1">Directorio global de empresas suscritas y estado de acceso.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={abrirNuevo}>
          <Plus className="w-5 h-5" /> Registrar Inquilino
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_15px_-4px_rgba(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa / Razón Social</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">NIT / ID Fiscal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Módulos Autorizados</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado de Servicio</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No hay inquilinos (empresas) registrados.
                  </td>
                </tr>
              ) : empresas.map((emp) => (
                <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-brand-500/20">{emp.nombre.charAt(0)}</div>
                    {emp.nombre}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-500">{emp.nit}{emp.dv ? `-${emp.dv}` : ''}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${emp.tipo_empresa === 'FACTURACION_ELECTRONICA' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                      {emp.tipo_empresa === 'FACTURACION_ELECTRONICA' ? 'Facturación electrónica' : 'Simple'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {emp.Modulos?.slice(0, 3).map((m) => <span key={m.id} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{m.nombre_codigo}</span>)}
                      {emp.Modulos?.length > 3 && <span className="text-[10px] font-bold bg-brand-50 text-brand-600 px-2 py-1 rounded-md">+{emp.Modulos.length - 3}</span>}
                      {(!emp.Modulos || emp.Modulos.length === 0) && <span className="text-xs text-slate-400 italic">Ninguno</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm flex items-center gap-2 justify-center w-fit mx-auto ${emp.activa ? 'bg-emerald-100/50 text-emerald-700 border border-emerald-200' : 'bg-red-100/50 text-red-700 border border-red-200'}`}>
                      {emp.activa ? <ShieldCheck className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      {emp.activa ? 'ACTIVO' : 'SUSPENDIDO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => abrirEdicion(emp)}
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

            {/* Paso 0: elegir tipo de empresa (solo al crear) */}
            {!editId && !tipo ? (
              <>
                <h3 className="text-2xl font-bold mb-2 text-slate-800">Registrar Nuevo Tenant</h3>
                <p className="text-slate-500 mb-6">¿Qué tipo de empresa vas a crear?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => elegirTipo('SIMPLE')}
                    className="text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition-all"
                  >
                    <Boxes className="w-8 h-8 text-brand-600 mb-3" />
                    <p className="font-bold text-slate-800">Empresa simple</p>
                    <p className="text-sm text-slate-500 mt-1">Solo datos básicos. Ideal para inventario, ventas y compras internas.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => elegirTipo('FACTURACION_ELECTRONICA')}
                    className="text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50/40 transition-all"
                  >
                    <FileText className="w-8 h-8 text-violet-600 mb-3" />
                    <p className="font-bold text-slate-800">Facturación electrónica</p>
                    <p className="text-sm text-slate-500 mt-1">Incluye resolución DIAN, rangos de numeración y clave técnica.</p>
                  </button>
                </div>
                <div className="flex justify-end pt-6 mt-6 border-t border-slate-100">
                  <button type="button" className="btn-secondary rounded-xl" onClick={cerrar}>Cancelar</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  {!editId && (
                    <button type="button" onClick={() => setTipo(null)} className="text-slate-400 hover:text-slate-700">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <h3 className="text-2xl font-bold text-slate-800">
                    {editId ? 'Editar Empresa' : tipo === 'SIMPLE' ? 'Nueva empresa simple' : 'Nueva empresa · Facturación electrónica'}
                  </h3>
                </div>

                <FormError message={formError} onDismiss={() => setFormError(null)} />

                {tipo === 'SIMPLE' ? (
                  /* ---------- Formulario SIMPLE ---------- */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre / Razón social</label>
                        <input required className="input-field rounded-xl" placeholder="Empresa XYZ S.A.S." value={formData.nombre} onChange={(e) => setField({ nombre: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT</label>
                          <input required className="input-field rounded-xl" placeholder="900123456" value={formData.nit} onChange={(e) => handleNit(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">DV</label>
                          <input readOnly className="input-field rounded-xl bg-slate-100 text-slate-500" value={formData.dv} placeholder="—" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contacto (email o teléfono)</label>
                        <input required className="input-field rounded-xl" placeholder="admin@xyz.com" value={formData.contacto} onChange={(e) => setField({ contacto: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección</label>
                        <input className="input-field rounded-xl" placeholder="Calle 1 # 2-3" value={formData.direccion_fisica} onChange={(e) => setField({ direccion_fisica: e.target.value })} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {localizacionBloque}
                      {ciiuBloque}
                      {modulosBloque}
                    </div>
                  </div>
                ) : (
                  /* ---------- Formulario FACTURACIÓN ELECTRÓNICA (completo) ---------- */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-bold text-brand-600 border-b pb-2">Datos Comerciales</h4>
                      <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Comercial</label><input required className="input-field rounded-xl" placeholder="Empresa XYZ" value={formData.nombre} onChange={(e) => setField({ nombre: e.target.value })} /></div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2"><label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT</label><input required className="input-field rounded-xl" placeholder="123456789" value={formData.nit} onChange={(e) => handleNit(e.target.value)} /></div>
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">DV</label><input className="input-field rounded-xl" placeholder="0" value={formData.dv} onChange={(e) => setField({ dv: e.target.value })} /></div>
                      </div>
                      <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Contacto General</label><input required className="input-field rounded-xl" placeholder="admin@xyz.com" value={formData.contacto} onChange={(e) => setField({ contacto: e.target.value })} /></div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo Persona</label>
                          <select className="input-field rounded-xl" value={formData.tipo_persona} onChange={(e) => setField({ tipo_persona: e.target.value })}>
                            <option value="1">Jurídica</option><option value="2">Natural</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Régimen</label>
                          <select className="input-field rounded-xl" value={formData.regimen_fiscal} onChange={(e) => setField({ regimen_fiscal: e.target.value })}>
                            <option value="O-48">O-48 Responsable IVA</option>
                            <option value="R-99-PN">R-99-PN No Responsable</option>
                            <option value="O-13">O-13 Gran Contribuyente</option>
                            <option value="O-47">O-47 Régimen Simple</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección Física</label>
                        <input className="input-field rounded-xl mb-2" placeholder="Dirección Física" value={formData.direccion_fisica} onChange={(e) => setField({ direccion_fisica: e.target.value })} />
                        {localizacionBloque}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="sm:col-span-2">{ciiuBloque}</div>
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email FE</label><input className="input-field rounded-xl" type="email" placeholder="fe@xyz.com" value={formData.email_facturacion} onChange={(e) => setField({ email_facturacion: e.target.value })} /></div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-brand-600 border-b pb-2">Resolución DIAN</h4>
                      <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Resolución N°</label><input className="input-field rounded-xl" placeholder="18760000001" value={formData.resolucion_numero} onChange={(e) => setField({ resolucion_numero: e.target.value })} /></div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Prefijo</label><input className="input-field rounded-xl" placeholder="SETP" value={formData.prefijo_facturacion} onChange={(e) => setField({ prefijo_facturacion: e.target.value })} /></div>
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Desde</label><input type="number" className="input-field rounded-xl" placeholder="1" value={formData.rango_desde} onChange={(e) => setField({ rango_desde: e.target.value })} /></div>
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Hasta</label><input type="number" className="input-field rounded-xl" placeholder="5000" value={formData.rango_hasta} onChange={(e) => setField({ rango_hasta: e.target.value })} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Vigencia Desde</label><input type="date" className="input-field rounded-xl" value={formData.fecha_vigencia_desde} onChange={(e) => setField({ fecha_vigencia_desde: e.target.value })} /></div>
                        <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Vigencia Hasta</label><input type="date" className="input-field rounded-xl" value={formData.fecha_vigencia_hasta} onChange={(e) => setField({ fecha_vigencia_hasta: e.target.value })} /></div>
                      </div>
                      <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Clave Técnica DIAN</label><input className="input-field rounded-xl" placeholder="fc8eac42..." value={formData.clave_tecnica} onChange={(e) => setField({ clave_tecnica: e.target.value })} /></div>

                      {editId && (
                        <div className="pt-2"><label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado de la Cuenta</label>
                          <select className="input-field rounded-xl" value={String(formData.activa)} onChange={(e) => setField({ activa: e.target.value === 'true' })}>
                            <option value="true">Activo (Permitir Acceso)</option>
                            <option value="false">Suspendido (Bloquear Acceso)</option>
                          </select>
                        </div>
                      )}

                      {modulosBloque}
                    </div>
                  </div>
                )}

                {editId && tipo === 'SIMPLE' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado de la Cuenta</label>
                    <select className="input-field rounded-xl max-w-xs" value={String(formData.activa)} onChange={(e) => setField({ activa: e.target.value === 'true' })}>
                      <option value="true">Activo (Permitir Acceso)</option>
                      <option value="false">Suspendido (Bloquear Acceso)</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-slate-100">
                  <button type="button" className="btn-secondary rounded-xl" onClick={cerrar}>Cancelar</button>
                  <button type="submit" disabled={guardar.isPending} className="btn-primary rounded-xl px-6">
                    {guardar.isPending ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Activar Servicio'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Empresas;
