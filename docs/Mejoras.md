# Mejoras pendientes

## Restaurante
1. **Mesas y cocina, siguiente nivel:** unir o dividir cuentas entre mesas, reservas, y avisar al mesero (sonido o
   notificación) cuando cocina marque una comanda como lista.
2. **Propinas:** reparto automático entre el personal (hoy solo se registra y se entrega el total) y propina
   sugerida configurable por empresa (hoy 5 % / 10 % / otro valor).
3. **Desviaciones:** alerta automática cuando el faltante de un producto supera un porcentaje, y comparar contra
   el conteo anterior (hoy se comparan el consumo y los conteos del mismo rango de fechas).
4. **Producción por lotes:** vencimiento del lote y sugerir cuánto producir según las ventas de los últimos días.

## Operación y seguridad
6. **Copias de seguridad automáticas** con una restauración probada.
7. **Segundo factor de autenticación** y registro de inicios de sesión (la auditoría gerencial no muestra
    quién entró ni cuándo).
8. **Recuperar contraseña** (verificar si existe).
9. **Pruebas automáticas en cada cambio** (por ejemplo, GitHub Actions) y fusionar la rama
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
