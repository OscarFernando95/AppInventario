# Datos de referencia (catálogos)

Estos archivos se usan una sola vez, desde el seeder
`20260909120100-catalogos-dane-ciiu.js`, para poblar las tablas
`departamentos`, `municipios` y `actividades_ciiu`.

## `divipola.json` — División Político-Administrativa de Colombia (DANE)

- **Origen:** <https://github.com/RafaelRamosR/dane-codigos-municipios>
  (`resources/source_data.json`), a su vez tomado de Datos Abiertos Colombia
  (DANE, DIVIPOLA).
- **Contenido:** 33 departamentos, 1123 municipios.
- **Formato:** array de `{ region, departamento, municipio, departamentoDANE, municipioDANE }`.
  `departamentoDANE` = 2 dígitos, `municipioDANE` = 5 dígitos.

## `ciiu-rev4ac.json` — Clasificación Industrial Internacional Uniforme, Rev. 4 A.C.

- **Origen:** <https://github.com/Startup-Colombia/CIIU> (`CIIU.json`),
  basado en la publicación del DANE "CIIU Rev. 4 adaptada para Colombia".
- **Contenido:** 21 secciones → divisiones → grupos → 504 clases (código de 4 dígitos).
- **Formato:** objeto anidado
  `seccion -> { titulo, divisiones: { division -> { titulo, subdivisiones: { grupo -> { titulo, actividades: { codigo4: descripcion } } } } } }`.

Si en el futuro hay que actualizar la nomenclatura, reemplazar el archivo y crear
un nuevo seeder que haga `upsert` (los seeders ya ejecutados no se repiten).
