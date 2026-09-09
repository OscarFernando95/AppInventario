import { useMemo } from 'react';
import SearchableSelect from './SearchableSelect';
import { titleCase } from '../utils/nit';
import { useDepartamentos, useMunicipios } from '../hooks/useCatalogos';

/**
 * Par Departamento / Municipio con códigos DANE.
 *   - la lista de municipios se filtra por el departamento elegido
 *   - si no hay departamento y se elige un municipio, se autoselecciona su departamento
 *
 * Props:
 *   - departamento, municipio: códigos DANE ('' si vacío)
 *   - onChange: ({ departamento_dane, municipio_dane }) => void  (envía ambos)
 *   - labels: textos opcionales
 */
const DaneLocationFields = ({ departamento = '', municipio = '', onChange, className = '' }) => {
  const { data: departamentos = [] } = useDepartamentos();
  const { data: municipios = [] } = useMunicipios();

  const deptoOptions = useMemo(
    () => departamentos.map((d) => ({ value: d.codigo_dane, label: titleCase(d.nombre) })),
    [departamentos]
  );
  const muniOptions = useMemo(() => {
    const base = departamento
      ? municipios.filter((m) => m.departamento_codigo === departamento)
      : municipios;
    return base.map((m) => ({ value: m.codigo_dane, label: titleCase(m.nombre), keywords: m.codigo_dane }));
  }, [municipios, departamento]);

  const handleDepartamento = (codigo) => {
    const muniOk =
      municipio &&
      municipios.find((m) => m.codigo_dane === municipio)?.departamento_codigo === codigo;
    onChange({ departamento_dane: codigo, municipio_dane: muniOk ? municipio : '' });
  };

  const handleMunicipio = (codigo) => {
    const muni = municipios.find((m) => m.codigo_dane === codigo);
    onChange({
      departamento_dane: muni ? muni.departamento_codigo : departamento,
      municipio_dane: codigo,
    });
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className}`}>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Departamento</label>
        <SearchableSelect options={deptoOptions} value={departamento} onChange={handleDepartamento} placeholder="Buscar departamento…" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ciudad / Municipio</label>
        <SearchableSelect options={muniOptions} value={municipio} onChange={handleMunicipio} placeholder="Buscar municipio…" />
      </div>
    </div>
  );
};

export default DaneLocationFields;
