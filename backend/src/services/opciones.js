'use strict';

/**
 * Opciones por empresa (interruptores de funciones), lógica pura.
 *
 * Regla de oro: toda función nueva de restaurante/cafetería nace APAGADA (`defecto: false`), así una empresa de
 * comercio —o un restaurante que no la quiera— sigue exactamente como estaba. Las funciones que ya existían antes de
 * tener interruptor nacen ENCENDIDAS para no quitarle nada a nadie.
 *
 * Cada opción puede:
 *   - `modulos`: aplicar solo si la empresa tiene alguno de esos módulos (si no, vale como apagada y ni se muestra);
 *   - `requiere`: depender de otras opciones (si alguna está apagada, esta también lo está).
 *
 * Tipos: 'bool', 'int' ({ min, max }) y 'lista' (textos cortos; { max, largo }).
 */

// Módulos que hacen que una empresa sea de restaurante / cafetería (el comercio puro no tiene ninguno).
const MENU = ['Mesas', 'Recetas'];

const OPCIONES = [
  // ── Mesas y reservas (ya existían: encendidas) ─────────────────────────────────────────────
  { clave: 'reservas', grupo: 'Mesas', tipo: 'bool', defecto: true, modulos: ['Mesas'], etiqueta: 'Reservas', descripcion: 'Registrar reservas de mesa, recordarlas por WhatsApp y sentarlas al llegar.' },
  { clave: 'plano', grupo: 'Mesas', tipo: 'bool', defecto: true, modulos: ['Mesas'], etiqueta: 'Plano del local', descripcion: 'Ver y acomodar las mesas en un plano, además de las tarjetas.' },
  { clave: 'unir_cuentas', grupo: 'Mesas', tipo: 'bool', defecto: true, modulos: ['Mesas'], etiqueta: 'Unir cuentas', descripcion: 'Juntar la cuenta de dos mesas en una.' },
  { clave: 'cuenta_por_persona', grupo: 'Mesas', tipo: 'bool', defecto: true, modulos: ['Mesas'], etiqueta: 'Pedir y cobrar por persona', descripcion: 'Asignar cada pedido a una persona de la mesa y cobrarle a cada quien lo suyo.' },
  { clave: 'propina', grupo: 'Mesas', tipo: 'bool', defecto: true, modulos: ['Mesas'], etiqueta: 'Propina al cobrar', descripcion: 'Ofrecer la propina voluntaria al cobrar una cuenta de mesa.' },

  // ── Menú (nuevas: apagadas). Aplican a empresas con Mesas o Recetas (restaurante / cafetería), no a comercio puro ──
  { clave: 'menu_categorias', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: MENU, etiqueta: 'Categorías del menú', descripcion: 'Agrupar los productos en categorías (entradas, bebidas, postres…) con orden propio, en el catálogo del mesero y del mostrador.' },
  { clave: 'menu_fotos', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: MENU, etiqueta: 'Fotos de los platos', descripcion: 'Mostrar una foto pequeña de cada plato o producto en el catálogo.' },
  { clave: 'agotados_manuales', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: MENU, etiqueta: 'Agotado por hoy', descripcion: 'Marcar a mano un plato como agotado: no se puede pedir ni vender hasta mañana.' },
  { clave: 'precios_horario', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: MENU, etiqueta: 'Precios por horario', descripcion: 'Happy hour y ofertas por día y hora: el precio baja solo mientras la oferta rige.' },
  { clave: 'modificadores_grupos', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: ['Recetas'], etiqueta: 'Grupos de modificadores obligatorios', descripcion: 'Agrupar los extras en grupos (punto de cocción, tipo de leche, tamaño) y exigir que se elija uno antes de pedir el plato.' },
  { clave: 'combos', grupo: 'Menú', tipo: 'bool', defecto: false, modulos: MENU, etiqueta: 'Combos', descripcion: 'Vender varios productos juntos a un precio (café + croissant): descuenta el inventario de cada componente.' },
  // ── Lista de espera, bloqueos, ocupación y calendario (nuevas: nacen apagadas) ─────────────
  { clave: 'lista_espera', grupo: 'Mesas', tipo: 'bool', defecto: false, modulos: ['Mesas'], etiqueta: 'Lista de espera', descripcion: 'Anotar a los clientes sin reserva que esperan mesa, avisarles por WhatsApp y sentarlos cuando se libere una.' },
  { clave: 'bloqueo_mesas', grupo: 'Mesas', tipo: 'bool', defecto: false, modulos: ['Mesas'], etiqueta: 'Bloqueo de mesas', descripcion: 'Sacar una mesa de servicio por un rato (evento, mantenimiento): no se puede abrir cuenta ni reservarla.' },
  { clave: 'tiempo_ocupacion', grupo: 'Mesas', tipo: 'bool', defecto: false, modulos: ['Mesas'], etiqueta: 'Tiempo de ocupación', descripcion: 'Informe de cuánto dura cada mesa ocupada y cuántas veces rota por día.' },
  { clave: 'reservas_calendario', grupo: 'Mesas', tipo: 'bool', defecto: false, modulos: ['Mesas'], requiere: ['reservas'], etiqueta: 'Calendario de reservas', descripcion: 'Ver las reservas de cualquier día y de la semana completa, no solo las de hoy.' },
  // ── Cocina y servicio (nuevas: apagadas) ───────────────────────────────────────────────────
  { clave: 'tiempos_servicio', grupo: 'Cocina y servicio', tipo: 'bool', defecto: false, modulos: ['Mesas'], etiqueta: 'Pedir por tiempos', descripcion: 'Pedir entrada, plato fuerte y postre en la misma cuenta y enviar a cocina cada tiempo cuando el cliente lo pida.' },
  { clave: 'tiempos_nombres', grupo: 'Cocina y servicio', tipo: 'lista', defecto: ['Entrada', 'Plato fuerte', 'Postre'], max: 4, largo: 20, modulos: ['Mesas'], requiere: ['tiempos_servicio'], etiqueta: 'Nombres de los tiempos', descripcion: 'Cómo se llama cada tiempo de servicio, en orden (hasta 4).' },
  { clave: 'cocina_alertas', grupo: 'Cocina y servicio', tipo: 'bool', defecto: false, modulos: ['Cocina'], etiqueta: 'Alertas de demora en cocina', descripcion: 'Marcar en amarillo y en rojo las comandas que se demoran, con tus propios minutos y un tiempo objetivo por plato.' },
  { clave: 'cocina_amarillo_min', grupo: 'Cocina y servicio', tipo: 'int', defecto: 10, min: 1, max: 120, modulos: ['Cocina'], requiere: ['cocina_alertas'], etiqueta: 'Minutos para marcar en amarillo', descripcion: 'Una comanda pendiente pasa a amarillo cuando lleva esta cantidad de minutos.' },
  { clave: 'cocina_rojo_min', grupo: 'Cocina y servicio', tipo: 'int', defecto: 20, min: 1, max: 240, modulos: ['Cocina'], requiere: ['cocina_alertas'], etiqueta: 'Minutos para marcar en rojo', descripcion: 'Una comanda pendiente pasa a rojo cuando lleva esta cantidad de minutos (más que los del amarillo).' },
  { clave: 'cocina_sonido', grupo: 'Cocina y servicio', tipo: 'bool', defecto: false, modulos: ['Cocina'], etiqueta: 'Sonido cuando llega una comanda nueva', descripcion: 'La pantalla de Cocina suena y avisa cuando entra una comanda pendiente (cada dispositivo puede silenciarlo).' },
];

const POR_CLAVE = new Map(OPCIONES.map((o) => [o.clave, o]));

/** Perfiles: conjuntos de opciones listos para aplicar (los que no aparecen quedan en su valor por omisión). */
const PERFILES = [
  { clave: 'minimo', etiqueta: 'Lo básico', descripcion: 'Todo lo opcional apagado.', valores: { reservas: false, plano: false, unir_cuentas: false, cuenta_por_persona: false, propina: false } },
  { clave: 'cafeteria', etiqueta: 'Cafetería (mostrador)', descripcion: 'Para atender rápido en mostrador, con poco o ningún servicio a mesa.', valores: { reservas: false, plano: false, unir_cuentas: false, cuenta_por_persona: false, propina: true } },
  { clave: 'restaurante', etiqueta: 'Restaurante completo', descripcion: 'Servicio a mesa con todo lo disponible.', valores: {} },
];

const esEntero = (v) => Number.isInteger(v);

/** Valida el valor de una opción según su tipo; devuelve el valor normalizado o lanza Error con un mensaje legible. */
function validarValor(def, v) {
  if (def.tipo === 'bool') {
    if (typeof v !== 'boolean') throw new Error(`«${def.etiqueta}» debe ser sí o no.`);
    return v;
  }
  if (def.tipo === 'int') {
    if (!esEntero(v) || v < def.min || v > def.max) throw new Error(`«${def.etiqueta}» debe ser un número entero entre ${def.min} y ${def.max}.`);
    return v;
  }
  if (def.tipo === 'lista') {
    if (!Array.isArray(v) || v.length < 1 || v.length > def.max) throw new Error(`«${def.etiqueta}» necesita entre 1 y ${def.max} elementos.`);
    const limpios = v.map((x) => String(x).trim());
    if (limpios.some((x) => !x || x.length > def.largo)) throw new Error(`Cada elemento de «${def.etiqueta}» debe tener entre 1 y ${def.largo} letras.`);
    if (new Set(limpios.map((x) => x.toLowerCase())).size !== limpios.length) throw new Error(`«${def.etiqueta}» tiene elementos repetidos.`);
    return limpios;
  }
  throw new Error('Tipo de opción desconocido.');
}

/** ¿La empresa puede usar la opción (tiene alguno de sus módulos)? Sin `modulos` aplica a todas. */
const aplica = (def, modulosEmpresa) => !def.modulos || def.modulos.some((m) => modulosEmpresa.includes(m));

/**
 * Valor EFECTIVO de cada opción para una empresa: lo guardado (o el valor por omisión), apagado si no aplica por sus
 * módulos o si alguna opción de la que depende está apagada.
 */
function efectivas(guardadas = {}, modulosEmpresa = []) {
  const crudo = {};
  for (const o of OPCIONES) crudo[o.clave] = Object.prototype.hasOwnProperty.call(guardadas, o.clave) ? guardadas[o.clave] : o.defecto;

  const resultado = {};
  const calcular = (o, pila = []) => {
    if (o.clave in resultado) return resultado[o.clave];
    let v = crudo[o.clave];
    const apagada = !aplica(o, modulosEmpresa) || (o.requiere || []).some((r) => !POR_CLAVE.has(r) || pila.includes(r) || !calcular(POR_CLAVE.get(r), [...pila, o.clave]));
    if (apagada) v = o.tipo === 'bool' ? false : o.defecto;
    resultado[o.clave] = v;
    return v;
  };
  OPCIONES.forEach((o) => calcular(o));
  return resultado;
}

/** Reglas entre dos opciones (solo se revisan si el cambio toca alguna de ellas). */
function validarCruzadas(nuevas, cambios) {
  if ('cocina_amarillo_min' in cambios || 'cocina_rojo_min' in cambios) {
    const amarillo = nuevas.cocina_amarillo_min ?? POR_CLAVE.get('cocina_amarillo_min').defecto;
    const rojo = nuevas.cocina_rojo_min ?? POR_CLAVE.get('cocina_rojo_min').defecto;
    if (!(rojo > amarillo)) {
      throw new Error(`Los minutos del rojo (${rojo}) deben ser más que los del amarillo (${amarillo}): primero sube el rojo y luego el amarillo.`);
    }
  }
}

/**
 * Aplica cambios a lo guardado. `cambios` = { clave: valor }. Devuelve lo nuevo a guardar o lanza Error si hay una
 * clave desconocida, un valor inválido o se enciende algo cuyas dependencias están apagadas.
 */
function aplicarCambios(guardadas = {}, cambios = {}, modulosEmpresa = []) {
  const nuevas = { ...guardadas };
  for (const [clave, valor] of Object.entries(cambios)) {
    const def = POR_CLAVE.get(clave);
    if (!def) throw new Error(`La opción «${clave}» no existe.`);
    if (!aplica(def, modulosEmpresa)) throw new Error(`«${def.etiqueta}» necesita el módulo ${def.modulos.join(' o ')}.`);
    nuevas[clave] = validarValor(def, valor);
  }
  const ef = efectivas(nuevas, modulosEmpresa);
  for (const clave of Object.keys(cambios)) {
    const def = POR_CLAVE.get(clave);
    // Encender algo (o ajustar un número / una lista) exige que lo que necesita esté activado.
    if ((def.tipo !== 'bool' || cambios[clave] === true) && (def.requiere || []).some((r) => !ef[r])) {
      const falta = def.requiere.find((r) => !ef[r]);
      throw new Error(`«${def.etiqueta}» necesita que esté activada «${POR_CLAVE.get(falta)?.etiqueta || falta}».`);
    }
  }
  validarCruzadas(nuevas, cambios);
  return nuevas;
}

/** Valores guardados que resultan de aplicar un perfil (reemplaza lo anterior). */
function valoresDePerfil(clavePerfil, modulosEmpresa = []) {
  const perfil = PERFILES.find((p) => p.clave === clavePerfil);
  if (!perfil) throw new Error(`El perfil «${clavePerfil}» no existe.`);
  // Solo las opciones que aplican a esta empresa (las demás se ignoran sin error).
  const aplicables = Object.fromEntries(Object.entries(perfil.valores).filter(([c]) => POR_CLAVE.has(c) && aplica(POR_CLAVE.get(c), modulosEmpresa)));
  return aplicarCambios({}, aplicables, modulosEmpresa);
}

/** Catálogo que ve la pantalla de opciones: solo lo que aplica a los módulos de la empresa. */
function catalogoPara(modulosEmpresa = []) {
  return OPCIONES.filter((o) => aplica(o, modulosEmpresa)).map((o) => ({ ...o }));
}

module.exports = { OPCIONES, PERFILES, efectivas, aplicarCambios, valoresDePerfil, catalogoPara, validarValor };
