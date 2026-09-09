import { Loader2, AlertTriangle, RotateCw, Inbox } from 'lucide-react';
import { apiError } from '../../utils/apiError';

/**
 * Los tres estados de una lista: cargando, error y vacío.
 *
 * Antes las páginas hacían `const { data: x = [] } = useEmpresaQuery(…)` y solo
 * pintaban el caso vacío, así que un GET fallido y una tabla legítimamente
 * vacía se veían exactamente igual: "Ningún cliente registrado aún.". Son
 * afirmaciones distintas sobre el mundo — "no hay nada" invita a crear un
 * registro, "no pude saberlo" invita a reintentar — y no pueden compartir
 * presentación. El estado de carga tenía el mismo problema: el primer frame de
 * cada navegación era el mensaje de vacío.
 *
 * Devuelve null cuando hay datos que mostrar, así que se puede renderizar sin
 * condicionales en el call site.
 */
const StateBody = ({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyIcon = Inbox,
  emptyTitle,
  emptyHint,
}) => {
  const EmptyIcon = emptyIcon;
  if (isLoading) {
    return (
      <div className="py-12 text-center text-slate-500" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-slate-400" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center" role="alert">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-600" aria-hidden="true" />
        <p className="font-semibold text-slate-800">No se pudieron cargar los datos</p>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          {apiError(error, 'Revisa tu conexión e inténtalo de nuevo.')}
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-secondary mt-4 gap-2">
            <RotateCw className="w-4 h-4" aria-hidden="true" /> Reintentar
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="py-12 text-center">
        <EmptyIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" aria-hidden="true" />
        <p className="font-semibold text-slate-600">{emptyTitle}</p>
        {emptyHint && <p className="text-sm text-slate-500 mt-1">{emptyHint}</p>}
      </div>
    );
  }

  return null;
};

/** true si hay algo que mostrar en lugar de los datos. */
const hasState = ({ isLoading, isError, isEmpty }) => Boolean(isLoading || isError || isEmpty);

/** Para el <tbody> de una tabla. */
export const TableState = ({ colSpan, ...props }) => {
  if (!hasState(props)) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {/* La tabla puede ser más ancha que el viewport y desplazarse en
            horizontal; el bloque de estado se ancla al borde visible para que
            no quede recortado fuera de pantalla en móvil. */}
        <div className="sticky left-0 w-screen max-w-full">
          <StateBody {...props} />
        </div>
      </td>
    </tr>
  );
};

/** Para una grilla de tarjetas: ocupa el ancho completo dentro del grid. */
export const GridState = (props) => {
  if (!hasState(props)) return null;
  return (
    <div className="col-span-full card-container">
      <StateBody {...props} />
    </div>
  );
};

/** Suelto, fuera de tabla o grid. */
export const PanelState = (props) => {
  if (!hasState(props)) return null;
  return (
    <div className="card-container">
      <StateBody {...props} />
    </div>
  );
};

export default StateBody;
