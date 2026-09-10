import { useId } from 'react';
import { Search } from 'lucide-react';

/**
 * Campo de búsqueda con ícono y etiqueta asociada (htmlFor real). Se usa en la
 * FilterBar de los listados; no se apoya en <Field> porque este necesita que su
 * único hijo SEA el control, y aquí el input va envuelto para posicionar el ícono.
 */
const SearchInput = ({ label = 'Buscar', placeholder, value, onChange, className = 'w-full sm:w-64' }) => {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          id={id}
          type="search"
          className="input-field pl-9"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
};

export default SearchInput;
