import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { KeyRound, Plus, Edit, Trash2, ShieldCheck, Copy } from 'lucide-react';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const FORM_VACIO = { id: null, nombre: '', descripcion: '', permisos: [], todosModulos: true, modulos: [] };

/** Agrupa el catálogo por su grupo, conservando el orden en que viene. */
const porGrupo = (catalogo) => {
  const grupos = new Map();
  for (const p of catalogo) {
    if (!grupos.has(p.grupo)) grupos.set(p.grupo, []);
    grupos.get(p.grupo).push(p);
  }
  return [...grupos.entries()];
};

const Roles = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(['roles'], '/roles');
  const catalogo = useMemo(() => data?.catalogo || [], [data]);
  const modulosDisponibles = useMemo(() => data?.modulos || [], [data]);
  const dependencias = data?.dependencias || {};
  const misPermisos = useMemo(() => new Set(data?.mis_permisos || []), [data]);
  const propios = data?.propios || [];
  const base = data?.base || [];
  const etiqueta = useMemo(() => new Map(catalogo.map((p) => [p.codigo, p.etiqueta])), [catalogo]);

  const [form, setForm] = useState(null); // null = modal cerrado
  const [formError, setFormError] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [errorEliminar, setErrorEliminar] = useState(null);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['empresa'] });
    queryClient.invalidateQueries({ queryKey: ['sesion'] }); // por si el rol editado es el del propio usuario
  };

  const guardar = useMutation({
    mutationFn: (f) => {
      const body = {
        nombre: f.nombre.trim(),
        descripcion: f.descripcion.trim() || null,
        permisos: f.permisos,
        modulos: f.todosModulos ? null : f.modulos,
      };
      return f.id ? api.put(`/roles/${f.id}`, body) : api.post('/roles', body);
    },
    onSuccess: () => { refrescar(); setForm(null); setFormError(null); },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar el rol')),
  });

  const eliminar = useMutation({
    mutationFn: (id) => api.delete(`/roles/${id}`),
    onSuccess: () => { refrescar(); setEliminando(null); setErrorEliminar(null); },
    onError: (err) => setErrorEliminar(apiError(err, 'No se pudo eliminar el rol')),
  });

  const abrirNuevo = (plantilla) => {
    setFormError(null);
    setForm(plantilla
      ? { ...FORM_VACIO, nombre: '', descripcion: '', permisos: plantilla.permisos.filter((p) => misPermisos.has(p)) }
      : FORM_VACIO);
  };
  const abrirEditar = (r) => {
    setFormError(null);
    setForm({ id: r.id, nombre: r.nombre, descripcion: r.descripcion || '', permisos: r.permisos, todosModulos: r.modulos == null, modulos: r.modulos || [] });
  };

  const alternarPermiso = (codigo) => setForm((f) => ({
    ...f,
    permisos: f.permisos.includes(codigo) ? f.permisos.filter((p) => p !== codigo) : [...f.permisos, codigo],
  }));

  // Elegir un módulo trae los que necesita (Ventas → Inventario y Clientes); quitarlo quita los que dependen de él.
  const alternarModulo = (modulo) => setForm((f) => {
    if (f.modulos.includes(modulo)) {
      const quitar = new Set([modulo]);
      let cambio = true;
      while (cambio) {
        cambio = false;
        for (const m of f.modulos) {
          if (!quitar.has(m) && (dependencias[m] || []).some((d) => quitar.has(d))) { quitar.add(m); cambio = true; }
        }
      }
      return { ...f, modulos: f.modulos.filter((m) => !quitar.has(m)) };
    }
    const nuevos = new Set([...f.modulos, modulo]);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const m of [...nuevos]) {
        for (const d of dependencias[m] || []) {
          if (modulosDisponibles.includes(d) && !nuevos.has(d)) { nuevos.add(d); cambio = true; }
        }
      }
    }
    return { ...f, modulos: [...nuevos] };
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (form.nombre.trim().length < 2) return setFormError('Ponle un nombre al rol.');
    guardar.mutate(form);
  };

  const resumenModulos = (r) => (r.modulos == null ? 'Todos' : r.modulos.length === 0 ? 'Ninguno' : `${r.modulos.length} de ${modulosDisponibles.length}`);

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Roles y permisos"
        description="Define qué ve y qué puede hacer cada persona de tu equipo. Los roles base no cambian; crea los tuyos a la medida."
        action={
          <button type="button" className="btn-primary gap-2" onClick={() => abrirNuevo(null)}>
            <Plus className="w-5 h-5" aria-hidden="true" /> Nuevo rol
          </button>
        }
      />

      <section aria-label="Roles base" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {base.map((r) => (
          <div key={r.clave} className="card-container p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-700" aria-hidden="true" /> {r.nombre}
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">Base</span>
                </h3>
                <p className="text-sm text-slate-500 mt-1">{r.descripcion}</p>
              </div>
              <button type="button" className="btn-secondary text-xs gap-1.5 shrink-0" onClick={() => abrirNuevo(r)} aria-label={`Crear un rol a partir de ${r.nombre}`}>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copiar
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {r.clave === 'FRONT_ADMIN'
                ? 'Todos los permisos, incluidos los que se agreguen más adelante.'
                : r.permisos.length === 0 ? 'Sin permisos especiales.' : `Permisos: ${r.permisos.map((p) => etiqueta.get(p) || p).join(', ')}.`}
            </p>
          </div>
        ))}
      </section>

      <section aria-label="Roles de la empresa" className="space-y-3">
        <h3 className="text-xl font-semibold text-slate-800">Roles de tu empresa</h3>
        <TableCard>
          <THead>
            <Th>Rol</Th>
            <Th align="center">Permisos</Th>
            <Th align="center">Módulos</Th>
            <Th align="center">Personas</Th>
            <Th align="center" className="w-28">Acciones</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={5} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
              isEmpty={propios.length === 0} emptyIcon={KeyRound}
              emptyTitle="Aún no has creado roles propios"
              emptyHint="Crea uno, por ejemplo un «Cajero» que no vea costos, y asígnalo a quien corresponda desde Administración."
            />
            {propios.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <span className="font-medium text-slate-800">{r.nombre}</span>
                  {r.descripcion && <span className="block text-xs text-slate-500">{r.descripcion}</span>}
                </Td>
                <Td align="center">{r.permisos.length}</Td>
                <Td align="center">{resumenModulos(r)}</Td>
                <Td align="center">{r.usuarios}</Td>
                <Td align="center">
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" className="btn-icon" onClick={() => abrirEditar(r)} aria-label={`Editar el rol ${r.nombre}`}><Edit className="w-4 h-4" /></button>
                    <button type="button" className="btn-icon text-red-700" onClick={() => { setErrorEliminar(null); setEliminando(r); }} aria-label={`Eliminar el rol ${r.nombre}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      </section>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar rol' : 'Nuevo rol'} size="3xl">
        {form && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormError message={formError} onDismiss={() => setFormError(null)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombre del rol" required>
                <input className="input-field" maxLength={80} autoFocus placeholder="Cajero" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Field>
              <Field label="Descripción (opcional)">
                <input className="input-field" maxLength={300} placeholder="Atiende el mostrador" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700">Módulos a los que entra</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.todosModulos} onChange={(e) => setForm({ ...form, todosModulos: e.target.checked })} />
                Todos los módulos de la empresa
              </label>
              {!form.todosModulos && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 rounded-xl bg-slate-50 border border-slate-200 p-4">
                  {modulosDisponibles.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.modulos.includes(m)} onChange={() => alternarModulo(m)} />
                      {m}
                    </label>
                  ))}
                  <p className="col-span-full text-xs text-slate-500">Al elegir un módulo se incluyen los que necesita (por ejemplo, Ventas necesita Inventario y Clientes).</p>
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-700">Qué puede hacer</legend>
              <p className="text-xs text-slate-500">Sin marcar nada, la persona opera sus módulos pero sin acciones de administración. Solo puedes dar permisos que tú tienes.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {porGrupo(catalogo).map(([grupo, permisos]) => (
                  <div key={grupo} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{grupo}</p>
                    {permisos.map((p) => {
                      const permitido = misPermisos.has(p.codigo);
                      return (
                        <label key={p.codigo} className={`flex items-start gap-2 text-sm ${permitido ? 'text-slate-700' : 'text-slate-400'}`} title={permitido ? p.descripcion : 'No puedes dar un permiso que no tienes'}>
                          <input
                            type="checkbox" className="mt-1" disabled={!permitido}
                            checked={form.permisos.includes(p.codigo)} onChange={() => alternarPermiso(p.codigo)}
                          />
                          <span>
                            {p.etiqueta}
                            {p.descripcion && <span className="block text-xs text-slate-500">{p.descripcion}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </fieldset>

            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" disabled={guardar.isPending} className="btn-primary px-6">{guardar.isPending ? 'Guardando…' : 'Guardar rol'}</button>
            </ModalActions>
          </form>
        )}
      </Modal>

      <Modal open={!!eliminando} onClose={() => setEliminando(null)} title="Eliminar rol" size="md">
        {eliminando && (
          <div className="space-y-4">
            <FormError message={errorEliminar} onDismiss={() => setErrorEliminar(null)} />
            <p className="text-sm text-slate-700">
              Vas a eliminar el rol <strong>{eliminando.nombre}</strong>. {eliminando.usuarios > 0 ? 'Primero cambia de rol a quienes lo tienen.' : 'Nadie lo tiene asignado.'}
            </p>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setEliminando(null)}>Volver</button>
              <button type="button" className="btn-primary px-6" disabled={eliminar.isPending} onClick={() => eliminar.mutate(eliminando.id)}>
                {eliminar.isPending ? 'Eliminando…' : 'Eliminar rol'}
              </button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Roles;
