// Códigos DIAN de forma y medio de pago usados en el POS.
export const MEDIOS_PAGO = {
  '10': 'Efectivo',
  '42': 'Consignación bancaria',
  '48': 'Tarjeta crédito',
  '49': 'Tarjeta débito',
  '47': 'Transferencia débito',
};

/** 'Efectivo', 'Tarjeta débito'… y, si fue a crédito, lo indica. */
export const etiquetaPago = (forma, medio) => {
  const nombre = MEDIOS_PAGO[String(medio)] || `Medio ${medio}`;
  return String(forma) === '2' ? `Crédito (${nombre})` : nombre;
};
