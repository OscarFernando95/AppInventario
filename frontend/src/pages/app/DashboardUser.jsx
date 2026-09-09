import { Boxes, Package, ShoppingCart, TrendingUp, PlusCircle, ArrowRight, ClipboardList, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import api from '../../api/axios';
import { formatCOP } from '../../utils/format';

/**
 * Tarjeta de KPI.
 *
 * Durante la carga muestra un skeleton, no un cero: antes el dashboard hacía
 * `dash?.totalProductos ?? 0` y pintaba "Ventas Mes: $0" mientras la petición
 * estaba en vuelo. Un skeleton se ignora; un cero se cree, y en una pantalla
 * cuya única función es reportar magnitudes eso es dar un dato falso.
 */
const StatCard = ({ label, value, icon, tone, isLoading, isError }) => {
  const Icon = icon;
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 mb-2 tracking-wider uppercase">{label}</p>
          {isLoading ? (
            <div className="h-9 w-28 bg-slate-100 rounded-lg animate-pulse" role="status" aria-label={`Cargando ${label}`} />
          ) : isError ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500 h-9">
              <AlertTriangle className="w-4 h-4 text-red-600" aria-hidden="true" /> Sin datos
            </span>
          ) : (
            <h3 className="text-4xl font-bold text-slate-900 tabular-nums truncate">{value}</h3>
          )}
        </div>
        <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${tone}`}>
          <Icon className="w-7 h-7" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

const ACCESOS = [
  {
    path: '/app/ventas', icon: PlusCircle, title: 'Nueva Venta', cta: 'Iniciar',
    text: 'Crea una factura POS rápida y descuenta del inventario.',
    tone: 'bg-emerald-100 text-emerald-800', link: 'text-emerald-800',
  },
  {
    path: '/app/pedidos', icon: ClipboardList, title: 'Nuevo Pedido', cta: 'Generar Orden',
    text: 'Solicita abastecimiento a tus proveedores vía PDF.',
    tone: 'bg-amber-100 text-amber-800', link: 'text-amber-800',
  },
  {
    path: '/app/compras', icon: Package, title: 'Ingresar Gasto', cta: 'Registrar',
    text: 'Registra operaciones comerciales e insumos varios.',
    tone: 'bg-brand-100 text-brand-800', link: 'text-brand-800',
  },
  {
    path: '/app/inventario', icon: Boxes, title: 'Ver Inventario', cta: 'Explorar',
    text: 'Revisa tu stock actual, precios y edita productos.',
    tone: 'bg-slate-100 text-slate-700', link: 'text-slate-700',
  },
];

const DashboardUser = () => {
  const { user, activeEmpresa } = useAuthStore();
  const navigate = useNavigate();

  // Endpoint agregado y cacheado en el backend (1 consulta en vez de 4).
  const { data: dash, isLoading, isError } = useEmpresaQuery(['dashboard'], '/reportes/dashboard');

  // Total de pedidos: solo si la empresa tiene el módulo (evita un 403).
  const tienePedidos = (activeEmpresa?.modulos || []).includes('Pedidos');
  const {
    data: totalPedidos,
    isLoading: loadingPedidos,
    isError: errorPedidos,
  } = useEmpresaQuery(
    ['pedidos', 'count'],
    async () => {
      const res = await api.get('/pedidos', { params: { limit: 1 } });
      return Number(res.headers['x-total-count'] || 0);
    },
    { enabled: tienePedidos }
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* El saludo va en una línea de texto normal. Antes era un bloque
          bg-slate-800 con p-10 y text-3xl font-black: el elemento de mayor
          contraste de la pantalla principal, y con cero información. */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
          Hola, {user?.nombre}
        </h2>
        <p className="text-slate-500 mt-1">
          {activeEmpresa?.nombre ? `Resumen de ${activeEmpresa.nombre}.` : 'Resumen de tu operación.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          label="Productos" icon={Boxes} tone="bg-brand-50 text-brand-700"
          value={dash?.totalProductos ?? 0} isLoading={isLoading} isError={isError}
        />
        <StatCard
          label="Ventas Mes" icon={TrendingUp} tone="bg-emerald-50 text-emerald-700"
          value={formatCOP(dash?.ventasMes)} isLoading={isLoading} isError={isError}
        />
        <StatCard
          label="Compras Mes" icon={Package} tone="bg-slate-100 text-slate-700"
          value={formatCOP(dash?.comprasMes)} isLoading={isLoading} isError={isError}
        />
        <StatCard
          label="Pedidos" icon={ShoppingCart} tone="bg-amber-50 text-amber-700"
          value={tienePedidos ? (totalPedidos ?? 0) : '—'}
          isLoading={tienePedidos && loadingPedidos}
          isError={tienePedidos && errorPedidos}
        />
      </div>

      <div className="card-container">
        <h3 className="px-6 pt-6 pb-2 text-sm font-semibold text-slate-500 tracking-wider uppercase">
          Accesos directos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {ACCESOS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.path}
                onClick={() => navigate(a.path)}
                className="p-6 text-left hover:bg-slate-50 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${a.tone}`}>
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">{a.title}</h4>
                <p className="text-sm text-slate-500 mb-4 min-h-10">{a.text}</p>
                <span className={`font-medium text-sm flex items-center gap-1 ${a.link}`}>
                  {a.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardUser;
