import { useEffect, useState } from 'react';

/** "Ahora" que se refresca cada `ms` para pintar tiempos transcurridos («hace 12 min») sin recargar. */
export function useAhora(ms = 30_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return ahora;
}

/** «ahora», «12 min», «1 h 5 min» entre una fecha y `ahora`. */
export function hace(fecha, ahora) {
  const min = Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}
