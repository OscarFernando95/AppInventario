import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import LoginProvider from './pages/LoginProvider';
import CambiarPassword from './pages/CambiarPassword';
import BackOfficeLayout from './layouts/BackOfficeLayout';
import FrontLayout from './layouts/FrontLayout';
import DashboardAdmin from './pages/backoffice/DashboardAdmin';
import DashboardUser from './pages/app/DashboardUser';
import AdminUsuarios from './pages/app/AdminUsuarios';
import Empresas from './pages/backoffice/Empresas';
import Usuarios from './pages/backoffice/Usuarios';
import Inventario from './pages/app/Inventario';
import Proveedores from './pages/app/Proveedores';
import Clientes from './pages/app/Clientes';
import Servicios from './pages/app/Servicios';
import Compras from './pages/app/Compras';
import Ventas from './pages/app/Ventas';
import Pedidos from './pages/app/Pedidos';
import Informes from './pages/app/Informes';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Navigate to="/cambiar-password" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.rol)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Bloquea la ruta si la empresa activa no tiene contratado el módulo
// (el backend también lo valida — esto solo evita la pantalla rota).
const ModuloRoute = ({ modulo, children }) => {
  const activeEmpresa = useAuthStore((s) => s.activeEmpresa);
  const rol = useAuthStore((s) => s.user?.rol);
  if (rol === 'BACKOFFICE_ADMIN') return children;
  const modulos = activeEmpresa?.modulos || [];
  if (!modulos.includes(modulo)) return <Navigate to="/app" replace />;
  return children;
};

// Solo FRONT_ADMIN (gestión de personal). Un FRONT_USER se manda al dashboard.
const SoloFrontAdmin = ({ children }) => {
  const rol = useAuthStore((s) => s.user?.rol);
  return rol === 'FRONT_ADMIN' ? children : <Navigate to="/app" replace />;
};

// La pantalla de cambio de contraseña solo requiere sesión iniciada (se usa
// también cuando el usuario está obligado a cambiarla y aún no puede entrar).
const CambiarPasswordGuard = () => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <CambiarPassword />;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginProvider />} />
        <Route path="/cambiar-password" element={<CambiarPasswordGuard />} />

        <Route 
          path="/backoffice" 
          element={
            <ProtectedRoute allowedRoles={['BACKOFFICE_ADMIN']}>
              <BackOfficeLayout />
            </ProtectedRoute>
          } 
        >
          <Route index element={<DashboardAdmin />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="usuarios" element={<Usuarios />} />
        </Route>

        <Route 
          path="/app" 
          element={
            <ProtectedRoute allowedRoles={['FRONT_ADMIN', 'FRONT_USER']}>
              <FrontLayout />
            </ProtectedRoute>
          } 
        >
          <Route index element={<DashboardUser />} />
          <Route path="inventario" element={<ModuloRoute modulo="Inventario"><Inventario /></ModuloRoute>} />
          <Route path="proveedores" element={<ModuloRoute modulo="Proveedores"><Proveedores /></ModuloRoute>} />
          <Route path="clientes" element={<ModuloRoute modulo="Clientes"><Clientes /></ModuloRoute>} />
          <Route path="servicios" element={<ModuloRoute modulo="Servicios"><Servicios /></ModuloRoute>} />
          <Route path="compras" element={<ModuloRoute modulo="Compras"><Compras /></ModuloRoute>} />
          <Route path="ventas" element={<ModuloRoute modulo="Ventas"><Ventas /></ModuloRoute>} />
          <Route path="pedidos" element={<ModuloRoute modulo="Pedidos"><Pedidos /></ModuloRoute>} />
          <Route path="informes" element={<ModuloRoute modulo="Informes"><Informes /></ModuloRoute>} />
          <Route path="admin" element={<SoloFrontAdmin><AdminUsuarios /></SoloFrontAdmin>} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<div className="flex h-screen w-full items-center justify-center bg-slate-50 text-2xl font-light text-slate-500">404 - Ruta no encontrada</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
