import { AlertTriangle, X } from 'lucide-react';

/**
 * Banner de error para formularios. Muestra el mensaje real del backend en vez
 * del `alert()` genérico que se usaba antes.
 *
 *   const [formError, setFormError] = useState(null);
 *   ...
 *   onError: (err) => setFormError(apiError(err, 'No se pudo guardar')),
 *   ...
 *   <FormError message={formError} onDismiss={() => setFormError(null)} />
 */
const FormError = ({ message, onDismiss }) => {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="flex-1 font-medium leading-snug">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-red-400 hover:text-red-600">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default FormError;
