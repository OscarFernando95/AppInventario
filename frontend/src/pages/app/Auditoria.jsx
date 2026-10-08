import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import api from '../../api/axios';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import PageHeader from '../../components/ui/PageHeader';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

/**
 * Vista GERENCIAL de la actividad de la empresa: qué usuario, a qué hora y de
 * qué empresa hizo qué cosa, en frases. El detalle técnico (requests, errores,
 * niveles) es del súper administrador: /backoffice/logs.
 */
const LIMIT = 30;
const FILTROS_VACIOS = { usuarioId: '', modulo: '', desde: '', hasta: '' };

const TONO_MODULO = {
  Ventas: 'bg-emerald-100 text-emerald-800',
  Compras: 'bg-amber-100 text-amber-800',
  Pedidos: 'bg-amber-100 text-amber-800',
  Inventario: 'bg-brand-100 text-brand-800',
  Caja: 'bg-violet-100 text-violet-800',
  Gastos: 'bg-red-100 text-red-800',
  Recetas: 'bg-orange-100 text-orange-800',
  Usuarios: 'bg-slate-200 text-slate-800',
};

const fmtFecha = (v) => new Date(v).toLocaleString('es-CO', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const Auditoria = () => {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const { data: opciones } = useEmpresaQuery(['auditoria', 'filtros'], '/auditoria/filtros');
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(['auditoria', filtros, offset], async () => {
    const params = { limit: LIMIT, offset };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    const res = await api.get('/auditoria', { params });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });

  const actualizarFiltro = (patch) => {
    setOffset(0);
    setFiltros((prev) => ({ ...prev, ...patch }));
  };
  const filas = data?.rows || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Actividad de la empresa"
        description="Qué hizo cada usuario, a qué hora y en qué empresa: ventas, compras, caja, gastos, inventario y personal."
      />

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Usuario" className="w-full sm:w-52">
          <select className="input-field" value={filtros.usuarioId} onChange={(e) => actualizarFiltro({ usuarioId: e.target.value })}>
            <option value="">Todos</option>
            {(opciones?.usuarios || []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </Field>
        <Field label="Módulo" className="w-full sm:w-44">
          <select className="input-field" value={filtros.modulo} onChange={(e) => actualizarFiltro({ modulo: e.target.value })}>
            <option value="">Todos</option>
            {(opciones?.modulos || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
      </FilterBar>

      <TableCard>
        <THead>
          <Th>Fecha y hora</Th>
          <Th>Usuario</Th>
          <Th>Empresa</Th>
          <Th>Módulo</Th>
          <Th>Qué hizo</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={filas.length === 0} emptyIcon={ScrollText}
            emptyTitle={hayFiltros ? 'Sin actividad para estos filtros' : 'Todavía no hay actividad registrada'}
            emptyHint={hayFiltros ? 'Prueba con otro usuario, módulo o rango de fechas.' : 'Aquí verás las ventas, compras y cambios que haga tu equipo.'}
          />
          {filas.map((a) => (
            <Tr key={a.id}>
              <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(a.fecha)}</Td>
              <Td className="font-medium text-slate-800 whitespace-nowrap">
                {a.usuario ? a.usuario.nombre : <span className="text-slate-400">Sistema</span>}
                {a.usuario && <span className="block text-xs font-normal text-slate-500">@{a.usuario.username}</span>}
              </Td>
              <Td className="text-sm text-slate-600 whitespace-nowrap">{a.empresa?.nombre || '—'}</Td>
              <Td>
                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${TONO_MODULO[a.modulo] || 'bg-slate-100 text-slate-700'}`}>
                  {a.modulo}
                </span>
              </Td>
              <Td className="text-slate-800">
                <span className="font-semibold">{a.accion}</span>
                {a.descripcion && <span className="block text-sm text-slate-600">{a.descripcion}</span>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <TablePagination total={data?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />
    </div>
  );
};

export default Auditoria;
