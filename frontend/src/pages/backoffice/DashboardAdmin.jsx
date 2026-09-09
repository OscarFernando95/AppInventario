import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { Building2, Users, AlertTriangle } from 'lucide-react';

const useCount = (key, url) =>
  useQuery({
    queryKey: [key, 'count'],
    queryFn: async () => {
      const res = await api.get(url, { params: { limit: 1 } });
      return Number(res.headers['x-total-count'] || 0);
    },
  });

const StatCard = ({ label, value, icon, tone, isLoading, isError }) => {
  const Icon = icon;
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 mb-2 tracking-wider uppercase">{label}</p>
          {isLoading ? (
            <div className="h-10 w-24 bg-slate-100 rounded-lg animate-pulse" role="status" aria-label={`Cargando ${label}`} />
          ) : isError ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-500 h-10">
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

const DashboardAdmin = () => {
  const empresas = useCount('empresas', '/empresas');
  const usuarios = useCount('usuarios', '/usuarios');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          label="Empresas activas" icon={Building2} tone="bg-brand-50 text-brand-700"
          value={empresas.data ?? 0} isLoading={empresas.isLoading} isError={empresas.isError}
        />
        <StatCard
          label="Usuarios totales" icon={Users} tone="bg-slate-100 text-slate-700"
          value={usuarios.data ?? 0} isLoading={usuarios.isLoading} isError={usuarios.isError}
        />
      </div>
    </div>
  );
};

export default DashboardAdmin;
