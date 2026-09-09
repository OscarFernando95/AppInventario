import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Package, ShoppingCart, Truck, FileText, Settings, LogOut, LayoutDashboard, Boxes, Users, Briefcase, ClipboardList, Menu, X } from 'lucide-react';

const FrontLayout = () => {
  const { user, activeEmpresa, setActiveEmpresa, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);


  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEmpresaChange = (e) => {
    const eId = parseInt(e.target.value, 10);
    const emp = user.empresas.find((x) => x.id === eId);
    if (!emp) return;
    setActiveEmpresa(emp);
    // Antes esto hacía window.location.href='/app', que recargaba la página
    // entera y tiraba la caché de TanStack Query. La queryKey ya incluye el id
    // de empresa (useEmpresaQuery), así que basta con navegar.
    queryClient.removeQueries({ queryKey: ['empresa'] });
    navigate('/app');
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

  const menu = baseMenu.filter(
    (item) => item.name === 'Dashboard' || (activeEmpresa?.modulos || []).includes(item.name)
  );

  if (user?.rol === 'FRONT_ADMIN') {
    menu.push({ name: 'Administración', path: '/app/admin', icon: Settings });
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Scrim del drawer en móvil. A partir de lg el sidebar es fijo. */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-overlay lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 bg-white border-r border-slate-200 flex flex-col shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)]
                    fixed inset-y-0 left-0 z-modal transition-transform duration-300 lg:static lg:translate-x-0 lg:z-sticky
                    ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-700 flex items-center justify-center mr-3 shadow-md shadow-brand-700/20">
            <Boxes className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          {user?.empresas?.length > 1 ? (
            <div className="relative w-full overflow-hidden flex items-center pr-2">
              <label htmlFor="empresa-activa" className="sr-only">Empresa activa</label>
              <select
                id="empresa-activa"
                className="text-lg font-semibold text-slate-800 bg-transparent border-0 w-full cursor-pointer appearance-none truncate pr-4 rounded-lg
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
                value={activeEmpresa?.id || ''}
                onChange={handleEmpresaChange}
              >
                {user.empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          ) : (
            <h1 className="text-xl font-semibold text-slate-800 truncate pr-2">
              {activeEmpresa?.nombre || 'MiEmpresa'}<span className="text-brand-600">.</span>
            </h1>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
            className="btn-icon ml-auto lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1" aria-label="Navegación principal">
          {menu.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/app' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  isActive
                    ? 'bg-brand-50 text-brand-800 font-semibold shadow-sm border border-brand-100/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-700' : 'text-slate-500'}`} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex flex-col mb-4 px-2">
            <span className="text-sm font-semibold text-slate-800 truncate">{user?.nombre}</span>
            <span className="text-xs font-medium text-brand-700 tracking-wide mt-0.5">
              {user?.rol === 'FRONT_ADMIN' ? 'ADMINISTRADOR' : 'USUARIO'}
            </span>
          </div>
          <Link
            to="/cambiar-password"
            className="btn-secondary w-full mb-2 gap-2 rounded-xl text-xs"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" /> Cambiar contraseña
          </Link>
          <button
            onClick={handleLogout}
            className="btn-secondary w-full gap-2 rounded-xl hover:bg-red-50 hover:text-red-700 hover:border-red-200"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" /> Salir de la App
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        <header className="h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center px-4 sm:px-8 sticky top-0 z-sticky justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              className="btn-icon lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 capitalize truncate">
              {location.pathname === '/app' ? 'Resumen General' : location.pathname.split('/').pop()}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 shrink-0 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center font-semibold shadow-sm"
              title={user?.nombre}
            >
              {user?.nombre?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 relative isolate bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default FrontLayout;
