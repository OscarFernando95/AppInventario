# Mejoras pendientes

## Restaurante
Lista completa de lo que falta alrededor de mesas, cocina, inventario y reportes (agrupada por tema para elegir).

### Sala y servicio
- **Menú del mesero:** categorías (entradas, fuertes, bebidas…) y orden propio en vez de una lista con búsqueda; foto del plato;
  marcar un plato «agotado por hoy» a mano; modificadores obligatorios (punto de cocción, término); combos y menú del día;
  precios por horario (happy hour).
- **Tiempos de servicio:** pedir por tiempos (entrada, fuerte, postre) y «disparar» el siguiente cuando el cliente lo pida; alerta en
  cocina cuando un plato supera su tiempo objetivo; sonido en cocina cuando llega una comanda nueva.
- **Pedir desde el celular o tablet del mesero** (revisar el uso táctil) y, más adelante, que el cliente pida escaneando un QR de la mesa.
- **Lista de espera** (clientes sin reserva), vista de reservas por día y semana, bloqueo de mesas y tiempo promedio de ocupación.
- **Pre-cuenta imprimible** («la cuenta, por favor») sin cobrar, y cuenta a nombre de un cliente o habitación.

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
- **Pantalla en tablet o celular:** las pruebas de navegador solo corren en pantalla grande; revisar el POS en tablet.
- **Catálogos grandes:** la lista de productos se carga completa; paginarla si hay miles.
