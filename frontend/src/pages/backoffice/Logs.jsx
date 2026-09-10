import PageHeader from '../../components/ui/PageHeader';
import EventLogTable from '../../components/ui/EventLogTable';

const Logs = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader
      title="Registro de Actividad"
      description="Todos los eventos del sistema (accesos, errores de API, acciones de negocio) de todas las empresas."
    />
    <EventLogTable endpoint="/logs" queryKeyPrefix="bo-logs" showEmpresa />
  </div>
);

export default Logs;
