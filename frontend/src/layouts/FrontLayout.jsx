import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Package, ShoppingCart, Truck, FileText, Settings, LogOut, LayoutDashboard, Boxes, Users, Briefcase, ClipboardList } from 'lucide-react';


const FrontLayout = () => {
  const { user, activeEmpresa, setActiveEmpresa, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const baseMenu = [
    { name: 'Dashboard', path: '/app', icon: LayoutDashboard },
    { name: 'Inventario', path: '/app/inventario', icon: Boxes },
    { name: 'Proveedores', path: '/app/proveedores', icon: Truck },
    { name: 'Clientes', path: '/app/clientes', icon: Users },
    { name: 'Servicios', path: '/app/servicios', icon: Briefcase },
    { name: 'Pedidos', path: '/app/pedidos', icon: ClipboardList },
    { name: 'Compras', path: '/app/compras', icon: Package },
    { name: 'Ventas', path: '/app/ventas', icon: ShoppingCart },
    { name: 'Informes', path: '/app/informes', icon: FileText },
  ];

  let menu = baseMenu.filter(item => 
    item.name === 'Dashboard' || (activeEmpresa?.modulos || []).includes(item.name)
  );

  if (user?.rol === 'FRONT_ADMIN') {
    menu.push({ name: 'Administración', path: '/app/admin', icon: Settings });
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)] z-30">
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center mr-3 shadow-md shadow-brand-500/20">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          {user?.empresas?.length > 1 ? (
            <div className="relative w-full overflow-hidden flex items-center pr-2">
              <select 
                 className="text-lg font-bold text-slate-800 bg-transparent border-0 outline-none w-full cursor-pointer appearance-none truncate pr-4"
                 value={activeEmpresa?.id || ''}
                 onChange={(e) => {
                   const eId = parseInt(e.target.value);
                   const emp = user.empresas.find(x => x.id === eId);
                   if(emp) { setActiveEmpresa(emp); window.location.href='/app'; }
                 }}
              >
                 {user.empresas.map(emp => (
                   <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                 ))}
              </select>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-bold text-slate-800 truncate pr-2">{activeEmpresa?.nombre || 'MiEmpresa'}<span className="text-brand-500">.</span></h1>
          )}
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {menu.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/app' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-brand-50 text-brand-700 font-bold shadow-sm border border-brand-100/50' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex flex-col mb-4 px-2">
            <span className="text-sm font-bold text-slate-800 truncate">{user?.nombre}</span>
            <span className="text-xs font-semibold text-brand-600 tracking-wide mt-0.5">{user?.rol === 'FRONT_ADMIN' ? 'ADMINISTRADOR' : 'USUARIO'}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all text-sm font-bold shadow-sm"
          >
            <LogOut className="w-4 h-4" /> Salir de la App
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center px-8 sticky top-0 z-20 justify-between">
          <h2 className="text-2xl font-bold text-slate-800 capitalize">
            {location.pathname === '/app' ? 'Resumen General' : location.pathname.split('/').pop()}
          </h2>
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold shadow-sm cursor-pointer hover:bg-brand-200 transition-colors">
               {user?.nombre?.charAt(0).toUpperCase()}
             </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8 relative isolate bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default FrontLayout;
