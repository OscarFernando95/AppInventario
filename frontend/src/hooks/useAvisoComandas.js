import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { useEmpresaQuery } from './useEmpresaQuery';
import { sonar } from './useAvisoCocina';

const CLAVE_SILENCIO = 'cocina-silenciar-comandas';
const leerSilencio = () => { try { return localStorage.getItem(CLAVE_SILENCIO) === '1'; } catch { return false; } };

/** Ids de todas las comandas de una lectura (sirve de punto de partida para la siguiente). */
export const idsDeComandas = (comandas) => new Set((comandas || []).map((c) => c.id));

/**
 * Comandas PENDIENTES que no estaban en la lectura anterior. La primera lectura (previo = null) no avisa: solo es el
 * punto de partida. Una comanda que ya se conocía y vuelve a pendiente (la devolvieron desde «Lista») no cuenta como nueva.
 */
export function comandasNuevas(previo, comandas) {
  if (!previo) return [];
  return (comandas || []).filter((c) => c.estado === 'PENDIENTE' && !previo.has(c.id));
}

/**
 * Las comandas de cocina (se refrescan solas cada 7 s). Con `avisar` encendido, cuando entra una comanda pendiente nueva
 * suena un pitido y queda un aviso en pantalla; cada dispositivo puede silenciar el sonido. El primer dato que llega no avisa.
 * La detección ocurre dentro de la consulta (no en el render), así que no depende de efectos ni de leer refs al pintar.
 */
export function useComandasConAviso({ avisar }) {
  const previo = useRef(null);
  const avisarRef = useRef(avisar);
  const [silenciado, setSilenciadoEstado] = useState(leerSilencio);
  const silenciadoRef = useRef(silenciado);
  const [aviso, setAviso] = useState(null);

  useEffect(() => { avisarRef.current = avisar; }, [avisar]);
  // El aviso se quita solo a los pocos segundos.
  useEffect(() => {
    if (!aviso) return undefined;
    const id = setTimeout(() => setAviso(null), 8_000);
    return () => clearTimeout(id);
  }, [aviso]);

  const consulta = useEmpresaQuery(['comandas'], async () => {
    const data = (await api.get('/comandas')).data;
    const nuevas = comandasNuevas(previo.current, data);
    previo.current = idsDeComandas(data);
    if (nuevas.length > 0 && avisarRef.current) {
      setAviso({ clave: Date.now(), cuantas: nuevas.length, cuentas: [...new Set(nuevas.map((c) => c.cuenta))] });
      if (!silenciadoRef.current) sonar();
    }
    return data;
  }, { refetchInterval: 7_000 });

  const setSilenciado = useCallback((v) => {
    silenciadoRef.current = v;
    setSilenciadoEstado(v);
    try { localStorage.setItem(CLAVE_SILENCIO, v ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }, []);
  const quitarAviso = useCallback(() => setAviso(null), []);

  return { ...consulta, aviso, quitarAviso, silenciado, setSilenciado };
}
