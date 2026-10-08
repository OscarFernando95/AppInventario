# Mejoras pendientes

Lista viva de lo que falta. **Cuando algo se implementa, se elimina de aquí.**
(Ya implementado y retirado de esta lista: flujo de caja con PDF, recetas e inventario por ingredientes,
conversión de unidades, gastos, auditoría gerencial, anulación de ventas, stock mínimo y reposición,
cuentas por cobrar y por pagar.)

## Negocio
1. **Devolución parcial.** Hoy solo se anula la venta completa. Falta devolver parte de una venta (1 de 3 ítems),
   ajustando total, inventario y caja, y dejando una nota crédito cuando exista facturación electrónica.
2. **Permisos por usuario.** Hoy hay solo administrador y operativo; un cajero puede ver costos y márgenes
   (Recetas). Definir por usuario quién ve costos, abre caja, anula, etc.
3. **Facturación electrónica real.** Sigue siendo un esqueleto (proveedor tecnológico, resolución DIAN,
   numeración y notas crédito).
4. **Varias sedes o bodegas.** Hoy cada empresa tiene un solo inventario.

## Restaurante
5. **Mesas y cuentas abiertas.** Abrir una cuenta por mesa, agregar pedidos y cobrar al final, con división
   de cuenta y propina.
6. **Comanda a cocina** (pantalla o impresión del pedido).
7. **Informe de desviaciones:** lo que debió gastarse según las recetas contra lo que falta al contar
   (consumo teórico vs. conteo físico).
8. **Domicilios:** solicitudes a través de la app, domiciliarios que aceptan, geolocalización y rastreo en
   tiempo real del domicilio. *(en pausa)*
9. **Preparaciones por lotes:** registrar "hoy preparé 2 litros" con su propio stock (hoy una preparación se
   descuenta al vender el plato que la usa).

## Operación y seguridad
10. **Copias de seguridad automáticas** con una restauración probada.
11. **Segundo factor de autenticación** y registro de inicios de sesión (la auditoría gerencial no muestra
    quién entró ni cuándo).
12. **Recuperar contraseña** (verificar si existe).
13. **Pruebas automáticas en cada cambio** (por ejemplo, GitHub Actions) y fusionar la rama
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
