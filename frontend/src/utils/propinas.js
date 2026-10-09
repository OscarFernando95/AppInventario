/**
 * Reparto de propinas según el peso de cada persona (lógica pura).
 * `personas` = [{ id, peso, trabajo_hoy }]. Peso 0 no recibe. Con `soloActivos` solo reparte a quienes
 * trabajaron hoy. Los centavos que sobran por el redondeo se los lleva el último.
 * Devuelve [{ usuarioId, monto }].
 */
export function repartirPorPesos(personas, monto, { soloActivos = false } = {}) {
  const total = Math.round(Number(monto) * 100);
  const elegibles = personas.filter((p) => Number(p.peso) > 0 && (!soloActivos || p.trabajo_hoy));
  const sumaPesos = elegibles.reduce((a, p) => a + Number(p.peso), 0);
  if (!(total > 0) || elegibles.length === 0 || !(sumaPesos > 0)) return [];

  let asignado = 0;
  return elegibles.map((p, i) => {
    const centavos = i === elegibles.length - 1 ? total - asignado : Math.floor((total * Number(p.peso)) / sumaPesos);
    asignado += centavos;
    return { usuarioId: p.id, monto: centavos / 100 };
  });
}
