import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Building2, Users } from 'lucide-react';

const DashboardAdmin = () => {
  const [stats, setStats] = useState({ empresas: 0, usuarios: 0 });

  useEffect(() => {
    Promise.all([api.get('/empresas'), api.get('/usuarios')])
      .then(([resE, resU]) => {
        setStats({ empresas: resE.data.length, usuarios: resU.data.length });
      }).catch(console.error);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1 tracking-wide">EMPRESAS ACTIVAS</p>
              <h3 className="text-4xl font-extrabold text-slate-800">{stats.empresas}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center shadow-inner">
              <Building2 className="w-7 h-7 text-brand-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1 tracking-wide">USUARIOS TOTALES</p>
              <h3 className="text-4xl font-extrabold text-slate-800">{stats.usuarios}</h3>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center shadow-inner">
              <Users className="w-7 h-7 text-indigo-600" />
            </div>
          </div>
        </div>

      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.05)] p-10 mt-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Building2 className="w-64 h-64" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-4">Bienvenido al Centro de Control Modular</h2>
        <p className="text-slate-600 text-lg max-w-2xl leading-relaxed">
          Has ingresado al portal omnisciente (Súper Admin). Desde aquí gobernarás las instancias de empresas y usuarios asignados a nuestra infraestructura Multi-Tenant. Utiliza el panel izquierdo para agregar o modificar compañías y asignar sus privilegios.
        </p>
      </div>
    </div>
  );
};

export default DashboardAdmin;
