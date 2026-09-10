import PageHeader from '../../components/ui/PageHeader';
import EventLogTable from '../../components/ui/EventLogTable';

const Auditoria = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader
      title="Auditoría"
      description="Quién hizo qué en tu empresa: ventas, compras, pedidos, cambios en el catálogo y usuarios."
    />
    <EventLogTable
      endpoint="/auditoria"
      queryKeyPrefix="auditoria"
      emptyTitle="Todavía no hay actividad registrada"
    />
  </div>
);

export default Auditoria;
