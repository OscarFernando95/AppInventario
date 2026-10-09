import { useState } from 'react';
import { Timer, Repeat, Receipt } from 'lucide-react';
import api from '../../api/axios';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { fechaISOLocal, sumarDiasISO, formatoMinutos } from '../../utils/calendarioReservas';
import Field from '../ui/Field';
import { TableState } from '../ui/DataState';

const Tarjeta = ({ icono, titulo, valor, detalle }) => {
  const Icono = icono;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><Icono className="w-4 h-4 text-brand-700" aria-hidden="true" /> {titulo}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
};

/**
 * Tiempo de ocupación: de las cuentas ya cobradas del rango, cuánto dura cada mesa ocupada, cuántas veces rota por día y
 * a qué horas llega la gente. Solo tablas y barras con divs (sin librerías de gráficos). Solo con la opción encendida.
 */
const Ocupacion = () => {
  const [rango, setRango] = useState(() => ({ desde: sumarDiasISO(fechaISOLocal(), -29), hasta: fechaISOLocal() }));
  const valido = rango.desde && rango.hasta && rango.desde <= rango.hasta;
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(
    ['ocupacion', rango.desde, rango.hasta],
    async () => (await api.get('/mesas/ocupacion', { params: rango })).data,
    { enabled: !!valido },
  );
  const g = data?.general;
  const maxMesa = Math.max(1, ...(data?.por_mesa || []).map((m) => m.minutos_promedio));
  const maxHora = Math.max(1, ...(data?.por_hora || []).map((h) => h.cuentas));

  return (
    <section aria-label="Ocupación de las mesas" className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <Field label="Desde" className="w-44"><input type="date" className="input-field" max={rango.hasta || undefined} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></Field>
        <Field label="Hasta" className="w-44"><input type="date" className="input-field" min={rango.desde || undefined} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></Field>
        <p className="mb-5 text-xs text-slate-500">Cuentas de mesa ya cobradas, por la fecha en que se cobraron.</p>
      </div>
      {!valido && <p role="alert" className="text-sm text-red-700">La fecha «desde» no puede ser posterior a «hasta».</p>}

      {valido && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Tarjeta icono={Timer} titulo="Tiempo promedio por mesa" valor={g ? formatoMinutos(g.minutos_promedio) : '—'} detalle={g ? `Mediana: ${formatoMinutos(g.minutos_mediana)}` : undefined} />
            <Tarjeta icono={Receipt} titulo="Cuentas cobradas" valor={g ? g.cuentas.toLocaleString('es-CO') : '—'} detalle={data ? `En ${data.dias} ${data.dias === 1 ? 'día' : 'días'}` : undefined} />
            <Tarjeta icono={Repeat} titulo="Rotación por mesa por día" valor={g ? g.rotacion_por_mesa_por_dia.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '—'} detalle="Veces que se ocupa una mesa al día" />
          </div>

          <div className="card-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-4 font-medium">Mesa</th>
                  <th className="py-2 px-4 font-medium text-right">Cuentas</th>
                  <th className="py-2 px-4 font-medium">Tiempo promedio</th>
                  <th className="py-2 px-4 font-medium text-right">Tiempo total</th>
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={4} isLoading={isLoading} isError={isError} error={error} onRetry={refetch} isEmpty={!!data && data.por_mesa.length === 0} emptyIcon={Timer} emptyTitle="Aún no hay mesas" emptyHint="Crea mesas desde «Configurar mesas»." />
                {(data?.por_mesa || []).map((m) => (
                  <tr key={m.mesaId} className="border-t border-slate-100">
                    <td className="py-2 px-4 font-medium text-slate-800">{m.nombre}</td>
                    <td className="py-2 px-4 text-right">{m.cuentas}</td>
                    <td className="py-2 px-4">
                      <span className="flex items-center gap-3">
                        <span className="h-2 flex-1 max-w-48 rounded-full bg-slate-100" aria-hidden="true"><span className="block h-2 rounded-full bg-brand-600" style={{ width: `${(m.minutos_promedio / maxMesa) * 100}%` }} /></span>
                        <span className="tabular-nums">{m.cuentas ? formatoMinutos(m.minutos_promedio) : '—'}</span>
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">{m.cuentas ? formatoMinutos(m.minutos_total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.por_hora.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">¿A qué hora llega la gente?</h3>
              <ul className="space-y-1.5" aria-label="Cuentas abiertas por hora">
                {data.por_hora.map((h) => (
                  <li key={h.hora} className="flex items-center gap-3 text-xs">
                    <span className="w-12 text-right tabular-nums text-slate-500">{String(h.hora).padStart(2, '0')}:00</span>
                    <span className="h-3 flex-1 rounded bg-slate-100" aria-hidden="true"><span className="block h-3 rounded bg-brand-500" style={{ width: `${(h.cuentas / maxHora) * 100}%` }} /></span>
                    <span className="w-8 tabular-nums text-slate-700">{h.cuentas}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default Ocupacion;
