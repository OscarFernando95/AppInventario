import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Building2, Plus, Power, ShieldCheck, FileText, Boxes, ArrowLeft, Lock, Sparkles } from 'lucide-react';
import SearchableSelect from '../../components/SearchableSelect';
import DaneLocationFields from '../../components/DaneLocationFields';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import { calcularDV } from '../../utils/nit';
import { useCiiu, useModulos } from '../../hooks/useCatalogos';
import { TIPOS_NEGOCIO, tipoNegocio, conDependencias, idsPorNombre, requeridoPor } from '../../utils/modulos';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const EMPTY = {
  nombre: '', nit: '', contacto: '', activa: true, modulosIds: [],
  dv: '', tipo_persona: '1', regimen_fiscal: 'O-48', direccion_fisica: '',
  municipio_dane: '', departamento_dane: '', codigo_ciiu: '', email_facturacion: '',
  resolucion_numero: '', prefijo_facturacion: '', rango_desde: '', rango_hasta: '',
  fecha_vigencia_desde: '', fecha_vigencia_hasta: '', clave_tecnica: '', tipo_empresa: 'SIMPLE',
  tipo_negocio: 'COMERCIO', capital_inicial: '',
};

const Chip = ({ tone = 'bg-slate-100 text-slate-700', children }) => (
  <span className={`inline-block text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${tone}`}>
    {children}
  </span>
);

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

  // Módulos "amarrados": al marcar uno se marcan los que requiere, y mientras
  // alguno marcado dependa de otro, este queda bloqueado (no se puede quitar).
  const handleToggleModulo = (id) => {
    setFormData((prev) => {
      if (prev.modulosIds.includes(id)) {
        return { ...prev, modulosIds: prev.modulosIds.filter((mId) => mId !== id) };
      }
      return { ...prev, modulosIds: conDependencias([...prev.modulosIds, id], modulos) };
    });
  };

  const sugeridosDe = (valorTipo) => conDependencias(idsPorNombre(tipoNegocio(valorTipo).sugeridos, modulos), modulos);

  const aplicarSugeridos = (valorTipo = formData.tipo_negocio) => {
    setFormData((prev) => ({
      ...prev,
      modulosIds: conDependencias([...new Set([...prev.modulosIds, ...sugeridosDe(valorTipo)])], modulos),
    }));
  };

  // Al crear, cambiar el tipo de negocio reemplaza la selección por los módulos
  // sugeridos. Al editar solo cambia el tipo (los módulos contratados no se tocan
  // salvo que se pulse «Aplicar sugeridos»).
  const handleTipoNegocio = (valor) => {
    setFormData((prev) => ({
      ...prev,
      tipo_negocio: valor,
      ...(editId ? {} : { modulosIds: sugeridosDe(valor) }),
    }));
  };

  const { data: empresas = [], isLoading, isError, error, refetch } = useQuery({
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
      // El contador "Empresas activas" del dashboard de backoffice vive en una
      // queryKey distinta (['empresas', 'count']); sin esto, crear/editar/
      // suspender una empresa aquí no se reflejaba ahí hasta pasados los 30s
      // de staleTime globales (lib/queryClient.js) y volver a entrar al panel.
      queryClient.invalidateQueries({ queryKey: ['empresas', 'count'] });
      cerrar();
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo registrar la empresa')),
  });

  const abrirNuevo = () => {
    setEditId(null);
    setTipo(null);
    setFormError(null);
    setFormData({ ...EMPTY, modulosIds: sugeridosDe(EMPTY.tipo_negocio) });
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
      // Si una empresa antigua tiene módulos sin sus dependencias, se completan
      // a la vista para que el guardado no falle.
      modulosIds: conDependencias(emp.Modulos.map((m) => m.id), modulos),
      tipo_negocio: emp.tipo_negocio || 'COMERCIO',
      capital_inicial: Number(emp.capital_inicial) ? String(Number(emp.capital_inicial)) : '',
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

  const sugeridosActuales = tipoNegocio(formData.tipo_negocio).sugeridos;
  const faltanSugeridos = sugeridosActuales.some((n) => {
    const m = modulos.find((x) => x.nombre_codigo === n);
    return m && !formData.modulosIds.includes(m.id);
  });

  const modulosBloque = (
    <fieldset className="border-t border-slate-100 pt-4 mt-2 space-y-4">
      <legend className="sr-only">Tipo de negocio y módulos</legend>

      <Field label="Tipo de negocio" hint={tipoNegocio(formData.tipo_negocio).descripcion}>
        <select className="input-field" value={formData.tipo_negocio} onChange={(e) => handleTipoNegocio(e.target.value)}>
          {TIPOS_NEGOCIO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-slate-700">Módulos habilitados</p>
          {faltanSugeridos && (
            <button
              type="button"
              onClick={() => aplicarSugeridos()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-800 bg-brand-50 hover:bg-brand-100 rounded-lg px-2.5 py-1.5 transition-colors
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Aplicar sugeridos
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
          {modulos.map((mod) => {
            const activo = formData.modulosIds?.includes(mod.id);
            const esBase = mod.id === inventarioId;
            const bloqueadoPor = activo ? requeridoPor(mod, formData.modulosIds, modulos) : [];
            const bloqueado = bloqueadoPor.length > 0;
            const sugerido = sugeridosActuales.includes(mod.nombre_codigo);
            return (
              <label
                key={mod.id}
                title={bloqueado ? `Lo requiere: ${bloqueadoPor.join(', ')}` : undefined}
                className={`flex items-start gap-2 p-2 rounded-xl border transition-all focus-within:ring-2 focus-within:ring-brand-600 ${
                  bloqueado ? 'cursor-not-allowed' : 'cursor-pointer'
                } ${activo ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                  checked={!!activo}
                  disabled={bloqueado}
                  onChange={() => handleToggleModulo(mod.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs font-medium ${activo ? 'text-brand-800' : 'text-slate-700'}`}>{mod.nombre_codigo}</span>
                    {esBase && <span className="text-[10px] font-semibold uppercase bg-brand-700 text-white px-1.5 py-0.5 rounded">base</span>}
                    {sugerido && !activo && <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">sugerido</span>}
                    {bloqueado && <Lock className="w-3 h-3 text-slate-500" aria-label={`Lo requiere ${bloqueadoPor.join(', ')}`} />}
                  </span>
                  {mod.requiere?.length > 0 && (
                    <span className="block text-[11px] text-slate-500 mt-0.5">Requiere: {mod.requiere.join(', ')}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  );

  const localizacionBloque = (
    <DaneLocationFields
      departamento={formData.departamento_dane}
      municipio={formData.municipio_dane}
      onChange={setField}
    />
  );

  const ciiuBloque = (
    <Field label="Actividad económica (CIIU)">
      <SearchableSelect
        options={ciiuOptions}
        value={formData.codigo_ciiu}
        onChange={(v) => setField({ codigo_ciiu: v })}
        placeholder="Buscar por código o descripción…"
      />
    </Field>
  );

  const capitalBloque = (
    <Field
      label="Capital inicial ($)"
      hint="Dinero con el que la empresa empieza en el software. Sirve de referencia: Caja mostrará cuánto ha crecido o disminuido frente a esta base."
    >
      <input
        type="number" min="0" step="0.01" className="input-field" placeholder="0"
        value={formData.capital_inicial} onChange={(e) => setField({ capital_inicial: e.target.value })}
      />
    </Field>
  );

  const estadoBloque = (
    <Field label="Estado de la Cuenta">
      <select className="input-field" value={String(formData.activa)} onChange={(e) => setField({ activa: e.target.value === 'true' })}>
        <option value="true">Activo (Permitir Acceso)</option>
        <option value="false">Suspendido (Bloquear Acceso)</option>
      </select>
    </Field>
  );

  const enSelectorDeTipo = !editId && !tipo;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Gestión de Empresas (Tenants)"
        description="Directorio global de empresas suscritas y estado de acceso."
        action={
          <button className="btn-primary gap-2" onClick={abrirNuevo}>
            <Plus className="w-5 h-5" aria-hidden="true" /> Registrar Inquilino
          </button>
        }
      />

      <TableCard>
        <THead>
          <Th>Empresa / Razón Social</Th>
          <Th>NIT / ID Fiscal</Th>
          <Th>Tipo</Th>
          <Th>Módulos Autorizados</Th>
          <Th align="center">Estado de Servicio</Th>
          <Th align="right">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={6}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={empresas.length === 0}
            emptyIcon={Building2}
            emptyTitle="No hay inquilinos (empresas) registrados"
            emptyHint="Crea el primero con «Registrar Inquilino»."
          />
          {empresas.map((emp) => (
            <Tr key={emp.id}>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-xl bg-brand-700 flex items-center justify-center text-white text-lg font-semibold">
                    {emp.nombre.charAt(0)}
                  </div>
                  {emp.nombre}
                </div>
              </Td>
              <Td className="font-mono text-sm text-slate-600 whitespace-nowrap">
                {emp.nit}{emp.dv ? `-${emp.dv}` : ''}
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-1">
                  <Chip tone="bg-amber-50 text-amber-800">{tipoNegocio(emp.tipo_negocio).label}</Chip>
                  <Chip tone={emp.tipo_empresa === 'FACTURACION_ELECTRONICA' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-700'}>
                    {emp.tipo_empresa === 'FACTURACION_ELECTRONICA' ? 'Facturación electrónica' : 'Simple'}
                  </Chip>
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {emp.Modulos?.slice(0, 3).map((m) => <Chip key={m.id}>{m.nombre_codigo}</Chip>)}
                  {emp.Modulos?.length > 3 && (
                    <Chip tone="bg-brand-50 text-brand-800">+{emp.Modulos.length - 3}</Chip>
                  )}
                  {!emp.Modulos?.length && <span className="text-xs text-slate-500 italic">Ninguno</span>}
                </div>
              </Td>
              <Td align="center">
                <span className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 justify-center w-fit mx-auto whitespace-nowrap ${
                  emp.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {emp.activa ? <ShieldCheck className="w-4 h-4" aria-hidden="true" /> : <Power className="w-4 h-4" aria-hidden="true" />}
                  {emp.activa ? 'ACTIVO' : 'SUSPENDIDO'}
                </span>
              </Td>
              <Td align="right">
                <button
                  onClick={() => abrirEdicion(emp)}
                  aria-label={`Editar ${emp.nombre}`}
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
        onClose={cerrar}
        size={enSelectorDeTipo ? 'xl' : '4xl'}
        title={
          enSelectorDeTipo
            ? 'Registrar Nuevo Tenant'
            : editId
              ? 'Editar Empresa'
              : tipo === 'SIMPLE' ? 'Nueva empresa simple' : 'Nueva empresa · Facturación electrónica'
        }
        description={enSelectorDeTipo ? '¿Qué tipo de empresa vas a crear?' : undefined}
      >
        {enSelectorDeTipo ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => elegirTipo('SIMPLE')}
                className="text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition-all
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <Boxes className="w-8 h-8 text-brand-700 mb-3" aria-hidden="true" />
                <p className="font-semibold text-slate-800">Empresa simple</p>
                <p className="text-sm text-slate-500 mt-1">Solo datos básicos. Ideal para inventario, ventas y compras internas.</p>
              </button>
              <button
                type="button"
                onClick={() => elegirTipo('FACTURACION_ELECTRONICA')}
                className="text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition-all
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <FileText className="w-8 h-8 text-brand-700 mb-3" aria-hidden="true" />
                <p className="font-semibold text-slate-800">Facturación electrónica</p>
                <p className="text-sm text-slate-500 mt-1">Incluye resolución DIAN, rangos de numeración y clave técnica.</p>
              </button>
            </div>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={cerrar}>Cancelar</button>
            </ModalActions>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!editId && (
              <button
                type="button"
                onClick={() => setTipo(null)}
                className="btn-icon -mt-2 mb-2 gap-2 px-3 w-auto text-sm"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Cambiar tipo
              </button>
            )}

            <FormError message={formError} onDismiss={() => setFormError(null)} />

            {tipo === 'SIMPLE' ? (
              /* ---------- Formulario SIMPLE ---------- */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <Field label="Nombre / Razón social" required>
                    <input className="input-field" placeholder="Empresa XYZ S.A.S." value={formData.nombre} onChange={(e) => setField({ nombre: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="NIT" required className="col-span-2">
                      <input className="input-field" placeholder="900123456" value={formData.nit} onChange={(e) => handleNit(e.target.value)} />
                    </Field>
                    <Field label="DV" hint="Calculado">
                      <input readOnly className="input-field bg-slate-100 text-slate-600" value={formData.dv} placeholder="—" />
                    </Field>
                  </div>
                  <Field label="Contacto (email o teléfono)" required>
                    <input className="input-field" placeholder="admin@xyz.com" value={formData.contacto} onChange={(e) => setField({ contacto: e.target.value })} />
                  </Field>
                  <Field label="Dirección">
                    <input className="input-field" placeholder="Calle 1 # 2-3" value={formData.direccion_fisica} onChange={(e) => setField({ direccion_fisica: e.target.value })} />
                  </Field>
                </div>

                <div className="space-y-4">
                  {localizacionBloque}
                  {ciiuBloque}
                  {capitalBloque}
                  {modulosBloque}
                </div>
              </div>
            ) : (
              /* ---------- Formulario FACTURACIÓN ELECTRÓNICA (completo) ---------- */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-brand-800 border-b border-slate-100 pb-2">Datos Comerciales</h4>

                  <Field label="Nombre Comercial" required>
                    <input className="input-field" placeholder="Empresa XYZ" value={formData.nombre} onChange={(e) => setField({ nombre: e.target.value })} />
                  </Field>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label="NIT" required className="col-span-2">
                      <input className="input-field" placeholder="123456789" value={formData.nit} onChange={(e) => handleNit(e.target.value)} />
                    </Field>
                    <Field label="DV">
                      <input className="input-field" placeholder="0" value={formData.dv} onChange={(e) => setField({ dv: e.target.value })} />
                    </Field>
                  </div>

                  <Field label="Contacto General" required>
                    <input className="input-field" placeholder="admin@xyz.com" value={formData.contacto} onChange={(e) => setField({ contacto: e.target.value })} />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tipo Persona">
                      <select className="input-field" value={formData.tipo_persona} onChange={(e) => setField({ tipo_persona: e.target.value })}>
                        <option value="1">Jurídica</option>
                        <option value="2">Natural</option>
                      </select>
                    </Field>
                    <Field label="Régimen">
                      <select className="input-field" value={formData.regimen_fiscal} onChange={(e) => setField({ regimen_fiscal: e.target.value })}>
                        <option value="O-48">O-48 Responsable IVA</option>
                        <option value="R-99-PN">R-99-PN No Responsable</option>
                        <option value="O-13">O-13 Gran Contribuyente</option>
                        <option value="O-47">O-47 Régimen Simple</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Dirección Física">
                    <input className="input-field" placeholder="Dirección Física" value={formData.direccion_fisica} onChange={(e) => setField({ direccion_fisica: e.target.value })} />
                  </Field>
                  {localizacionBloque}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="sm:col-span-2">{ciiuBloque}</div>
                    <Field label="Email FE">
                      <input className="input-field" type="email" placeholder="fe@xyz.com" value={formData.email_facturacion} onChange={(e) => setField({ email_facturacion: e.target.value })} />
                    </Field>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-brand-800 border-b border-slate-100 pb-2">Resolución DIAN</h4>

                  <Field label="Resolución N°">
                    <input className="input-field" placeholder="18760000001" value={formData.resolucion_numero} onChange={(e) => setField({ resolucion_numero: e.target.value })} />
                  </Field>

                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Prefijo">
                      <input className="input-field" placeholder="SETP" value={formData.prefijo_facturacion} onChange={(e) => setField({ prefijo_facturacion: e.target.value })} />
                    </Field>
                    <Field label="Desde">
                      <input type="number" className="input-field" placeholder="1" value={formData.rango_desde} onChange={(e) => setField({ rango_desde: e.target.value })} />
                    </Field>
                    <Field label="Hasta">
                      <input type="number" className="input-field" placeholder="5000" value={formData.rango_hasta} onChange={(e) => setField({ rango_hasta: e.target.value })} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Vigencia Desde">
                      <input type="date" className="input-field" value={formData.fecha_vigencia_desde} onChange={(e) => setField({ fecha_vigencia_desde: e.target.value })} />
                    </Field>
                    <Field label="Vigencia Hasta">
                      <input type="date" className="input-field" value={formData.fecha_vigencia_hasta} onChange={(e) => setField({ fecha_vigencia_hasta: e.target.value })} />
                    </Field>
                  </div>

                  <Field label="Clave Técnica DIAN">
                    <input className="input-field" placeholder="fc8eac42..." value={formData.clave_tecnica} onChange={(e) => setField({ clave_tecnica: e.target.value })} />
                  </Field>

                  {capitalBloque}

                  {editId && <div className="pt-2">{estadoBloque}</div>}

                  {modulosBloque}
                </div>
              </div>
            )}

            {editId && tipo === 'SIMPLE' && <div className="max-w-xs">{estadoBloque}</div>}

            <ModalActions>
              <button type="button" className="btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">
                {guardar.isPending ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Activar Servicio'}
              </button>
            </ModalActions>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default Empresas;
