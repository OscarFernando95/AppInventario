import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Briefcase, Box, ChefHat, Ban, RotateCcw } from 'lucide-react';
import api from '../../api/axios';
import { formatCOP } from '../../utils/format';
import { ordenarProductos, categoriasConProductos, deCategoria, precioVigente, tieneOferta } from '../../utils/menu';
import { useMenu } from '../../hooks/useMenu';
import SearchInput from '../ui/SearchInput';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Catálogo para pedir: platos y productos de venta (más servicios si la empresa los tiene), con búsqueda.
 * Con las opciones de menú encendidas suma categorías con su orden, fotos, el marcado de «agotado por hoy» a mano y el
 * precio de horario (happy hour). Lo agotado se ve pero no se puede pedir. Apagadas, queda como siempre.
 */
const ProductPicker = ({ productos, servicios, onElegir, deshabilitado }) => {
  const qc = useQueryClient();
  const menu = useMenu();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState(undefined); // undefined = todas

  const agotar = useMutation({
    mutationFn: ({ id, agotado }) => api.post(`/menu/agotado/${id}`, { agotado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] }),
  });

  const vendibles = useMemo(() => {
    // Un combo solo se ofrece con la opción de combos encendida.
    const lista = productos.filter((p) => ['RECETA', 'VENTA'].includes(p.tipo) || (p.tipo === 'COMBO' && menu.conCombos));
    return menu.conCategorias ? ordenarProductos(lista, menu.categorias) : lista;
  }, [productos, menu.conCategorias, menu.categorias, menu.conCombos]);

  const chips = useMemo(() => (menu.conCategorias ? categoriasConProductos(vendibles, menu.categorias) : []), [vendibles, menu.conCategorias, menu.categorias]);
  const hayChips = chips.length > 1;
  const categoriaActiva = hayChips && chips.some((c) => c.id === categoria) ? categoria : undefined;

  const opciones = useMemo(() => {
    const platos = deCategoria(vendibles, categoriaActiva, menu.categorias).map((p) => ({
      clave: `p${p.id}`, tipo: p.tipo, nombre: p.nombre_producto, codigo: p.codigo, precio: precioVigente(p), lista: Number(p.precio_unitario), oferta: tieneOferta(p) ? p.promo_nombre : null,
      agotado: Number(p.disponible ?? p.stock_actual) <= 0, agotadoHoy: !!p.agotado_hoy, imagen: menu.conFotos && p.tiene_imagen ? menu.imagenes[p.id] : null, producto: p,
    }));
    // Los servicios no tienen categoría: solo aparecen en «todas».
    const servs = categoriaActiva === undefined
      ? servicios.map((s) => ({ clave: `s${s.id}`, tipo: 'SERVICIO', nombre: s.nombre, codigo: '', precio: Number(s.precio), lista: Number(s.precio), agotado: false, servicio: s }))
      : [];
    const todos = [...platos, ...servs];
    // Con categorías el orden ya es el del menú; sin ellas, alfabético como siempre.
    return menu.conCategorias ? todos : todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [vendibles, servicios, categoriaActiva, menu]);

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    return q ? opciones.filter((o) => norm(`${o.nombre} ${o.codigo}`).includes(q)) : opciones;
  }, [opciones, busqueda]);

  const Icono = { RECETA: ChefHat, VENTA: Box, COMBO: ChefHat, SERVICIO: Briefcase };

  return (
    <div className="space-y-3">
      <SearchInput placeholder="Buscar plato, bebida o código…" value={busqueda} onChange={setBusqueda} className="w-full" />
      {hayChips && (
        <div role="tablist" aria-label="Categorías" className="flex gap-1.5 overflow-x-auto pb-1">
          {[{ id: undefined, nombre: 'Todo', n: vendibles.length }, ...chips].map((c) => (
            <button
              key={String(c.id)} type="button" role="tab" aria-selected={categoriaActiva === c.id} onClick={() => setCategoria(c.id)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold min-h-10 ${categoriaActiva === c.id ? 'bg-brand-700 text-white border-brand-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500"><Search className="w-6 h-6 mx-auto mb-2 text-slate-300" aria-hidden="true" />Nada coincide con «{busqueda}».</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {visibles.map((o) => {
            const I = Icono[o.tipo] || Box;
            const sinStock = o.agotado || o.agotadoHoy;
            return (
              <div key={o.clave} className="relative">
                <button
                  type="button" disabled={deshabilitado || sinStock}
                  onClick={() => onElegir(o)} aria-label={`Agregar ${o.nombre}`}
                  className="w-full h-full text-left rounded-xl border border-slate-200 bg-white p-3 min-h-24 hover:border-brand-400 hover:bg-brand-50/40 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {o.imagen && <img src={o.imagen} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />}
                  <span className="flex items-start gap-2 text-sm font-semibold text-slate-800 leading-snug pr-7"><I className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" aria-hidden="true" />{o.nombre}</span>
                  <span className="block mt-1 text-sm font-bold text-brand-800">
                    {formatCOP(o.precio)}
                    {o.oferta && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{formatCOP(o.lista)}</span>}
                  </span>
                  {o.oferta && <span className="block text-[11px] font-semibold text-amber-700">{o.oferta}</span>}
                  {sinStock && <span className="block text-[11px] font-semibold text-red-700">{o.agotadoHoy ? 'Agotado por hoy' : 'Agotado'}</span>}
                </button>
                {menu.conAgotados && o.producto && (
                  <button
                    type="button" disabled={agotar.isPending}
                    aria-label={o.agotadoHoy ? `Volver a habilitar ${o.nombre}` : `Marcar ${o.nombre} como agotado por hoy`}
                    title={o.agotadoHoy ? 'Volver a habilitar' : 'Agotado por hoy'}
                    onClick={() => agotar.mutate({ id: o.producto.id, agotado: !o.agotadoHoy })}
                    className="absolute top-1.5 right-1.5 rounded-lg bg-white/90 border border-slate-200 p-1.5 text-slate-500 hover:text-red-700 hover:border-red-300"
                  >
                    {o.agotadoHoy ? <RotateCcw className="w-4 h-4" aria-hidden="true" /> : <Ban className="w-4 h-4" aria-hidden="true" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductPicker;
