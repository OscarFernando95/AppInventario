import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fechaISOLocal, sumarDiasISO, diasDeSemana, agruparPorDia, etiquetaDia, tituloDia, tituloSemana, horaCorta } from '../../utils/calendarioReservas';

const ESTADOS = { SENTADA: 'Sentada', CANCELADA: 'Cancelada', NO_LLEGO: 'No llegó' };

/**
 * Navegación del calendario de reservas: día anterior / siguiente / «Hoy», selector de fecha y el cambio entre «Día» y
 * «Semana». Solo se pinta con la opción «Calendario de reservas» encendida.
 */
export const BarraCalendario = ({ dia, vista, onDia, onVista }) => {
  const paso = vista === 'semana' ? 7 : 1;
  const [anterior, siguiente] = vista === 'semana' ? ['Ir a la semana anterior', 'Ir a la semana siguiente'] : ['Ir al día anterior', 'Ir al día siguiente'];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary px-2" aria-label={anterior} onClick={() => onDia(sumarDiasISO(dia, -paso))}><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
      <button type="button" className="btn-secondary text-sm" onClick={() => onDia(fechaISOLocal())}>Hoy</button>
      <button type="button" className="btn-secondary px-2" aria-label={siguiente} onClick={() => onDia(sumarDiasISO(dia, paso))}><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
      <input
        type="date" aria-label="Fecha de las reservas" className="input-field w-40 py-1.5" value={dia}
        onChange={(e) => e.target.value && onDia(e.target.value)}
      />
      <div role="radiogroup" aria-label="Vista de las reservas" className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm">
        {[['dia', 'Día'], ['semana', 'Semana']].map(([v, etiqueta]) => (
          <label key={v} className={`px-3 py-1 rounded-lg cursor-pointer focus-within:ring-2 focus-within:ring-brand-600 ${vista === v ? 'bg-brand-700 text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
            <input type="radio" className="sr-only" name="vista-reservas" checked={vista === v} onChange={() => onVista(v)} />
            {etiqueta}
          </label>
        ))}
      </div>
      <span className="text-sm font-semibold text-slate-700 capitalize">{vista === 'semana' ? tituloSemana(dia) : tituloDia(dia)}</span>
    </div>
  );
};

/** Una columna por día de la semana con sus reservas (hora y nombre); tocar un día lo abre en la vista «Día». */
export const VistaSemana = ({ dia, reservas, onElegirDia }) => {
  const hoy = fechaISOLocal();
  const grupos = agruparPorDia(reservas, diasDeSemana(dia));
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" role="list" aria-label="Reservas de la semana">
      {grupos.map(({ dia: d, reservas: lista }) => (
        <div key={d} role="listitem" aria-label={`Reservas del ${tituloDia(d)}`} className={`rounded-2xl border bg-white p-3 min-h-28 ${d === hoy ? 'border-brand-400 ring-1 ring-brand-200' : 'border-slate-200'}`}>
          <button type="button" className="w-full flex items-center justify-between gap-2 text-left mb-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label={`Ver el ${tituloDia(d)}`} onClick={() => onElegirDia(d)}>
            <span className={`text-sm font-bold capitalize ${d === hoy ? 'text-brand-800' : 'text-slate-800'}`}>{etiquetaDia(d)}</span>
            <span className="text-[11px] text-slate-500">{lista.length === 0 ? 'Sin reservas' : `${lista.length} ${lista.length === 1 ? 'reserva' : 'reservas'}`}</span>
          </button>
          <ul className="space-y-1.5">
            {lista.map((r) => (
              <li key={r.id} className={`rounded-lg bg-slate-50 px-2 py-1 text-xs ${r.estado !== 'PENDIENTE' ? 'opacity-60' : ''}`}>
                <span className="font-semibold text-slate-800">{horaCorta(r.fecha_hora)} · {r.nombre}</span>
                <span className="block text-slate-500">{r.personas} {r.personas === 1 ? 'persona' : 'personas'}{r.mesa ? ` · ${r.mesa.nombre}` : ''}{r.estado !== 'PENDIENTE' ? ` · ${ESTADOS[r.estado]}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
