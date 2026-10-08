/**
 * Pestañas simples (accesibles: tablist/tab con aria-selected).
 *
 *   <Tabs tabs={[{ id: 'a', label: 'Ventas' }, { id: 'b', label: 'Costos' }]} value={tab} onChange={setTab} />
 *
 * El contenido lo pinta la página según `value`; aquí solo va la barra.
 */
const Tabs = ({ tabs, value, onChange }) => (
  <div role="tablist" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
    {tabs.map((t) => {
      const activa = t.id === value;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activa}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-t-lg ${
            activa ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);

export default Tabs;
