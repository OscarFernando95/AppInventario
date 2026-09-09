import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

/**
 * Combobox con búsqueda: muestra un dato legible, guarda un código por detrás.
 *
 * Props:
 *   - options:      [{ value, label, keywords? }]   (keywords: texto extra para buscar)
 *   - value:        código seleccionado (string) o ''
 *   - onChange:     (value) => void
 *   - placeholder, disabled, required, id
 *   - allowClear:   muestra una "x" para limpiar (default true)
 *   - maxVisible:   nº máx. de opciones renderizadas a la vez (default 200)
 *
 * Muestra TODAS las opciones al abrir; al teclear filtra por substring
 * (case/acento-insensible) sobre label + keywords.
 */

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Seleccionar…',
  disabled = false,
  required = false,
  id,
  allowClear = true,
  maxVisible = 200,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const reactId = useId();
  const listId = `${id || reactId}-listbox`;

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = norm(query);
    const base = !q
      ? options
      : options.filter((o) => norm(o.label).includes(q) || norm(o.keywords).includes(q));
    return base.slice(0, maxVisible);
  }, [options, query, maxVisible]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // activeIdx puede quedar fuera de rango si la lista se acortó al filtrar.
  const safeIdx = Math.min(activeIdx, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[safeIdx];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [safeIdx, open]);

  const openDropdown = () => {
    setOpen(true);
    setActiveIdx(0);
  };

  const setSearch = (texto) => {
    setQuery(texto);
    setActiveIdx(0);
    if (!open) setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const commit = (opt) => {
    onChange(opt ? String(opt.value) : '');
    close();
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      openDropdown();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(Math.min(safeIdx + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(Math.max(safeIdx - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[safeIdx]) commit(filtered[safeIdx]);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const inputValue = open ? query : selected?.label || '';

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          className="input-field pr-16"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[safeIdx] ? `${listId}-opt-${safeIdx}` : undefined}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          required={required && !value}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => !disabled && openDropdown()}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-slate-500">
          {allowClear && value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => commit(null)}
              className="hover:text-slate-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              aria-label="Limpiar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </div>
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-dropdown mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</li>
          ) : (
            filtered.map((o, idx) => {
              const isSel = String(o.value) === String(value);
              return (
                <li key={o.value} role="option" id={`${listId}-opt-${idx}`} aria-selected={isSel}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => commit(o)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      idx === safeIdx ? 'bg-brand-50 text-brand-800' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check className="w-4 h-4 shrink-0 text-brand-600" />}
                  </button>
                </li>
              );
            })
          )}
          {options.length > filtered.length && (
            <li className="px-3 py-1.5 text-xs text-slate-500">
              Mostrando {filtered.length} de {options.length}. Escribe para filtrar…
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
