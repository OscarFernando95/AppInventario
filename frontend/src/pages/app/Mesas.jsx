import { useState } from 'react';
import { BellRing, BellOff, Volume2, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import Tablero from '../../components/mesas/Tablero';
import Ocupacion from '../../components/mesas/Ocupacion';
import CuentaPanel from '../../components/mesas/CuentaPanel';
import { useMesasConAviso } from '../../hooks/useAvisoCocina';
import { useOpciones } from '../../hooks/useOpciones';

/**
 * Mesas y cuentas abiertas: el tablero muestra qué mesas están libres u ocupadas; al abrir una cuenta se
 * piden platos (que se envían a cocina por comandas) y se cobra al final, todo o por partes, con propina.
 * Cuando cocina marca una comanda como lista suena un aviso y aparece en pantalla, estés donde estés.
 */
const Mesas = () => {
  const [cuentaId, setCuentaId] = useState(null);
  const mesas = useMesasConAviso();
  // «Tiempo de ocupación» (opción): una pestaña con el informe. Apagada, la página es solo el tablero de siempre.
  const conOcupacion = useOpciones().opcion('tiempo_ocupacion', false);
  const [pestana, setPestana] = useState('tablero');
  const verOcupacion = conOcupacion && pestana === 'ocupacion';

  return (
    <div className="space-y-6 animate-fade-in">
      <div aria-live="polite" className="space-y-2">
        {mesas.avisos.map((a) => (
          <div key={a.clave} role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="flex items-center gap-2 font-semibold"><BellRing className="w-4 h-4" aria-hidden="true" /> Cocina terminó una comanda de {a.nombre}: ¡a recoger!</span>
            <span className="flex gap-1">
              {cuentaId !== a.id && <button type="button" className="btn-secondary text-xs" onClick={() => { setCuentaId(a.id); mesas.quitarAviso(a.clave); }}>Ver cuenta</button>}
              <button type="button" className="btn-icon" aria-label="Cerrar aviso" onClick={() => mesas.quitarAviso(a.clave)}><X className="w-4 h-4" /></button>
            </span>
          </div>
        ))}
      </div>

      {cuentaId == null && (
        <PageHeader
          title="Mesas"
          description="Abre una cuenta por mesa, agrega los pedidos, envíalos a cocina y cobra al final."
          action={(
            <button type="button" className="btn-secondary gap-2" aria-pressed={mesas.silenciado} onClick={() => mesas.setSilenciado(!mesas.silenciado)}>
              {mesas.silenciado ? <BellOff className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
              {mesas.silenciado ? 'Avisos sin sonido' : 'Avisos con sonido'}
            </button>
          )}
        />
      )}
      {cuentaId == null && conOcupacion && (
        <Tabs tabs={[{ id: 'tablero', label: 'Tablero' }, { id: 'ocupacion', label: 'Ocupación' }]} value={pestana} onChange={setPestana} />
      )}
      {cuentaId != null
        ? <CuentaPanel key={cuentaId} cuentaId={cuentaId} onVolver={() => setCuentaId(null)} tablero={mesas.data} />
        : verOcupacion ? <Ocupacion /> : <Tablero onAbrir={setCuentaId} consulta={mesas} />}
    </div>
  );
};

export default Mesas;
