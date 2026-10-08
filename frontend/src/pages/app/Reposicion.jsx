import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageCheck, PackagePlus, AlertTriangle, ShoppingCart } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { unidadCorta, etiquetaPresentacion } from '../../utils/unidades';
import { useAuthStore } from '../../store/authStore';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import PageHeader from '../../components/ui/PageHeader';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const TIPOS = { VENTA: 'Producto', INSUMO: 'Insumo', PREPARACION: 'Preparación', RECETA: 'Plato' };
const TONO_ESTADO = { AGOTADO: 'bg-red-100 text-red-800', BAJO: 'bg-amber-100 text-amber-800' };

const Stat = ({ label, value, tone }) => (
  <div className="card-container p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
  </div>
);

/** Unidad con que se muestra lo "disponible" de cada tipo de producto. */
const unidadDisponible = (a) => (a.tipo === 'RECETA' ? 'porciones' : unidadCorta(a.unidad_medida));

/** Línea del carrito de Pedidos a partir de una sugerencia (en la presentación de compra si la hay). */
function lineaDePedido(s) {
  const costoBase = s.sugerido_base > 0 ? s.costo_estimado / s.sugerido_base : 0;
  if (s.pedido) {
    const factor = s.pedido.cantidad_base / s.pedido.cantidad;
    return {
      productoId: s.productoId, nombre: s.nombre_producto, cantidad_pedida: s.pedido.cantidad,
      costo_estimado: Math.round(costoBase * factor * 100) / 100,
      factor, etiquetaPres: etiquetaPresentacion(s.pedido.unidad), etiquetaBase: unidadCorta(s.unidad_medida), enPresentacion: true,
    };
  }
  return {
    productoId: s.productoId, nombre: s.nombre_producto, cantidad_pedida: s.sugerido_base, costo_estimado: Math.round(costoBase * 10000) / 10000,
    factor: null, etiquetaPres: null, etiquetaBase: unidadCorta(s.unidad_medida), enPresentacion: false,
  };
}

const Reposicion = () => {
  const navigate = useNavigate();
  const modulos = useAuthStore((st) => st.activeEmpresa?.modulos) || [];
  const { data, isLoading, isError, error, refetch } = useEmpresaQuery(['reposicion'], '/reposicion');
  const alertas = data?.alertas || [];
  const sugerencias = useMemo(() => data?.sugerencias || [], [data]);
  const [excluidos, setExcluidos] = useState(() => new Set()); // sugerencias que NO se piden

  const elegidas = useMemo(() => sugerencias.filter((s) => !excluidos.has(s.productoId)), [sugerencias, excluidos]);
  const costoTotal = elegidas.reduce((a, s) => a + s.costo_estimado, 0);
  const toggle = (id) => setExcluidos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Reposición"
        description="Productos, insumos, platos y preparaciones que llegaron a su stock mínimo, y qué pedir para reponerlos."
        action={modulos.includes('Pedidos') && (
          <button
            className="btn-primary gap-2" disabled={elegidas.length === 0}
            onClick={() => navigate('/app/pedidos', { state: { reposicion: elegidas.map(lineaDePedido) } })}
          >
            <ShoppingCart className="w-5 h-5" aria-hidden="true" /> Crear pedido con lo seleccionado
          </button>
        )}
      />

      <div className="grid grid-cols-2 gap-4 max-w-xl">
        <Stat label="Agotados" value={data?.resumen?.agotados ?? 0} tone="text-red-700" />
        <Stat label="En o bajo su mínimo" value={data?.resumen?.bajos ?? 0} tone="text-amber-700" />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" /> Alertas</h3>
        <p className="text-sm text-slate-500 mb-3">
          Solo avisan los productos con un mínimo configurado (en Inventario → editar). En un plato el mínimo son porciones; en una preparación, unidades producibles.
        </p>
        <TableCard>
          <THead>
            <Th>Producto</Th>
            <Th align="right">Disponible</Th>
            <Th align="right">Mínimo</Th>
            <Th align="center">Estado</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={4} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
              isEmpty={alertas.length === 0} emptyIcon={PackageCheck}
              emptyTitle="Todo en orden" emptyHint="Ningún producto con mínimo configurado está en o bajo su mínimo."
            />
            {alertas.map((a) => (
              <Tr key={a.productoId}>
                <Td className="font-medium text-slate-800">
                  {a.nombre_producto}
                  <span className="ml-2 text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{TIPOS[a.tipo]}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">{formatCantidad(a.disponible)} {unidadDisponible(a)}</Td>
                <Td align="right" className="whitespace-nowrap text-slate-600">{formatCantidad(a.stock_minimo)} {unidadDisponible(a)}</Td>
                <Td align="center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${TONO_ESTADO[a.estado]}`}>{a.estado === 'AGOTADO' ? 'AGOTADO' : 'BAJO'}</span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2"><PackagePlus className="w-5 h-5 text-brand-700" aria-hidden="true" /> Qué pedir</h3>
        <p className="text-sm text-slate-500 mb-3">
          Se repone hasta el objetivo de cada producto. Un plato o preparación no se compra: se piden sus ingredientes.
          {!modulos.includes('Pedidos') && ' Habilita el módulo Pedidos para crear la orden desde aquí.'}
        </p>
        <TableCard>
          <THead>
            <Th align="center" className="w-10">Pedir</Th>
            <Th>Producto</Th>
            <Th align="right">Stock actual</Th>
            <Th align="right">Pedir</Th>
            <Th>Por qué</Th>
            <Th align="right">Costo estimado</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={6} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
              isEmpty={sugerencias.length === 0} emptyIcon={PackageCheck}
              emptyTitle="Nada que pedir por ahora" emptyHint="Cuando algo llegue a su mínimo, aparecerá aquí con la cantidad sugerida."
            />
            {sugerencias.map((s) => (
              <Tr key={s.productoId}>
                <Td align="center">
                  <input
                    type="checkbox" aria-label={`Pedir ${s.nombre_producto}`} checked={!excluidos.has(s.productoId)} onChange={() => toggle(s.productoId)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                  />
                </Td>
                <Td className="font-medium text-slate-800">
                  {s.nombre_producto}
                  <span className="ml-2 text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{TIPOS[s.tipo]}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">{formatCantidad(s.stock_actual)} {unidadCorta(s.unidad_medida)}</Td>
                <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">
                  {s.pedido
                    ? <>{formatCantidad(s.pedido.cantidad)} {etiquetaPresentacion(s.pedido.unidad)}<span className="block text-xs font-normal text-slate-500">= {formatCantidad(s.pedido.cantidad_base)} {unidadCorta(s.unidad_medida)}</span></>
                    : `${formatCantidad(s.sugerido_base)} ${unidadCorta(s.unidad_medida)}`}
                </Td>
                <Td className="text-sm text-slate-600">
                  {s.motivo === 'MINIMO' ? 'Llegó a su mínimo' : 'Lo necesitan platos o preparaciones bajos'}
                  {s.para.length > 0 && <span className="block text-xs text-slate-500">Para: {s.para.join(', ')}</span>}
                </Td>
                <Td align="right" className="whitespace-nowrap">{s.costo_estimado > 0 ? formatCOP(s.costo_estimado) : <span className="text-slate-400">Sin costo</span>}</Td>
              </Tr>
            ))}
          </tbody>
          {elegidas.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={5} className="px-6 py-3 text-right text-sm text-slate-600">Total estimado de lo seleccionado ({elegidas.length})</td>
                <td className="px-6 py-3 text-right text-slate-800 whitespace-nowrap">{formatCOP(costoTotal)}</td>
              </tr>
            </tfoot>
          )}
        </TableCard>
      </div>
    </div>
  );
};

export default Reposicion;
