import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Barra "Mostrando 1–50 de 320" + Anterior/Siguiente para listados paginados
 * por `offset`/`limit` que leen el total de la cabecera `X-Total-Count`.
 *
 *   <TablePagination total={total} offset={offset} limit={LIMIT} onChange={setOffset} />
 */
const TablePagination = ({ total, offset, limit, onChange }) => {
  if (!total) return null;
  const desde = offset + 1;
  const hasta = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>Mostrando {desde}–{hasta} de {total}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary gap-1"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Anterior
        </button>
        <button
          type="button"
          className="btn-secondary gap-1"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Siguiente <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
