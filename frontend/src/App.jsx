import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
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
import Logs from './pages/backoffice/Logs';
import Inventario from './pages/app/Inventario';
import Proveedores from './pages/app/Proveedores';
import Clientes from './pages/app/Clientes';
import Servicios from './pages/app/Servicios';
import Compras from './pages/app/Compras';
import Ventas from './pages/app/Ventas';
import Pedidos from './pages/app/Pedidos';
import Caja from './pages/app/Caja';
import Recetas from './pages/app/Recetas';
import Ajustes from './pages/app/Ajustes';
import Gastos from './pages/app/Gastos';
import Reposicion from './pages/app/Reposicion';
import { CuentasCobrar, CuentasPagar } from './pages/app/Cartera';
import Informes from './pages/app/Informes';
import Auditoria from './pages/app/Auditoria';
import Roles from './pages/app/Roles';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Navigate to="/cambiar-password" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.rol)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Bloquea la ruta si la empresa no tiene contratado el módulo o el rol del usuario no entra a él
// (el backend también lo valida — esto solo evita la pantalla rota).
const ModuloRoute = ({ modulo, children }) => {
  const activeEmpresa = useAuthStore((s) => s.activeEmpresa);
  const rol = useAuthStore((s) => s.user?.rol);
  if (rol === 'BACKOFFICE_ADMIN') return children;
  const acceso = activeEmpresa?.acceso ?? activeEmpresa?.modulos ?? [];
  if (!acceso.includes(modulo)) return <Navigate to="/app" replace />;
  return children;
};

// Pantallas que exigen un permiso (personal, auditoría, cuentas por pagar…). Sin él se vuelve al dashboard.
const ConPermiso = ({ permiso, children }) => {
  const permisos = useAuthStore((s) => s.activeEmpresa?.permisos);
  return (permisos || []).includes(permiso) ? children : <Navigate to="/app" replace />;
};

// La pantalla de cambio de contraseña solo requiere sesión iniciada (se usa
// también cuando el usuario está obligado a cambiarla y aún no puede entrar).
const CambiarPasswordGuard = () => {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <CambiarPassword />;
};

// Antes era un <div> suelto con "404 - Ruta no encontrada" y sin ninguna forma
// de volver: el usuario quedaba en un callejón sin salida.
const NotFound = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const rol = useAuthStore((s) => s.user?.rol);
  const destino = !isAuthenticated ? '/login' : rol === 'BACKOFFICE_ADMIN' ? '/backoffice' : '/app';
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Error 404</p>
      <h1 className="text-3xl font-bold text-slate-800">Esta página no existe</h1>
      <p className="max-w-md text-slate-500">
        La dirección que abriste no corresponde a ninguna sección de la aplicación.
      </p>
      <Link to={destino} className="btn-primary mt-2">Volver al inicio</Link>
    </div>
  );
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
          <Route path="logs" element={<Logs />} />
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
          <Route path="recetas" element={<ModuloRoute modulo="Recetas"><Recetas /></ModuloRoute>} />
          <Route path="reposicion" element={<ModuloRoute modulo="Inventario"><Reposicion /></ModuloRoute>} />
          <Route path="ajustes" element={<ModuloRoute modulo="Inventario"><Ajustes /></ModuloRoute>} />
          <Route path="cuentas-por-cobrar" element={<ModuloRoute modulo="Cuentas por cobrar"><CuentasCobrar /></ModuloRoute>} />
          <Route path="cuentas-por-pagar" element={<ModuloRoute modulo="Cuentas por pagar"><ConPermiso permiso="cartera.pagar"><CuentasPagar /></ConPermiso></ModuloRoute>} />
          <Route path="gastos" element={<ModuloRoute modulo="Gastos"><Gastos /></ModuloRoute>} />
          <Route path="caja" element={<ModuloRoute modulo="Caja"><Caja /></ModuloRoute>} />
          <Route path="pedidos" element={<ModuloRoute modulo="Pedidos"><Pedidos /></ModuloRoute>} />
          <Route path="informes" element={<ModuloRoute modulo="Informes"><Informes /></ModuloRoute>} />
          <Route path="admin" element={<ConPermiso permiso="usuarios.gestionar"><AdminUsuarios /></ConPermiso>} />
          <Route path="roles" element={<ModuloRoute modulo="Roles y permisos"><ConPermiso permiso="roles.gestionar"><Roles /></ConPermiso></ModuloRoute>} />
          <Route path="auditoria" element={<ConPermiso permiso="auditoria.ver"><Auditoria /></ConPermiso>} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
