import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Building2, Users, LayoutDashboard, LogOut } from 'lucide-react';

const BackOfficeLayout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/backoffice', icon: LayoutDashboard },
    { name: 'Empresas', path: '/backoffice/empresas', icon: Building2 },
    { name: 'Usuarios', path: '/backoffice/usuarios', icon: Users },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      <aside className="w-64 bg-dark-900 border-r border-dark-800 flex flex-col transition-all">
        <div className="h-20 flex items-center px-6 border-b border-dark-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-brand-600/10 blur-xl pointer-events-none" />
          <h1 className="text-xl font-black tracking-wide text-white relative z-10">BackOffice<span className="text-brand-500">.</span></h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/backoffice' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-brand-600/20 text-brand-400 font-semibold shadow-[0_2px_10px_-4px_rgba(14,165,233,0.5)]' 
                    : 'text-slate-400 hover:bg-dark-800 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-dark-800">
          <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 rounded-xl mb-3 border border-dark-700">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm shadow-inner">
              {user?.nombre?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.nombre}</p>
              <p className="text-xs text-brand-300 truncate font-medium tracking-wide">Súper Admin</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center px-8 z-10 shadow-sm justify-between">
          <h2 className="text-xl font-bold text-slate-800 capitalize">
            {location.pathname === '/backoffice' ? 'Dashboard' : location.pathname.split('/').pop()}
          </h2>
          <div className="text-sm font-medium text-slate-500">v1.0.0</div>
        </header>
        <div className="flex-1 overflow-auto p-8 bg-slate-50 relative">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default BackOfficeLayout;
