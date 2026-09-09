import { Children, cloneElement, isValidElement, useId } from 'react';

/**
 * Etiqueta + control, con el `htmlFor`/`id` cableado automáticamente.
 *
 * En la app había 79 <label> y cero htmlFor: ninguna etiqueta estaba asociada a
 * su input, así que el click en el texto no enfocaba el campo y un lector de
 * pantalla anunciaba los controles sin nombre. Aquí el id sale de useId() y se
 * inyecta en el hijo, de modo que no hay forma de olvidarlo.
 *
 *   <Field label="Correo">
 *     <input type="email" className="input-field" value={…} onChange={…} />
 *   </Field>
 *
 * El hijo puede ser cualquier control que acepte `id` (input, select, textarea
 * y SearchableSelect, que ya recibía un prop `id` que nadie le pasaba).
 */
const Field = ({ label, hint, error, required = false, children, className = '' }) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: child.props.id || id,
        'aria-describedby': child.props['aria-describedby'] || describedBy,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        required: child.props.required ?? required,
      })
    : child;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
          {required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      {control}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
};

export default Field;
