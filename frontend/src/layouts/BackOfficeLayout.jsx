import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Building2, Users, LayoutDashboard, LogOut, Menu, X, ScrollText } from 'lucide-react';

const BackOfficeLayout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
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

  const navItems = [
    { name: 'Dashboard', path: '/backoffice', icon: LayoutDashboard },
    { name: 'Empresas', path: '/backoffice/empresas', icon: Building2 },
    { name: 'Usuarios', path: '/backoffice/usuarios', icon: Users },
    { name: 'Logs', path: '/backoffice/logs', icon: ScrollText },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {menuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-overlay lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 bg-dark-900 border-r border-dark-800 flex flex-col
                    fixed inset-y-0 left-0 z-modal transition-transform duration-300 lg:static lg:translate-x-0 lg:z-sticky
                    ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-20 flex items-center px-6 border-b border-dark-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-brand-600/10 blur-xl pointer-events-none" />
          <h1 className="text-xl font-bold tracking-wide text-white relative z-10">
            BackOffice<span className="text-brand-400">.</span>
          </h1>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
            className="ml-auto relative z-10 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-dark-800 transition-colors lg:hidden
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2" aria-label="Navegación de backoffice">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/backoffice' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 font-semibold shadow-[0_2px_10px_-4px_rgba(14,165,233,0.5)]'
                    : 'text-slate-300 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-300' : 'text-slate-400'}`} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-800">
          <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 rounded-xl mb-3 border border-dark-700">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-semibold text-sm shadow-inner">
              {user?.nombre?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.nombre}</p>
              <p className="text-xs text-brand-300 truncate font-medium tracking-wide">Súper Admin</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors text-sm font-medium
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center px-4 sm:px-8 z-sticky shadow-sm justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              className="btn-icon min-h-11 min-w-11 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-800 capitalize truncate">
              {location.pathname === '/backoffice' ? 'Dashboard' : location.pathname.split('/').pop()}
            </h2>
          </div>
          <div className="text-sm font-medium text-slate-500">v2.0.0</div>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-slate-50 relative">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default BackOfficeLayout;
