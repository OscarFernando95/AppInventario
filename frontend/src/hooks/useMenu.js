import { useOpciones } from './useOpciones';
import { useEmpresaQuery } from './useEmpresaQuery';

/**
 * Lo que necesitan los catálogos (mesero y mostrador) del menú: qué funciones de menú están encendidas, las categorías
 * y las fotos. Cada dato solo se pide si su opción está encendida (apagadas, no hay ninguna petición extra).
 */
export function useMenu() {
  const { opcion } = useOpciones();
  const conCategorias = opcion('menu_categorias');
  const conFotos = opcion('menu_fotos');
  const conAgotados = opcion('agotados_manuales');
  const conOfertas = opcion('precios_horario');
  const { data: categorias = [] } = useEmpresaQuery(['menu', 'categorias'], '/menu/categorias', { enabled: conCategorias });
  const { data: imagenes = {} } = useEmpresaQuery(['menu', 'imagenes'], '/menu/imagenes', { enabled: conFotos, staleTime: 5 * 60_000 });
  return { conCategorias, conFotos, conAgotados, conOfertas, categorias, imagenes };
}
