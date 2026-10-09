import { formatCOP } from '../utils/format';
import { ofertaDeModificadores } from '../utils/grupos';

const Opcion = ({ m, tipo, nombre, marcado, onCambiar }) => (
  <li>
    <label className={`flex items-center gap-3 rounded-xl border p-3 min-h-12 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-brand-600 ${marcado ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
      <input
        type={tipo} name={nombre} className="w-4 h-4 text-brand-700 border-slate-300 focus:ring-brand-600" checked={marcado} onChange={() => onCambiar(m)}
      />
      <span className="flex-1 text-sm font-medium text-slate-800">{m.nombre}</span>
      <span className="text-xs font-semibold text-slate-600">{Number(m.precio_extra) > 0 ? `+${formatCOP(m.precio_extra)}` : 'Sin costo'}</span>
    </label>
  </li>
);

/**
 * Elegir los modificadores de un plato. Con grupos activados (`grupos` con algo) los muestra agrupados —uno solo si el
 * grupo admite un máximo de 1, varios si no— marcando los obligatorios, más los extras sueltos. Sin grupos, es la lista
 * de siempre. `valor` = ids elegidos; `onChange(nuevosIds)`.
 */
const SelectorModificadores = ({ plato, modificadores, grupos = [], valor, onChange }) => {
  const oferta = grupos.length > 0 ? ofertaDeModificadores(plato, modificadores, grupos) : { grupos: [], sueltos: modificadores };
  const alternar = (m) => onChange(valor.includes(m.id) ? valor.filter((id) => id !== m.id) : [...valor, m.id]);
  // En un grupo de elección única, marcar uno desmarca el otro de ese grupo.
  const elegirUnico = (grupo, m) => onChange([...valor.filter((id) => !modificadores.some((x) => x.id === id && x.grupoId === grupo.id)), m.id]);

  return (
    <div className="space-y-4">
      {oferta.grupos.map(({ grupo, mods }) => {
        const unico = grupo.max_selecciones === 1;
        return (
          <fieldset key={grupo.id} className="space-y-2">
            <legend className="text-sm font-semibold text-slate-700 mb-1">
              {grupo.nombre}
              {grupo.obligatorio && <span className="ml-2 text-[11px] font-semibold uppercase text-red-700">Obligatorio</span>}
              {!unico && grupo.max_selecciones != null && <span className="ml-2 text-xs font-normal text-slate-500">hasta {grupo.max_selecciones}</span>}
            </legend>
            <ul className="space-y-2">
              {mods.map((m) => (
                <Opcion
                  key={m.id} m={m} tipo={unico ? 'radio' : 'checkbox'} nombre={`grupo-${grupo.id}`} marcado={valor.includes(m.id)}
                  onCambiar={unico ? () => elegirUnico(grupo, m) : alternar}
                />
              ))}
            </ul>
          </fieldset>
        );
      })}
      {oferta.sueltos.length > 0 && (
        <fieldset className="space-y-2">
          {oferta.grupos.length > 0 && <legend className="text-sm font-semibold text-slate-700 mb-1">Extras</legend>}
          <ul className="space-y-2">
            {oferta.sueltos.map((m) => <Opcion key={m.id} m={m} tipo="checkbox" nombre={`extra-${m.id}`} marcado={valor.includes(m.id)} onCambiar={alternar} />)}
          </ul>
        </fieldset>
      )}
    </div>
  );
};

export default SelectorModificadores;
