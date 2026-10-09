import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Plus, Pencil, Trash2, Tags, Clock3 } from 'lucide-react';
import api from '../../api/axios';
import { formatCOP } from '../../utils/format';
import { apiError } from '../../utils/apiError';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { useOpciones } from '../../hooks/useOpciones';
import FormError from '../../components/FormError';
import SearchableSelect from '../../components/SearchableSelect';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const DIAS = [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['0', 'Dom']];
const TODOS_LOS_DIAS = ['0', '1', '2', '3', '4', '5', '6'];
const resumenDias = (dias) => (dias.length === 7 ? 'Todos los días' : DIAS.filter(([n]) => dias.includes(Number(n))).map(([, e]) => e).join(', '));

/* ───────────────────────── Categorías ───────────────────────── */
const Categorias = () => {
  const qc = useQueryClient();
  const { data: cats = [], isLoading, isError, error, refetch } = useEmpresaQuery(['menu', 'categorias', 'todas'], async () => (await api.get('/menu/categorias', { params: { todas: 1 } })).data);
  const [nombre, setNombre] = useState('');
  const [editando, setEditando] = useState(null);
  const [formError, setFormError] = useState(null);
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['empresa'] }); setFormError(null); };
  const fallar = (err) => setFormError(apiError(err, 'No se pudo guardar'));

  const crear = useMutation({ mutationFn: (n) => api.post('/menu/categorias', { nombre: n }), onSuccess: () => { refrescar(); setNombre(''); }, onError: fallar });
  const actualizar = useMutation({ mutationFn: ({ id, ...b }) => api.put(`/menu/categorias/${id}`, b), onSuccess: () => { refrescar(); setEditando(null); }, onError: fallar });
  const ordenar = useMutation({ mutationFn: (ids) => api.put('/menu/categorias/orden', { ids }), onSuccess: refrescar, onError: fallar });
  const mover = (i, delta) => {
    const ids = cats.map((c) => c.id);
    [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
    ordenar.mutate(ids);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 max-w-2xl">Las categorías agrupan el catálogo del mesero y del mostrador (entradas, bebidas, postres…). Su orden aquí es el orden en que aparecen. A cada producto se le asigna su categoría en Inventario.</p>
      <FormError message={formError} onDismiss={() => setFormError(null)} />
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) crear.mutate(nombre.trim()); }}>
        <Field label="Nueva categoría" className="w-64"><input className="input-field" maxLength={60} placeholder="Bebidas calientes" value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
        <button type="submit" className="btn-primary gap-2 mb-0.5" disabled={!nombre.trim() || crear.isPending}><Plus className="w-4 h-4" aria-hidden="true" /> Agregar</button>
      </form>
      <TableCard>
        <THead><Th className="w-24">Orden</Th><Th>Categoría</Th><Th align="center">Estado</Th><Th align="center" className="w-28">Acciones</Th></THead>
        <tbody>
          <TableState colSpan={4} isLoading={isLoading} isError={isError} error={error} onRetry={refetch} isEmpty={cats.length === 0} emptyIcon={Tags} emptyTitle="Aún no hay categorías" emptyHint="Crea la primera arriba." />
          {cats.map((c, i) => (
            <Tr key={c.id}>
              <Td>
                <button type="button" className="btn-icon" aria-label={`Subir ${c.nombre}`} disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)}><ArrowUp className="w-4 h-4" /></button>
                <button type="button" className="btn-icon" aria-label={`Bajar ${c.nombre}`} disabled={i === cats.length - 1 || ordenar.isPending} onClick={() => mover(i, 1)}><ArrowDown className="w-4 h-4" /></button>
              </Td>
              <Td className={`font-medium ${c.activa ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{c.nombre}</Td>
              <Td align="center">
                <button type="button" className={`px-3 py-1 rounded-full text-xs font-semibold ${c.activa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`} aria-label={`${c.activa ? 'Desactivar' : 'Activar'} ${c.nombre}`} onClick={() => actualizar.mutate({ id: c.id, activa: !c.activa })}>{c.activa ? 'ACTIVA' : 'INACTIVA'}</button>
              </Td>
              <Td align="center"><button type="button" className="btn-icon" aria-label={`Renombrar ${c.nombre}`} onClick={() => setEditando({ id: c.id, nombre: c.nombre })}><Pencil className="w-4 h-4" /></button></Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Modal open={!!editando} onClose={() => setEditando(null)} title="Renombrar categoría" size="sm">
        {editando && (
          <form onSubmit={(e) => { e.preventDefault(); if (editando.nombre.trim()) actualizar.mutate({ id: editando.id, nombre: editando.nombre.trim() }); }} className="space-y-4">
            <Field label="Nombre"><input className="input-field" autoFocus maxLength={60} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} /></Field>
            <ModalActions><button type="button" className="btn-secondary" onClick={() => setEditando(null)}>Cancelar</button><button type="submit" className="btn-primary px-6">Guardar</button></ModalActions>
          </form>
        )}
      </Modal>
    </div>
  );
};

/* ───────────────────────── Precios por horario ───────────────────────── */
const OFERTA_VACIA = { nombre: '', tipo: 'PORCENTAJE', valor: '', dias: TODOS_LOS_DIAS, hora_inicio: '17:00', hora_fin: '19:00', producto_ids: [], categoria_ids: [], activo: true };

const Ofertas = () => {
  const qc = useQueryClient();
  const { opcion } = useOpciones();
  const { data: ofertas = [], isLoading, isError, error, refetch } = useEmpresaQuery(['menu', 'ofertas'], '/menu/precios-horario');
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const { data: categorias = [] } = useEmpresaQuery(['menu', 'categorias'], '/menu/categorias', { enabled: opcion('menu_categorias') });
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(OFERTA_VACIA);
  const [formError, setFormError] = useState(null);

  const vendibles = productos.filter((p) => ['VENTA', 'RECETA', 'COMBO'].includes(p.tipo));
  const porId = new Map(productos.map((p) => [p.id, p]));
  const catPorId = new Map(categorias.map((c) => [c.id, c]));
  const cerrar = () => { setAbierto(false); setEditId(null); setForm(OFERTA_VACIA); setFormError(null); };
  const refrescar = () => qc.invalidateQueries({ queryKey: ['empresa'] });

  const guardar = useMutation({
    mutationFn: (payload) => (editId ? api.put(`/menu/precios-horario/${editId}`, payload) : api.post('/menu/precios-horario', payload)),
    onSuccess: () => { refrescar(); cerrar(); },
    onError: (err) => setFormError(apiError(err, 'No se pudo guardar la oferta')),
  });
  const alternar = useMutation({ mutationFn: ({ id, activo }) => api.put(`/menu/precios-horario/${id}`, { activo }), onSuccess: refrescar });
  const eliminar = useMutation({ mutationFn: (id) => api.delete(`/menu/precios-horario/${id}`), onSuccess: refrescar });

  const abrirEdicion = (o) => {
    setEditId(o.id);
    setForm({ ...o, valor: String(Number(o.valor)), dias: o.dias.map(String) });
    setFormError(null);
    setAbierto(true);
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    guardar.mutate({
      nombre: form.nombre.trim(), tipo: form.tipo, valor: Number(form.valor), dias: form.dias.map(Number),
      hora_inicio: form.hora_inicio, hora_fin: form.hora_fin, producto_ids: form.producto_ids, categoria_ids: form.categoria_ids, activo: form.activo,
    });
  };
  const alcance = (o) => {
    const nombres = [...o.categoria_ids.map((id) => catPorId.get(id)?.nombre), ...o.producto_ids.map((id) => porId.get(id)?.nombre_producto)].filter(Boolean);
    return nombres.length ? nombres.join(', ') : 'Todos los productos';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">Ofertas que rigen solo en ciertos días y horas (happy hour, almuerzo ejecutivo). El precio baja solo mientras rigen: el catálogo muestra el precio de lista tachado y la cuenta conserva el precio con que se pidió.</p>
        <button type="button" className="btn-primary gap-2" onClick={() => { setForm(OFERTA_VACIA); setEditId(null); setFormError(null); setAbierto(true); }}><Plus className="w-5 h-5" aria-hidden="true" /> Nueva oferta</button>
      </div>
      <TableCard>
        <THead><Th>Oferta</Th><Th>Rebaja</Th><Th>Cuándo</Th><Th>A qué</Th><Th align="center">Estado</Th><Th align="center" className="w-28">Acciones</Th></THead>
        <tbody>
          <TableState colSpan={6} isLoading={isLoading} isError={isError} error={error} onRetry={refetch} isEmpty={ofertas.length === 0} emptyIcon={Clock3} emptyTitle="Aún no hay ofertas por horario" emptyHint="Crea la primera con «Nueva oferta»." />
          {ofertas.map((o) => (
            <Tr key={o.id}>
              <Td className="font-medium text-slate-800">{o.nombre}</Td>
              <Td className="whitespace-nowrap">{o.tipo === 'PORCENTAJE' ? `${Number(o.valor).toLocaleString('es-CO')} % menos` : `a ${formatCOP(o.valor)}`}</Td>
              <Td className="text-sm">{resumenDias(o.dias)} · {o.hora_inicio}–{o.hora_fin}</Td>
              <Td className="text-sm text-slate-600 max-w-xs truncate">{alcance(o)}</Td>
              <Td align="center">
                <button type="button" className={`px-3 py-1 rounded-full text-xs font-semibold ${o.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`} aria-label={`${o.activo ? 'Apagar' : 'Encender'} la oferta ${o.nombre}`} onClick={() => alternar.mutate({ id: o.id, activo: !o.activo })}>{o.activo ? 'ACTIVA' : 'APAGADA'}</button>
              </Td>
              <Td align="center" className="whitespace-nowrap">
                <button type="button" className="btn-icon" aria-label={`Editar ${o.nombre}`} onClick={() => abrirEdicion(o)}><Pencil className="w-4 h-4" /></button>
                <button type="button" className="btn-icon" aria-label={`Eliminar ${o.nombre}`} onClick={() => eliminar.mutate(o.id)}><Trash2 className="w-4 h-4" /></button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal open={abierto} onClose={cerrar} title={editId ? 'Editar oferta' : 'Nueva oferta'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Nombre" required className="sm:col-span-3"><input className="input-field" maxLength={80} placeholder="Happy hour" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Field>
            <Field label="Tipo de rebaja">
              <select className="input-field" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="PORCENTAJE">Porcentaje de descuento</option>
                <option value="PRECIO_FIJO">Precio fijo</option>
              </select>
            </Field>
            <Field label={form.tipo === 'PORCENTAJE' ? 'Descuento (%)' : 'Precio ($)'} required>
              <input type="number" min="0" step="any" className="input-field" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </Field>
            <span />
            <Field label="Desde las" required><input type="time" className="input-field" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></Field>
            <Field label="Hasta las" required hint="Si es menor que «desde», cruza la medianoche."><input type="time" className="input-field" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700 mb-1.5">Días</legend>
            <div className="flex flex-wrap gap-2">
              {DIAS.map(([n, etiqueta]) => (
                <label key={n} className={`rounded-lg border px-3 py-1.5 text-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-600 ${form.dias.includes(n) ? 'bg-brand-700 text-white border-brand-700 font-semibold' : 'bg-white border-slate-200 text-slate-700'}`}>
                  <input type="checkbox" className="sr-only" checked={form.dias.includes(n)} onChange={(e) => setForm({ ...form, dias: e.target.checked ? [...form.dias, n] : form.dias.filter((d) => d !== n) })} />
                  {etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
            <legend className="px-2 text-sm font-semibold text-brand-800">¿A qué se aplica?</legend>
            <p className="text-xs text-slate-500">Sin elegir nada se aplica a todos los productos.</p>
            {categorias.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600" checked={form.categoria_ids.includes(c.id)} onChange={(e) => setForm({ ...form, categoria_ids: e.target.checked ? [...form.categoria_ids, c.id] : form.categoria_ids.filter((x) => x !== c.id) })} />
                    {c.nombre}
                  </label>
                ))}
              </div>
            )}
            <Field label="Productos concretos">
              <SearchableSelect
                options={vendibles.filter((p) => !form.producto_ids.includes(p.id)).map((p) => ({ value: String(p.id), label: p.nombre_producto, keywords: p.codigo }))}
                value="" onChange={(v) => v && setForm({ ...form, producto_ids: [...form.producto_ids, Number(v)] })} placeholder="Buscar producto…" allowClear={false}
              />
            </Field>
            <ul className="flex flex-wrap gap-2">
              {form.producto_ids.map((id) => (
                <li key={id} className="flex items-center gap-1 rounded-full bg-slate-100 pl-3 pr-1 py-1 text-sm">
                  {porId.get(id)?.nombre_producto}
                  <button type="button" className="btn-icon p-1" aria-label={`Quitar ${porId.get(id)?.nombre_producto}`} onClick={() => setForm({ ...form, producto_ids: form.producto_ids.filter((x) => x !== id) })}>×</button>
                </li>
              ))}
            </ul>
          </fieldset>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={cerrar}>Cancelar</button>
            <button type="submit" className="btn-primary px-6" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar oferta'}</button>
          </ModalActions>
        </form>
      </Modal>
    </div>
  );
};

/** Menú: lo que se configura de lo que se vende (categorías, ofertas por horario…). Cada parte aparece solo si su opción está encendida. */
const Menu = () => {
  const { opcion } = useOpciones();
  const tabs = [
    ...(opcion('menu_categorias') ? [{ id: 'categorias', label: 'Categorías' }] : []),
    ...(opcion('precios_horario') ? [{ id: 'ofertas', label: 'Precios por horario' }] : []),
  ];
  const [tab, setTab] = useState(null);
  const actual = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Menú" description="Organiza lo que se vende: categorías con su orden y ofertas por día y hora." />
      {tabs.length === 0 ? (
        <div className="card-container p-8 text-center text-slate-500">
          <p className="font-semibold text-slate-700">No hay nada del menú activado</p>
          <p className="text-sm mt-1">Enciende «Categorías del menú» o «Precios por horario» en Opciones.</p>
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} value={actual} onChange={setTab} />
          {actual === 'categorias' ? <Categorias /> : <Ofertas />}
        </>
      )}
    </div>
  );
};

export default Menu;
