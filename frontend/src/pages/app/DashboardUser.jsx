import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Boxes, Package, ShoppingCart, TrendingUp, PlusCircle, ArrowRight, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

const DashboardUser = () => {
  const { user, activeEmpresa } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ prod: 0, comp: 0, vent: 0, ordMensuales: 0 });

  useEffect(() => {
    if(activeEmpresa?.id) {
      Promise.all([
        api.get('/productos'),
        api.get('/compras'),
        api.get('/ventas'),
        api.get('/pedidos')
      ]).then(([resP, resC, resV, resPed]) => {
        setStats({
          prod: resP.data.length,
          comp: resC.data.length,
          vent: resV.data.reduce((acc, curr) => acc + parseFloat(curr.total), 0).toFixed(2),
          ordMensuales: resPed.data.length
        });
      }).catch(console.error);
    }
  }, [activeEmpresa]);
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Placeholder UI con Rich Aesthetics */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1 tracking-wider uppercase">Productos</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{stats.prod}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center shadow-inner">
              <Boxes className="w-7 h-7 text-brand-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1 tracking-wider uppercase">Ventas Mes</p>
              <h3 className="text-3xl font-extrabold text-slate-800">${stats.vent}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-inner">
              <TrendingUp className="w-7 h-7 text-emerald-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1 tracking-wider uppercase">Compras Mes</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{stats.comp}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shadow-inner">
              <Package className="w-7 h-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1 tracking-wider uppercase">Órdenes</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{stats.ordMensuales}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
              <ShoppingCart className="w-7 h-7 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.05)] overflow-hidden mt-10">
        <div className="p-10 bg-slate-800 text-white relative isolate">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500 rounded-full blur-[100px] opacity-30 -z-10 transform translate-x-1/2 -translate-y-1/2"></div>
          <h2 className="text-3xl font-black mb-2 tracking-tight">¡Hola, {user?.nombre}!</h2>
          <p className="text-slate-300 text-lg max-w-2xl leading-relaxed">
            Bienvenido a tu panel de control {activeEmpresa?.nombre ? `de ${activeEmpresa.nombre}` : ''}. Utiliza los accesos directos a continuación para agilizar tus operaciones diarias o explora el menú lateral para herramientas avanzadas.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-white">
          <button onClick={() => navigate('/app/ventas')} className="p-8 text-left hover:bg-slate-50 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><PlusCircle className="w-6 h-6"/></div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">Nueva Venta</h4>
            <p className="text-sm text-slate-500 mb-4 h-10">Crea una factura POS rápida y descuenta del inventario.</p>
            <span className="text-emerald-600 font-bold text-sm flex items-center gap-1">Iniciar <ArrowRight className="w-4 h-4"/></span>
          </button>
          
          <button onClick={() => navigate('/app/pedidos')} className="p-8 text-left hover:bg-slate-50 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><ClipboardList className="w-6 h-6"/></div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">Nuevo Pedido</h4>
            <p className="text-sm text-slate-500 mb-4 h-10">Solicita abastecimiento a tus proveedores vía PDF.</p>
            <span className="text-orange-600 font-bold text-sm flex items-center gap-1">Generar Orden <ArrowRight className="w-4 h-4"/></span>
          </button>

          <button onClick={() => navigate('/app/compras')} className="p-8 text-left hover:bg-slate-50 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Package className="w-6 h-6"/></div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">Ingresar Gasto</h4>
            <p className="text-sm text-slate-500 mb-4 h-10">Registra operaciones comerciales e insumos varios.</p>
            <span className="text-blue-600 font-bold text-sm flex items-center gap-1">Registrar <ArrowRight className="w-4 h-4"/></span>
          </button>

          <button onClick={() => navigate('/app/inventario')} className="p-8 text-left hover:bg-slate-50 transition-colors group">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Boxes className="w-6 h-6"/></div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">Ver Inventario</h4>
            <p className="text-sm text-slate-500 mb-4 h-10">Revisa tu stock actual, precios y edita productos.</p>
            <span className="text-brand-600 font-bold text-sm flex items-center gap-1">Explorar <ArrowRight className="w-4 h-4"/></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardUser;
