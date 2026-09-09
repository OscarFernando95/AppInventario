/**
 * Cabecera de página: título, descripción y acción principal a la derecha.
 * Absorbe el bloque que estaba copiado literalmente en 11 páginas.
 *
 * El título pasa de `font-black` a `font-bold`: con el 92% del texto de la app
 * en peso >=600, la negrita máxima había dejado de señalar nada.
 */
const PageHeader = ({ title, description, action }) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{title}</h2>
      {description && <p className="text-slate-500 mt-1">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
