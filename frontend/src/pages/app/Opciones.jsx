import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal, Wand2 } from 'lucide-react';
import api from '../../api/axios';
import { apiError } from '../../utils/apiError';
import { useOpciones } from '../../hooks/useOpciones';
import PageHeader from '../../components/ui/PageHeader';
import FormError from '../../components/FormError';
import Modal, { ModalActions } from '../../components/ui/Modal';

const Interruptor = ({ opcion, valor, onCambiar, deshabilitado }) => (
  <label className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 ${deshabilitado ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
    <input
      type="checkbox" role="switch" className="mt-1 w-5 h-5 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
      checked={!!valor} disabled={deshabilitado} onChange={(e) => onCambiar(opcion.clave, e.target.checked)}
    />
    <span className="min-w-0">
      <span className="block font-semibold text-slate-800">{opcion.etiqueta}</span>
      <span className="block text-sm text-slate-500">{opcion.descripcion}</span>
      {opcion.requiere?.length > 0 && <span className="block text-xs text-slate-400 mt-1">Necesita: {opcion.requiere.join(', ')}</span>}
    </span>
  </label>
);

/**
 * Opciones del restaurante / cafetería: cada función se prende o apaga por su cuenta, sin afectar a las demás
 * ni al resto de la aplicación. Los perfiles dejan todo listo de un clic.
 */
const Opciones = () => {
  const qc = useQueryClient();
  const { valores, catalogo, perfiles, cargando } = useOpciones();
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [perfil, setPerfil] = useState(null);

  const guardar = useMutation({
    mutationFn: (payload) => api.put('/opciones', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); setError(null); setPerfil(null); },
    onError: (err) => { setError(apiError(err, 'No se pudo guardar')); setPerfil(null); qc.invalidateQueries({ queryKey: ['empresa'] }); },
  });
  const cambiar = (clave, valor) => { setAviso(null); guardar.mutate({ valores: { [clave]: valor } }); };

  const grupos = [...new Set(catalogo.map((o) => o.grupo))];
  const requisitosOk = (o) => (o.requiere || []).every((r) => valores[r]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Opciones"
        description="Prende o apaga cada función por separado: lo que apagues no afecta al resto ni a las ventas de siempre."
      />
      <FormError message={error} onDismiss={() => setError(null)} />
      {aviso && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">{aviso}</p>}

      <section aria-label="Perfiles" className="card-container p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Wand2 className="w-5 h-5 text-brand-700" aria-hidden="true" /> Perfiles listos</h3>
        <p className="text-sm text-slate-500">Un perfil deja varias opciones de una vez. Después puedes ajustar cualquiera.</p>
        <div className="flex flex-wrap gap-3">
          {perfiles.map((p) => (
            <button key={p.clave} type="button" className="text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-brand-400 hover:bg-brand-50/40 max-w-xs" onClick={() => setPerfil(p)}>
              <span className="block font-semibold text-slate-800">{p.etiqueta}</span>
              <span className="block text-xs text-slate-500">{p.descripcion}</span>
            </button>
          ))}
        </div>
      </section>

      {cargando ? <p className="text-slate-500" role="status">Cargando…</p> : catalogo.length === 0 ? (
        <div className="card-container p-8 text-center text-slate-500">
          <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 text-slate-400" aria-hidden="true" />
          <p className="font-semibold text-slate-700">No hay opciones para configurar</p>
          <p className="text-sm mt-1">Aparecen cuando la empresa tiene módulos como Mesas o Recetas.</p>
        </div>
      ) : grupos.map((g) => (
        <section key={g} aria-label={g} className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-800">{g}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {catalogo.filter((o) => o.grupo === g).map((o) => (
              <Interruptor key={o.clave} opcion={o} valor={valores[o.clave]} onCambiar={cambiar} deshabilitado={guardar.isPending || (!valores[o.clave] && !requisitosOk(o))} />
            ))}
          </div>
        </section>
      ))}

      <Modal open={!!perfil} onClose={() => setPerfil(null)} title={`Aplicar el perfil «${perfil?.etiqueta ?? ''}»`} size="md">
        {perfil && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">{perfil.descripcion} Esto cambia varias opciones a la vez y reemplaza lo que tenías configurado en ellas. No toca tus productos, ventas ni inventario.</p>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setPerfil(null)}>Volver</button>
              <button type="button" className="btn-primary px-6" disabled={guardar.isPending} onClick={() => { setAviso(`Perfil «${perfil.etiqueta}» aplicado.`); guardar.mutate({ perfil: perfil.clave }); }}>
                {guardar.isPending ? 'Aplicando…' : 'Aplicar perfil'}
              </button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Opciones;
