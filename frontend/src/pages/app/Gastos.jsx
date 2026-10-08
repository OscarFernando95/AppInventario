import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { HandCoins, Plus, Ban } from 'lucide-react';
import { formatCOP, fechaLocal } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { CATEGORIAS_GASTO } from '../../utils/gastos';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const LIMIT = 20;

const FILTROS_VACIOS = { desde: '', hasta: '', categoria: '', estado: '' };
const hoy = () => fechaLocal();
const FORM_VACIO = () => ({ categoria: 'SERVICIOS', descripcion: '', monto: '', fecha: hoy(), proveedorId: '', pagarDeCaja: false });

const fmtFecha = (v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

const Gastos = () => {
  const queryClient = useQueryClient();
  const esAdmin = useAuthStore((s) => s.user?.rol === 'FRONT_ADMIN');
  const modulos = useAuthStore((s) => s.activeEmpresa?.modulos) || [];
  const conCaja = modulos.includes('Caja');

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [formError, setFormError] = useState(null);
  const [anulando, setAnulando] = useState(null); // gasto que se va a anular
  const hayFiltros = Object.values(filtros).some(Boolean);

  const params = () => {
    const p = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };

  const { data: lista, isLoading, isError, error, refetch } = useEmpresaQuery(['gastos', filtros, offset], async () => {
    const res = await api.get('/gastos', { params: { ...params(), limit: LIMIT, offset } });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const { data: resumen } = useEmpresaQuery(['gastos', 'resumen', filtros.desde, filtros.hasta], async () => {
    const p = {};
    if (filtros.desde) p.desde = filtros.desde;
    if (filtros.hasta) p.hasta = filtros.hasta;
    return (await api.get('/gastos/resumen', { params: p })).data;
  });
  const { data: proveedores = [] } = useEmpresaQuery(['proveedores'], '/proveedores', { enabled: modulos.includes('Proveedores') });
  const { data: cajaActual } = useEmpresaQuery(['caja', 'actual'], '/caja/actual', { enabled: conCaja });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });
  const actualizarFiltro = (patch) => { setOffset(0); setFiltros((prev) => ({ ...prev, ...patch })); };

  const registrar = useMutation({
    mutationFn: (payload) => api.post('/gastos', payload),
    onSuccess: () => { invalidar(); setShowModal(false); setForm(FORM_VACIO()); setFormError(null); },
    onError: (err) => setFormError(apiError(err, 'No se pudo registrar el gasto')),
  });

  const anular = useMutation({
    mutationFn: (id) => api.post(`/gastos/${id}/anular`),
    onSuccess: () => { invalidar(); setAnulando(null); },
    onError: (err) => { setAnulando(null); setFormError(apiError(err, 'No se pudo anular el gasto')); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!form.descripcion.trim()) return setFormError('Describe el gasto.');
    if (!(Number(form.monto) > 0)) return setFormError('El monto debe ser mayor a 0.');
    registrar.mutate({
      categoria: form.categoria,
      descripcion: form.descripcion.trim(),
      monto: Number(form.monto),
      fecha: form.fecha || undefined,
      proveedorId: form.proveedorId ? Number(form.proveedorId) : undefined,
      pagar_desde_caja: conCaja && cajaActual && form.pagarDeCaja ? true : undefined,
    });
  };

  const filas = lista?.rows || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Gastos"
        description="Recibos, arriendo, nómina y otros gastos del negocio. No necesitan proveedor; las compras de mercancía van en Compras."
        action={(
          <button className="btn-primary gap-2" onClick={() => { setForm(FORM_VACIO()); setFormError(null); setShowModal(true); }}>
            <Plus className="w-5 h-5" aria-hidden="true" /> Registrar gasto
          </button>
        )}
      />

      {formError && !showModal && <FormError message={formError} onDismiss={() => setFormError(null)} />}

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
        <Field label="Categoría" className="w-full sm:w-56">
          <select className="input-field" value={filtros.categoria} onChange={(e) => actualizarFiltro({ categoria: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIAS_GASTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Estado" className="w-full sm:w-40">
          <select className="input-field" value={filtros.estado} onChange={(e) => actualizarFiltro({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="ANULADO">Anulados</option>
          </select>
        </Field>
      </FilterBar>

      {resumen && resumen.por_categoria.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="card-container px-4 py-3 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total gastos</p>
            <p className="text-lg font-bold text-slate-800">{formatCOP(resumen.total)}</p>
          </div>
          {resumen.por_categoria.map((c) => (
            <div key={c.categoria} className="card-container px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{(CATEGORIAS_GASTO[c.categoria] || c.categoria).split(' (')[0]} · {c.num}</p>
              <p className="text-lg font-bold text-slate-800">{formatCOP(c.total)}</p>
            </div>
          ))}
        </div>
      )}

      <TableCard>
        <THead>
          <Th>Fecha</Th>
          <Th>Categoría</Th>
          <Th>Descripción</Th>
          <Th>Pagado</Th>
          <Th align="right">Monto</Th>
          <Th align="center">Estado</Th>
          {esAdmin && <Th align="center" className="w-20">Acciones</Th>}
        </THead>
        <tbody>
          <TableState
            colSpan={esAdmin ? 7 : 6} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={filas.length === 0} emptyIcon={HandCoins}
            emptyTitle={hayFiltros ? 'Sin gastos para este filtro' : 'Aún no hay gastos registrados'}
            emptyHint="Registra un recibo, el arriendo o la nómina con «Registrar gasto»."
          />
          {filas.map((g) => {
            const anulado = g.estado === 'ANULADO';
            return (
              <Tr key={g.id} className={anulado ? 'opacity-60' : ''}>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(g.fecha)}</Td>
                <Td><span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-700 whitespace-nowrap">{(CATEGORIAS_GASTO[g.categoria] || g.categoria).split(' (')[0]}</span></Td>
                <Td className={`font-medium text-slate-800 ${anulado ? 'line-through' : ''}`}>
                  {g.descripcion}
                  <span className="block text-xs font-normal text-slate-500">
                    {g.Proveedor?.nombre ? `${g.Proveedor.nombre} · ` : ''}{g.usuario?.nombre}
                  </span>
                </Td>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{g.origen_pago === 'CAJA' ? 'Efectivo de caja' : 'Otro medio'}</Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${anulado ? 'line-through' : ''}`}>{formatCOP(g.monto)}</Td>
                <Td align="center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${anulado ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                    {anulado ? 'ANULADO' : 'ACTIVO'}
                  </span>
                </Td>
                {esAdmin && (
                  <Td align="center">
                    {!anulado && (
                      <button className="btn-icon" aria-label={`Anular gasto ${g.descripcion}`} title="Anular" onClick={() => { setFormError(null); setAnulando(g); }}>
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <TablePagination total={lista?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Registrar gasto" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={formError} onDismiss={() => setFormError(null)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Categoría" required>
              <select className="input-field" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {Object.entries(CATEGORIAS_GASTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Fecha del gasto">
              <input type="date" max={hoy()} className="input-field" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
          </div>
          <Field label="Descripción" required>
            <input className="input-field" maxLength={255} autoFocus placeholder="Recibo de energía de octubre" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Monto ($)" required>
              <input type="number" min="0" step="0.01" className="input-field" placeholder="150000" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
            </Field>
            {modulos.includes('Proveedores') && (
              <Field label="Proveedor (opcional)">
                <select className="input-field" value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Field>
            )}
          </div>

          {conCaja && (
            <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${cajaActual ? 'border-slate-200 bg-slate-50 cursor-pointer' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <input
                type="checkbox" className="mt-0.5 w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                checked={!!cajaActual && form.pagarDeCaja} disabled={!cajaActual}
                onChange={(e) => setForm({ ...form, pagarDeCaja: e.target.checked })}
              />
              <span>
                <span className="font-semibold">Pagado en efectivo de la caja</span>
                <span className="block text-xs text-slate-500">
                  {cajaActual
                    ? `Restará del efectivo de tu caja (hay ${formatCOP(cajaActual.resumen.efectivo_esperado)}).`
                    : 'No tienes caja abierta. Ábrela para pagar de ahí; si no, el gasto se registra pagado por otro medio (banco, transferencia).'}
                </span>
              </span>
            </label>
          )}

          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="submit" disabled={registrar.isPending} className="btn-primary px-6">{registrar.isPending ? 'Guardando…' : 'Registrar gasto'}</button>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!anulando} onClose={() => setAnulando(null)} title="Anular gasto" size="md">
        {anulando && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Vas a anular <strong>{anulando.descripcion}</strong> por <strong>{formatCOP(anulando.monto)}</strong>. Deja de contar en los totales y balances
              {anulando.origen_pago === 'CAJA' ? '; el efectivo vuelve a la caja (solo si esa caja sigue abierta).' : '.'}
            </p>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setAnulando(null)}>Volver</button>
              <button type="button" className="btn-primary px-6" disabled={anular.isPending} onClick={() => anular.mutate(anulando.id)}>
                {anular.isPending ? 'Anulando…' : 'Anular gasto'}
              </button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Gastos;
