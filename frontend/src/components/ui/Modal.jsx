import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[95vw]',
};

/**
 * Modal único de la aplicación.
 *
 * Antes había 12 backdrops escritos a mano con cuatro recetas de scrim
 * distintas (slate-900/40, /60, /70, /80) y z-[9999] repetido doce veces, más
 * un z-[10000] para el modal que iba encima de otro modal. Aquí el scrim es uno
 * solo y el apilamiento usa la escala con nombre del theme: `elevated` sube a
 * z-modal-top en vez de inventar un número mayor.
 *
 *   <Modal open={show} onClose={close} title="Nuevo Cliente" size="2xl">
 *     …contenido
 *   </Modal>
 *
 * Props:
 *   - variant: 'center' (por defecto) | 'drawer' (panel lateral derecho)
 *              | 'bare' (solo el scrim; el hijo aporta su propio panel, para
 *                las pantallas POS que ocupan todo el alto en móvil)
 *   - elevated: para un modal que se abre sobre otro modal
 *   - printable: no se oculta al imprimir (por defecto los modales sí)
 */
const Modal = ({
  open,
  onClose,
  title,
  description,
  size = 'lg',
  variant = 'center',
  elevated = false,
  printable = false,
  hideClose = false,
  children,
  className = '',
}) => {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);

  // Escape cierra. Se registra solo mientras el modal está abierto, así el
  // de encima (elevated) es el que responde primero al desmontarse el listener.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Bloquea el scroll del fondo mientras hay un modal abierto.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Mueve el foco al panel al abrir, para que el teclado no se quede en el
  // botón que lo lanzó (que ahora está detrás del scrim).
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;
    const focusable = node.querySelector(
      'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    (focusable || node).focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const isDrawer = variant === 'drawer';
  const isBare = variant === 'bare';

  if (isBare) {
    return createPortal(
      <div
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in flex items-center justify-center overflow-y-auto ${
          elevated ? 'z-modal-top' : 'z-modal'
        } ${printable ? '' : 'print:hidden'} ${className}`}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className="w-full outline-none"
        >
          {children}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in flex p-4 ${
        elevated ? 'z-modal-top' : 'z-modal'
      } ${isDrawer ? 'justify-end' : 'items-center justify-center overflow-y-auto'} ${
        printable ? '' : 'print:hidden'
      }`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`bg-white shadow-xl relative outline-none ${
          isDrawer
            ? 'h-full w-full max-w-xl rounded-l-3xl overflow-y-auto p-8'
            : `w-full my-auto rounded-3xl p-8 ${SIZES[size] || SIZES.lg}`
        } ${className}`}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
            <div>
              {title && (
                <h3 id={titleId} className="text-2xl font-semibold text-slate-800">{title}</h3>
              )}
              {description && (
                <p id={descId} className="text-sm text-slate-500 mt-1">{description}</p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="btn-icon shrink-0 -mt-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};

/** Pie de modal con las acciones alineadas a la derecha. */
export const ModalActions = ({ children, className = '' }) => (
  <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-8 pt-4 border-t border-slate-100 ${className}`}>
    {children}
  </div>
);

export default Modal;
