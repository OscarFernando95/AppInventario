import { X } from 'lucide-react';

/**
 * Contenedor de la fila de filtros de un listado. Cada página compone sus
 * propios `<Field>` dentro; si `hayFiltros` es true muestra el botón "Limpiar".
 *
 *   <FilterBar hayFiltros={hayFiltros} onLimpiar={limpiar}>
 *     <Field label="Desde" className="w-full sm:w-44"><input type="date" .../></Field>
 *     ...
 *   </FilterBar>
 */
const FilterBar = ({ children, hayFiltros, onLimpiar }) => (
  <div className="card-container p-4">
    <div className="flex flex-wrap items-end gap-3">
      {children}
      {hayFiltros && (
        <button type="button" onClick={onLimpiar} className="btn-secondary gap-1.5 h-[42px]">
          <X className="w-4 h-4" aria-hidden="true" /> Limpiar
        </button>
      )}
    </div>
  </div>
);

export default FilterBar;
