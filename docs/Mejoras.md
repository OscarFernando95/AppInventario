# Mejoras pendientes

## Restaurante
Lista completa de lo que falta alrededor de mesas, cocina, inventario y reportes (agrupada por tema para elegir).

### Sala y servicio
Lo de menú, tiempos de servicio, lista de espera, reservas por día/semana, bloqueos, ocupación, pre-cuenta, cuenta a nombre de
cliente, pedido numerado y venta de mostrador ya está hecho (cada uno con su interruptor en **Opciones**). Falta:
- **Autopedido por QR:** que el cliente pida desde su celular escaneando el código de la mesa (el mesero aprueba o va directo a cocina).
- **Menú del día / rotativo:** platos que solo se ofrecen ciertos días o franjas, y programar con anticipación el agotado.
- **Ofertas por horario más finas:** por día de la semana y fechas (festivos), y 2×1 o «lleva 3 paga 2», no solo porcentaje.
- **Agotado automático:** marcar «agotado» solo cuando el inventario no alcanza para la receta (hoy se calcula al mostrar, pero no avisa).
- **Pantalla de turnos para el cliente** (cafetería): «Pedido 12 listo», con la tablet o TV del mostrador.
- **Pre-cuenta digital:** enviarla por WhatsApp/correo o mostrarla con un QR de pago, y dividirla por propina.
- **Cargo a habitación / cuenta corriente:** acumular varias cuentas de un mismo cliente o habitación y cobrarlas juntas al final.
- **Tablet del mesero:** revisión de tamaños táctiles y de gestos (arrastrar en el plano) en dispositivos reales.

### Cobro e impuestos
- **Impuesto al consumo (INC 8 %)** además del IVA, que es lo que cobran muchos restaurantes en Colombia.
- **Cortesías y descuentos por ítem** con motivo y permiso propio (hoy el descuento es global al cobrar).
- **Pagos mixtos** en una misma venta (parte en efectivo, parte con tarjeta) y propina cobrada por datáfono.
- **Domicilios y para llevar** con dirección, costo de envío, domiciliario y estado del pedido (se dejó en pausa).
- **Tiquete térmico de 80 mm y cajón monedero**; imprimir cada comanda directo en la impresora de su estación, sin el diálogo
  del navegador (depende de la marca y modelo de la impresora).

### Inventario y costos
- **Rendimiento y merma de limpieza** en las recetas (peso bruto vs. neto: el kilo de pollo que rinde 700 g), y alérgenos por plato.
- **Bodegas por estación** (cocina, barra, bodega) con traslados entre ellas.
- **Conteo cíclico:** sugerir cada semana qué contar (lo que más se pierde o más cuesta), hoja de conteo imprimible y lector de código de barras.
- **Vencimiento de los insumos que se compran** (no solo de las preparaciones) y gastar primero lo que vence antes.
- **Historial de precios por proveedor:** comparar compras y avisar cuando sube el costo de un ingrediente.
- **Lotes:** que el sistema guarde de qué lote salió cada consumo (hoy se asume que se gasta primero el más viejo, que coincide con
  lo registrado mientras no haya devoluciones ni ajustes de conteo).

### Personal y propinas
- **Turnos y asistencia** para repartir propinas por horas trabajadas de verdad (hoy: pesos por persona y «trabajó hoy»), comisiones
  por ventas y propinas por mesero en los informes.

### Informes de restaurante
- **Ingeniería de menú** (platos estrella, populares, a revisar), ticket promedio, rotación de mesas, ventas por hora y por mesero,
  comparativo con el mes anterior y resumen diario para el dueño.

### Automatización
- **Envío automático** de recordatorios de reserva y alertas de desviación por WhatsApp (API de WhatsApp Business) o correo (SMTP):
  hoy el sistema deja el mensaje listo y la persona pulsa «enviar». Requiere contratar y configurar el proveedor.
- **Funcionar sin internet** (modo offline del tablero de mesas con cola de pedidos).

## Operación y seguridad
1. **Copias de seguridad automáticas** con una restauración probada.
2. **Segundo factor de autenticación** y registro de inicios de sesión (la auditoría gerencial no muestra
   quién entró ni cuándo).
3. **Recuperar contraseña** (verificar si existe).
4. **Pruebas automáticas en cada cambio** (por ejemplo, GitHub Actions) y fusionar la rama
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
- **Pantalla en tablet o celular:** las pruebas de navegador corren en pantalla de escritorio (y una de tablet para las mesas); revisar el POS y el resto de pantallas en tablet.
- **Catálogos grandes:** la lista de productos se carga completa; paginarla si hay miles.
