/**
 * Tabla dentro de su tarjeta, con el scroll horizontal ya resuelto.
 *
 * De las 15 tablas de la app solo 5 estaban envueltas en overflow-x-auto; las
 * otras 10 desbordaban el contenedor y hacían scrollear el body entero en
 * horizontal. Montar la tabla por aquí hace que ese wrapper no sea opcional.
 *
 *   <TableCard>
 *     <THead><Th>SKU</Th><Th align="right">Valor</Th></THead>
 *     <tbody>…</tbody>
 *   </TableCard>
 */
export const TableCard = ({ children, className = '' }) => (
  <div className={`card-container ${className}`}>
    <div className="overflow-x-auto w-full">
      <table className="w-full text-left">{children}</table>
    </div>
  </div>
);

export const THead = ({ children }) => (
  <thead className="bg-slate-50/50 border-b border-slate-100">
    <tr>{children}</tr>
  </thead>
);

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };

export const Th = ({ children, align = 'left', className = '' }) => (
  <th
    scope="col"
    className={`px-6 py-4 text-xs font-semibold text-slate-500 tracking-wider uppercase whitespace-nowrap ${ALIGN[align]} ${className}`}
  >
    {children}
  </th>
);

export const Tr = ({ children, className = '' }) => (
  <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors ${className}`}>
    {children}
  </tr>
);

export const Td = ({ children, align = 'left', className = '' }) => (
  <td className={`px-6 py-4 ${ALIGN[align]} ${className}`}>{children}</td>
);
