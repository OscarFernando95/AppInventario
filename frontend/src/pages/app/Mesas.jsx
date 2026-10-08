import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Tablero from '../../components/mesas/Tablero';
import CuentaPanel from '../../components/mesas/CuentaPanel';

/**
 * Mesas y cuentas abiertas: el tablero muestra qué mesas están libres u ocupadas; al abrir una cuenta se
 * piden platos (que se envían a cocina por comandas) y se cobra al final, todo o por partes, con propina.
 */
const Mesas = () => {
  const [cuentaId, setCuentaId] = useState(null);
  return (
    <div className="space-y-6 animate-fade-in">
      {cuentaId == null && (
        <PageHeader title="Mesas" description="Abre una cuenta por mesa, agrega los pedidos, envíalos a cocina y cobra al final." />
      )}
      {cuentaId == null
        ? <Tablero onAbrir={setCuentaId} />
        : <CuentaPanel key={cuentaId} cuentaId={cuentaId} onVolver={() => setCuentaId(null)} />}
    </div>
  );
};

export default Mesas;
