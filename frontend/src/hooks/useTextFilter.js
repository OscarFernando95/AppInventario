import { useMemo, useState } from 'react';

/**
 * Búsqueda de texto en memoria para los listados que ya traen todas sus filas
 * (Clientes, Proveedores, Servicios). Devuelve el término, el setter y la lista
 * filtrada por coincidencia (sin acentos ni mayúsculas) en los campos dados.
 *
 *   const { busqueda, setBusqueda, filtrados } = useTextFilter(clientes, ['nombre', 'documento']);
 */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export function useTextFilter(items, fields) {
  const [busqueda, setBusqueda] = useState('');
  const fieldsKey = fields.join('|'); // estable aunque el array llegue nuevo cada render

  const filtrados = useMemo(() => {
    const q = norm(busqueda.trim());
    if (!q) return items;
    const cols = fieldsKey.split('|');
    return items.filter((it) => cols.some((f) => norm(it[f]).includes(q)));
  }, [items, busqueda, fieldsKey]);

  return { busqueda, setBusqueda, filtrados };
}
