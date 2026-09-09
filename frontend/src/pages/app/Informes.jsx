import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../api/axios';
import { TrendingUp, TrendingDown, PackageOpen, Target, Box, CreditCard, PieChart, Printer, Calendar, FileText, Download } from 'lucide-react';
import { formatCOP } from '../../utils/format';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';

// eslint-disable-next-line no-unused-vars -- `Icon` sí se usa como componente en el JSX de abajo
const KPIBox = ({ title, value, subtitle, icon: Icon, colorClass }) => (
  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
    <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-110 transition-transform ${colorClass.bg}`}></div>
    <div className="flex justify-between items-start mb-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass.bg} shadow-inner`}>
        <Icon className={`w-6 h-6 ${colorClass.text}`} />
      </div>
    </div>
    <h3 className="text-3xl font-black text-slate-800 mb-1">{value}</h3>
    <p className="text-sm font-bold text-slate-500 leading-tight">{title}</p>
    {subtitle && <p className="text-xs font-semibold text-slate-400 mt-2 flex items-center gap-1 opacity-70">{subtitle}</p>}
  </div>
);

const Informes = () => {
  const { data = {}, isLoading } = useEmpresaQuery(['reportes', 'dashboard'], '/reportes/dashboard');
  const {
    totalProductos = 0,
    ventasMes = 0,
    comprasMes = 0,
  } = data;

  // Report Generator State
  const [informeParams, setInformeParams] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    tipo: 'ventas_resumen'
  });
  const [informeData, setInformeData] = useState(null);
  const [formError, setFormError] = useState(null);

  const generar = useMutation({
    mutationFn: (params) => api.get('/informes', { params }).then((r) => r.data),
    onSuccess: (rows) => { setInformeData(rows); setFormError(null); },
    onError: (err) => setFormError(apiError(err, 'Sucedió un error o no hay datos.')),
  });

  const handleGenerate = (e) => {
    e.preventDefault();
    setFormError(null);
    generar.mutate(informeParams);
  };

  const currentReportName = {
    'ventas_resumen': 'Historial de Ventas',
    'compras_resumen': 'Historial de Compras y Gastos',
    'top_productos': 'Top Productos Vendidos',
    'top_clientes': 'Top Clientes (Volumen de Compra)',
    'top_proveedores': 'Top Proveedores (Volumen de Pedidos)'
  }[informeParams.tipo];

  const renderTable = () => {
    if (!informeData) return <div className="p-10 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">Selecciona los parámetros y genera un reporte.</div>;
    if (informeData.length === 0) return <div className="p-10 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">No se encontraron registros para este rango.</div>;

    switch (informeParams.tipo) {
      case 'ventas_resumen':
        return (
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase font-black text-slate-500"><th className="p-4 rounded-tl-xl mt-2">Fecha y Hora</th><th className="p-4">Cliente / Docs</th><th className="p-4 rounded-tr-xl">Monto Facturado</th></tr></thead>
            <tbody>
              {informeData.map(v => (
                <tr key={v.id} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-medium text-sm text-slate-600">{new Date(v.fecha).toLocaleString('es-CO')}</td>
                  <td className="p-4 font-bold text-slate-800">{v.Cliente?.nombre || 'General / Piso'} <br/><span className="text-xs text-slate-400 font-mono">{v.Cliente?.identificacion}</span></td>
                  <td className="p-4 font-black text-emerald-600 text-base">{formatCOP(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'compras_resumen':
        return (
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase font-black text-slate-500"><th className="p-4 rounded-tl-xl mt-2">Fecha y Hora</th><th className="p-4">Proveedor</th><th className="p-4 rounded-tr-xl">Total Pagado</th></tr></thead>
            <tbody>
              {informeData.map(c => (
                <tr key={c.id} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-medium text-sm text-slate-600">{new Date(c.fecha).toLocaleString('es-CO')}</td>
                  <td className="p-4 font-bold text-slate-800">{c.Proveedor?.nombre || c.Proveedor?.nit || 'Gasto Anónimo'}</td>
                  <td className="p-4 font-black text-orange-600 text-base">{formatCOP(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'top_productos':
        return (
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase font-black text-slate-500"><th className="p-4 rounded-tl-xl mt-2">Producto / SKU</th><th className="p-4 text-center">Cant. Despachada</th><th className="p-4 rounded-tr-xl">Ingreso Generado</th></tr></thead>
            <tbody>
              {informeData.map((p, idx) => (
                <tr key={idx} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{p.nombre_producto || `SKU #${p.productoId}`}</td>
                  <td className="p-4 font-black text-brand-600 text-lg text-center">{p.total_vendido} <span className="text-xs text-slate-400">uds</span></td>
                  <td className="p-4 font-black text-emerald-600 text-base">{formatCOP(p.ingreso_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'top_clientes':
        return (
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase font-black text-slate-500"><th className="p-4 rounded-tl-xl mt-2">Cliente</th><th className="p-4 text-center">Frecuencia (Compras)</th><th className="p-4 rounded-tr-xl">Importe Total LTV</th></tr></thead>
            <tbody>
              {informeData.map((c, idx) => (
                <tr key={idx} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{c.nombre_cliente || 'Ventas de Piso'}</td>
                  <td className="p-4 font-black text-brand-600 text-lg text-center">{c.total_compras}</td>
                  <td className="p-4 font-black text-emerald-600 text-base">{formatCOP(c.dinero_gastado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'top_proveedores':
        return (
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase font-black text-slate-500"><th className="p-4 rounded-tl-xl mt-2">Proveedor</th><th className="p-4 text-center">Frecuencia (Órdenes)</th><th className="p-4 rounded-tr-xl">Capital Invertido</th></tr></thead>
            <tbody>
              {informeData.map((pv, idx) => (
                <tr key={idx} className="border-b border-slate-100/50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{pv.nombre_prov || pv.nit_prov || 'Gasto Anónimo'}</td>
                  <td className="p-4 font-black text-brand-600 text-lg text-center">{pv.total_ordenes}</td>
                  <td className="p-4 font-black text-orange-600 text-base">{formatCOP(pv.dinero_invertido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      default: return null;
    }
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500 font-bold animate-pulse">Analizando métricas y compilando reportes...</div>;

  const mrg = ventasMes - comprasMes;
  const isHealthyMargin = mrg >= 0;

  return (
    <div className="space-y-8 animate-fade-in relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Centro de Informes y Control</h2>
          <p className="text-slate-500 mt-1">Monitorea la liquidez mensual y exporta métricas empresariales avanzadas.</p>
        </div>
        <div className="px-4 py-2 bg-slate-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-slate-800/20 flex items-center gap-2">
          <PieChart className="w-4 h-4" /> Inteligencia de Negocio
        </div>
      </div>

      {/* KPI Globales - Oculto en Print */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 print:hidden">
        <KPIBox title="Facturación Mes en Curso" value={formatCOP(ventasMes)} icon={TrendingUp} colorClass={{ bg: 'bg-brand-100', text: 'text-brand-600' }} />
        <KPIBox title="Gastos Mes en Curso" value={formatCOP(comprasMes)} icon={TrendingDown} colorClass={{ bg: 'bg-orange-100', text: 'text-orange-600' }} />
        <KPIBox title="Margen Operativo Bruto" value={formatCOP(mrg)} subtitle="Ingresos vs Gastos" icon={Target} colorClass={{ bg: isHealthyMargin ? 'bg-emerald-100' : 'bg-red-100', text: isHealthyMargin ? 'text-emerald-600' : 'text-red-600' }} />
        <KPIBox title="Referencias de Inventario" value={totalProductos} icon={Box} colorClass={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
      </div>

      {/* Generador de Informes Parametrizables */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-8 print:border-none print:shadow-none bg-print-wrapper">
        <div className="p-6 md:p-8 bg-slate-800 text-white flex flex-col md:flex-row justify-between items-center gap-6 print:hidden">
           <div>
             <h3 className="text-2xl font-black flex items-center gap-2"><FileText className="w-6 h-6 text-brand-400"/> Generador de Reportes</h3>
             <p className="text-slate-400 text-sm mt-1">Configura parámetros y obtén un desglose profundo imprimible.</p>
           </div>

           <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-4 w-full md:w-auto bg-slate-900/50 p-4 rounded-2xl border border-slate-700 backdrop-blur-md">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desde</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required type="date" value={informeParams.start} onChange={e => setInformeParams({...informeParams, start: e.target.value})} className="w-full pl-9 pr-3 py-2 bg-slate-800 border m-0 border-slate-600 rounded-lg text-sm text-white focus:border-brand-500 outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hasta</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input required type="date" value={informeParams.end} onChange={e => setInformeParams({...informeParams, end: e.target.value})} className="w-full pl-9 pr-3 py-2 bg-slate-800 border m-0 border-slate-600 rounded-lg text-sm text-white focus:border-brand-500 outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Métrica o Tipo</label>
                <select value={informeParams.tipo} onChange={e => setInformeParams({...informeParams, tipo: e.target.value})} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white focus:border-brand-500 outline-none hover:cursor-pointer">
                  <option value="ventas_resumen">Kardex de Ventas (Ingresos)</option>
                  <option value="compras_resumen">Kardex de Compras (Egresos)</option>
                  <option value="top_productos">Análisis: Productos Estrella</option>
                  <option value="top_clientes">Análisis: Mejores Clientes</option>
                  <option value="top_proveedores">Análisis: Concentración de Proveedores</option>
                </select>
              </div>
              <button disabled={generar.isPending} type="submit" className="h-9 px-6 bg-brand-500 hover:bg-brand-400 text-white font-black text-sm rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all flex justify-center items-center disabled:opacity-50">
                {generar.isPending ? 'Calculando...' : 'Analizar'}
              </button>
           </form>
        </div>

        <div className="px-6 md:px-8 pt-4 print:hidden"><FormError message={formError} onDismiss={() => setFormError(null)} /></div>

        {/* Zona del Reporte Renderizado y Hoja PDF */}
        <div className="p-6 md:p-10 bg-white min-h-[400px]">
           {informeData ? (
             <div className="relative">
               {/* Print Header */}
               <div className="mb-8 pb-4 border-b-2 border-slate-800 hidden print:block">
                 <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Reporte Corporativo</h1>
                 <h2 className="text-xl font-bold text-slate-500">{currentReportName}</h2>
                 <p className="text-sm font-mono text-slate-400 mt-2">Periodo: {informeParams.start} a {informeParams.end}</p>
                 <p className="text-xs font-mono text-slate-400">Generado el: {new Date().toLocaleString('es-CO')}</p>
               </div>

               {/* Screen Header */}
               <div className="flex justify-between items-center mb-6 print:hidden">
                 <div>
                   <h4 className="text-xl font-black text-slate-800">{currentReportName}</h4>
                   <p className="text-sm font-bold text-brand-600 font-mono mt-1">Periodo: {informeParams.start} - {informeParams.end}</p>
                 </div>
                 <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl shadow-md hover:bg-slate-700 font-bold text-sm transition-all focus:ring-4 focus:ring-slate-800/20">
                    <Printer className="w-4 h-4" /> Exportar a PDF / Imprimir
                 </button>
               </div>

               <div className="w-full overflow-x-auto rounded-xl border border-slate-200 print:border-none">
                 {renderTable()}
               </div>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-20 opacity-50 print:hidden">
                <Download className="w-16 h-16 mb-4 opacity-50"/>
                <p className="font-bold text-lg">El módulo generador está listo.</p>
                <p className="text-sm">Configura tu filtro en la barra superior para iniciar el minado de datos.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Informes;
