import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import LoginProvider from './pages/LoginProvider';
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
  if (allowedRoles && !allowedRoles.includes(user?.rol)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginProvider />} />
        
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
          <Route path="inventario" element={<Inventario />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="servicios" element={<Servicios />} />
          <Route path="compras" element={<Compras />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="informes" element={<Informes />} />
          <Route path="admin" element={<AdminUsuarios />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<div className="flex h-screen w-full items-center justify-center bg-slate-50 text-2xl font-light text-slate-500">404 - Ruta no encontrada</div>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
