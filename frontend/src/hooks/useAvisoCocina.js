import { useCallback, useRef, useState } from 'react';
import api from '../api/axios';
import { useEmpresaQuery } from './useEmpresaQuery';

const CLAVE_SILENCIO = 'mesas-silenciar-avisos';
const leerSilencio = () => { try { return localStorage.getItem(CLAVE_SILENCIO) === '1'; } catch { return false; } };

/** Dos pitidos cortos (sin archivos de audio). Si el navegador no deja reproducir, no pasa nada. */
export function sonar() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    const ctx = new Contexto();
    [0, 0.28].forEach((retraso) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gan.gain.setValueAtTime(0.0001, ctx.currentTime + retraso);
      gan.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + retraso + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + retraso + 0.22);
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + retraso);
      osc.stop(ctx.currentTime + retraso + 0.25);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch { /* sin audio disponible */ }
}

/** Comandas LISTAS por cuenta del tablero: Map(cuentaId -> { nombre, listas }). */
export function listasPorCuenta(tablero) {
  const mapa = new Map();
  const cuentas = [...(tablero?.mesas || []).map((m) => m.cuenta).filter(Boolean), ...(tablero?.sin_mesa || [])];
  for (const c of cuentas) mapa.set(c.id, { nombre: c.nombre, listas: Number(c.comandas_listas) || 0 });
  return mapa;
}

/** Cuentas cuya cantidad de comandas listas SUBIÓ respecto de la lectura anterior (cocina acaba de terminar algo). */
export function nuevasListas(previo, actual) {
  if (!previo) return [];
  const nuevas = [];
  for (const [id, { nombre, listas }] of actual) {
    if (listas > (previo.get(id)?.listas ?? 0)) nuevas.push({ id, nombre });
  }
  return nuevas;
}

/**
 * El tablero de mesas (se refresca solo cada 10 s) avisando, con un pitido y un aviso en pantalla, cuando cocina
 * marca una comanda como lista. El primer dato que llega no avisa (solo se toma como punto de partida).
 */
export function useMesasConAviso() {
  const previo = useRef(null);
  const [silenciado, setSilenciadoEstado] = useState(leerSilencio);
  const silenciadoRef = useRef(silenciado);
  const [avisos, setAvisos] = useState([]);

  const consulta = useEmpresaQuery(['mesas'], async () => {
    const data = (await api.get('/mesas')).data;
    const actual = listasPorCuenta(data);
    const nuevas = nuevasListas(previo.current, actual);
    previo.current = actual;
    if (nuevas.length > 0) {
      setAvisos((a) => [...a, ...nuevas.map((n) => ({ ...n, clave: `${n.id}-${Date.now()}` }))].slice(-5));
      if (!silenciadoRef.current) sonar();
    }
    return data;
  }, { refetchInterval: 10_000 });

  const setSilenciado = useCallback((v) => {
    silenciadoRef.current = v;
    setSilenciadoEstado(v);
    try { localStorage.setItem(CLAVE_SILENCIO, v ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }, []);
  const quitarAviso = useCallback((clave) => setAvisos((a) => a.filter((x) => x.clave !== clave)), []);

  return { ...consulta, avisos, quitarAviso, silenciado, setSilenciado };
}
