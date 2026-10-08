import { useMemo, useState } from 'react';
import { Search, Briefcase, Box, ChefHat } from 'lucide-react';
import { formatCOP } from '../../utils/format';
import SearchInput from '../ui/SearchInput';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Catálogo para pedir: platos y productos de venta (más servicios si la empresa los tiene), con búsqueda.
 * Lo agotado se ve pero no se puede pedir.
 */
const ProductPicker = ({ productos, servicios, onElegir, deshabilitado }) => {
  const [busqueda, setBusqueda] = useState('');

  const opciones = useMemo(() => {
    const platos = productos
      .filter((p) => p.tipo === 'RECETA' || p.tipo === 'VENTA')
      .map((p) => ({
        clave: `p${p.id}`, tipo: p.tipo, nombre: p.nombre_producto, codigo: p.codigo, precio: Number(p.precio_unitario),
        agotado: Number(p.disponible ?? p.stock_actual) <= 0, producto: p,
      }));
    const servs = servicios.map((s) => ({ clave: `s${s.id}`, tipo: 'SERVICIO', nombre: s.nombre, codigo: '', precio: Number(s.precio), agotado: false, servicio: s }));
    return [...platos, ...servs].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [productos, servicios]);

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    return q ? opciones.filter((o) => norm(`${o.nombre} ${o.codigo}`).includes(q)) : opciones;
  }, [opciones, busqueda]);

  const Icono = { RECETA: ChefHat, VENTA: Box, SERVICIO: Briefcase };

  return (
    <div className="space-y-3">
      <SearchInput placeholder="Buscar plato, bebida o código…" value={busqueda} onChange={setBusqueda} className="w-full" />
      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500"><Search className="w-6 h-6 mx-auto mb-2 text-slate-300" aria-hidden="true" />Nada coincide con «{busqueda}».</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {visibles.map((o) => {
            const I = Icono[o.tipo];
            return (
              <button
                key={o.clave} type="button" disabled={deshabilitado || o.agotado}
                onClick={() => onElegir(o)} aria-label={`Agregar ${o.nombre}`}
                className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-400 hover:bg-brand-50/40 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <span className="flex items-start gap-2 text-sm font-semibold text-slate-800 leading-snug"><I className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" aria-hidden="true" />{o.nombre}</span>
                <span className="block mt-1 text-sm font-bold text-brand-800">{formatCOP(o.precio)}</span>
                {o.agotado && <span className="block text-[11px] font-semibold text-red-700">Agotado</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductPicker;
