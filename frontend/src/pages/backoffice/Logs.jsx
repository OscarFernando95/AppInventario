import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { ScrollText, ChevronLeft, ChevronRight, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const LIMIT = 50;

const NIVEL_TONE = {
  info: 'bg-slate-100 text-slate-700',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

const FILTROS_VACIOS = { evento: '', nivel: '', desde: '', hasta: '' };

const Badge = ({ tone, children }) => (
  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${tone}`}>
    {children}
  </span>
);

const Logs = () => {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);

  const hayFiltros = Object.values(filtros).some(Boolean);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bo-logs', filtros, offset],
    queryFn: async () => {
      const params = { limit: LIMIT, offset };
      Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get('/logs', { params });
      return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
    },
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + LIMIT, total);

  const actualizarFiltro = (patch) => {
    setOffset(0); // un cambio de filtro vuelve siempre a la primera página
    setFiltros((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Registro de Actividad"
        description="Eventos de negocio (accesos, errores de API, importaciones) para investigar casos de soporte."
      />

      <div className="card-container p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Evento" className="w-full sm:w-48">
            <input
              className="input-field"
              placeholder="p. ej. login_fail"
              value={filtros.evento}
              onChange={(e) => actualizarFiltro({ evento: e.target.value })}
            />
          </Field>
          <Field label="Nivel" className="w-full sm:w-40">
            <select className="input-field" value={filtros.nivel} onChange={(e) => actualizarFiltro({ nivel: e.target.value })}>
              <option value="">Todos</option>
              <option value="info">Info</option>
              <option value="warn">Advertencia</option>
              <option value="error">Error</option>
            </select>
          </Field>
          <Field label="Desde" className="w-full sm:w-44">
            <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
          </Field>
          <Field label="Hasta" className="w-full sm:w-44">
            <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
          </Field>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => actualizarFiltro(FILTROS_VACIOS)}
              className="btn-secondary gap-1.5 h-[42px]"
            >
              <X className="w-4 h-4" aria-hidden="true" /> Limpiar
            </button>
          )}
        </div>
      </div>

      <TableCard>
        <THead>
          <Th>Fecha</Th>
          <Th>Evento</Th>
          <Th align="center">Nivel</Th>
          <Th>Usuario</Th>
          <Th>Empresa</Th>
          <Th>Detalle</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={6}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={refetch}
            isEmpty={rows.length === 0}
            emptyIcon={ScrollText}
            emptyTitle={hayFiltros ? 'Sin resultados para estos filtros' : 'Aún no hay eventos registrados'}
            emptyHint={hayFiltros ? 'Prueba ajustando el rango de fechas o el nivel.' : undefined}
          />
          {rows.map((log) => (
            <Tr key={log.id}>
              <Td className="text-slate-500 whitespace-nowrap text-sm">
                {new Date(log.creado_en).toLocaleString('es-CO')}
              </Td>
              <Td className="font-medium text-slate-800">
                {log.evento}
                {(log.metodo || log.ruta) && (
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {log.metodo} {log.ruta} {log.status_code ? `· ${log.status_code}` : ''}
                  </div>
                )}
              </Td>
              <Td align="center">
                <Badge tone={NIVEL_TONE[log.nivel] || NIVEL_TONE.info}>{log.nivel?.toUpperCase()}</Badge>
              </Td>
              <Td className="text-slate-600 whitespace-nowrap">
                {log.Usuario ? `${log.Usuario.nombre} (@${log.Usuario.username})` : <span className="text-slate-400">—</span>}
              </Td>
              <Td className="text-slate-600 whitespace-nowrap">
                {log.Empresa ? log.Empresa.nombre : <span className="text-slate-400">—</span>}
              </Td>
              <Td className="max-w-xs">
                {log.detalle ? (
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-700 hover:text-brand-800 select-none">
                      ver detalle
                    </summary>
                    <pre className="mt-1 text-xs text-slate-600 whitespace-pre-wrap break-words bg-slate-50 rounded-lg p-2 border border-slate-100">
                      {JSON.stringify(log.detalle, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Mostrando {desde}–{hasta} de {total}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary gap-1"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Anterior
            </button>
            <button
              type="button"
              className="btn-secondary gap-1"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset((o) => o + LIMIT)}
            >
              Siguiente <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logs;
