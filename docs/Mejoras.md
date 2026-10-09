# Mejoras pendientes

## Restaurante
1. **Estaciones en las comandas:** enviar cada ítem a su estación (cocina, barra, postres) en vez de una sola
   pantalla; y que las comandas de una cuenta ya cobrada salgan solas de la pantalla de cocina.
2. **Cuenta por comensal:** asignar cada ítem a una persona de la mesa para que la división sea automática.
3. **Propinas:** reparto por reglas (por rol o por turno trabajado) en lugar de elegir a mano las partes.
4. **Desviaciones:** avisar por correo o WhatsApp cuando salte una alerta, y un ranking de los productos que más
   dinero pierden en el mes.
5. **Lotes:** descontar de verdad el lote más viejo primero (hoy se estima) y etiquetas imprimibles con la
   fecha de vencimiento.
6. **Reservas:** recordatorio por WhatsApp a quien reservó y vista de plano del local.

## Operación y seguridad
7. **Copias de seguridad automáticas** con una restauración probada.
8. **Segundo factor de autenticación** y registro de inicios de sesión (la auditoría gerencial no muestra
     quién entró ni cuándo).
9. **Recuperar contraseña** (verificar si existe).
10. **Pruebas automáticas en cada cambio** (por ejemplo, GitHub Actions) y fusionar la rama
     `feature/restaurantes-caja-gastos` a `main`.

## Pendientes pequeños
- **Cartera:** abono "global" de un cliente que se reparte entre sus facturas más antiguas (hoy se abona factura por
  factura); recordatorios de cobro (WhatsApp o correo) y aviso de vencimientos próximos; carga inicial de la cartera
  anterior al sistema; intereses por mora; comprobante de abono en PDF; gastos por pagar (un recibo que se paga luego).
- **Importación desde Excel:** sin columnas de tipo, costo, presentación ni stock mínimo.
- **Gastos:** no se pueden editar (solo anular); sin gastos recurrentes (arriendo el día 5 de cada mes).
- **Retiros de caja:** sin destino (consignar al banco vs. llevárselo el dueño); hoy ambos bajan el "dinero de la empresa".
- **Informes:** exportar a Excel, gráficos (ventas por hora y por día, platos más rentables) y comparativos
  contra el mes anterior.
- **Tiquete térmico con cajón monedero** (depende de la marca y el modelo de la impresora y del cajón).
- **Pantalla en tablet o celular:** las pruebas de navegador solo corren en pantalla grande; revisar el POS en tablet.
- **Catálogos grandes:** la lista de productos se carga completa; paginarla si hay miles.
