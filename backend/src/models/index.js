const sequelize = require('../config/database');

const Empresa = require('./Empresa');
const Role = require('./Role');
const Usuario = require('./Usuario');
const Modulo = require('./Modulo');
const RolEmpresa = require('./RolEmpresa');
const UsuarioEmpresa = require('./UsuarioEmpresa');
const Departamento = require('./Departamento');
const Municipio = require('./Municipio');
const ActividadCiiu = require('./ActividadCiiu');
const Producto = require('./Producto');
const Proveedor = require('./Proveedor');
const Compra = require('./Compra');
const CompraDetalle = require('./CompraDetalle');
const Venta = require('./Venta');
const VentaDetalle = require('./VentaDetalle');
const Cliente = require('./Cliente');
const Servicio = require('./Servicio');
const Pedido = require('./Pedido');
const PedidoDetalle = require('./PedidoDetalle');
const Sesion = require('./Sesion');
const LogEvento = require('./LogEvento');
const RecetaItem = require('./RecetaItem');
const Caja = require('./Caja');
const AjusteInventario = require('./AjusteInventario');
const Gasto = require('./Gasto');
const AnulacionVenta = require('./AnulacionVenta');
const AbonoVenta = require('./AbonoVenta');
const DevolucionVenta = require('./DevolucionVenta');
const DevolucionVentaDetalle = require('./DevolucionVentaDetalle');
const PagoCompra = require('./PagoCompra');
const CajaMovimiento = require('./CajaMovimiento');
const Modificador = require('./Modificador');
const ModificadorItem = require('./ModificadorItem');

// Relaciones Administrativas
Empresa.belongsToMany(Usuario, { through: UsuarioEmpresa, foreignKey: 'empresaId', otherKey: 'usuarioId' });
Usuario.belongsToMany(Empresa, { through: UsuarioEmpresa, foreignKey: 'usuarioId', otherKey: 'empresaId' });

// Roles propios de cada empresa; el rol de un usuario EN una empresa vive en la tabla de unión.
Empresa.hasMany(RolEmpresa, { foreignKey: 'empresaId', as: 'roles' });
RolEmpresa.belongsTo(Empresa, { foreignKey: 'empresaId' });
RolEmpresa.hasMany(UsuarioEmpresa, { foreignKey: 'rolEmpresaId', as: 'asignaciones' });
UsuarioEmpresa.belongsTo(RolEmpresa, { foreignKey: 'rolEmpresaId', as: 'rolEmpresa' });

Role.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Role, { foreignKey: 'rolId' });

Empresa.belongsToMany(Modulo, { through: 'empresas_modulos', foreignKey: 'empresaId', otherKey: 'moduloId' });
Modulo.belongsToMany(Empresa, { through: 'empresas_modulos', foreignKey: 'moduloId', otherKey: 'empresaId' });

// Relaciones Transaccionales
Empresa.hasMany(Producto, { foreignKey: 'empresaId' });
Producto.belongsTo(Empresa, { foreignKey: 'empresaId' });

Empresa.hasMany(Proveedor, { foreignKey: 'empresaId' });
Proveedor.belongsTo(Empresa, { foreignKey: 'empresaId' });

Empresa.hasMany(Compra, { foreignKey: 'empresaId' });
Compra.belongsTo(Empresa, { foreignKey: 'empresaId' });
Proveedor.hasMany(Compra, { foreignKey: 'proveedorId' });
Compra.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
Usuario.hasMany(Compra, { foreignKey: 'usuarioId' });
Compra.belongsTo(Usuario, { foreignKey: 'usuarioId' });

Compra.hasMany(CompraDetalle, { foreignKey: 'compraId' });
CompraDetalle.belongsTo(Compra, { foreignKey: 'compraId' });
Producto.hasMany(CompraDetalle, { foreignKey: 'productoId' });
CompraDetalle.belongsTo(Producto, { foreignKey: 'productoId' });

Empresa.hasMany(Pedido, { foreignKey: 'empresaId' });
Pedido.belongsTo(Empresa, { foreignKey: 'empresaId' });
Proveedor.hasMany(Pedido, { foreignKey: 'proveedorId' });
Pedido.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
Usuario.hasMany(Pedido, { foreignKey: 'usuarioId' });
Pedido.belongsTo(Usuario, { foreignKey: 'usuarioId' });

Pedido.hasMany(PedidoDetalle, { foreignKey: 'pedidoId' });
PedidoDetalle.belongsTo(Pedido, { foreignKey: 'pedidoId' });
Producto.hasMany(PedidoDetalle, { foreignKey: 'productoId' });
PedidoDetalle.belongsTo(Producto, { foreignKey: 'productoId' });

// La recepción de un pedido genera una compra (trazabilidad).
Pedido.hasMany(Compra, { foreignKey: 'pedidoId' });
Compra.belongsTo(Pedido, { foreignKey: 'pedidoId' });

Usuario.hasMany(Sesion, { foreignKey: 'usuarioId' });
Sesion.belongsTo(Usuario, { foreignKey: 'usuarioId' });

Empresa.hasMany(Cliente, { foreignKey: 'empresaId' });
Cliente.belongsTo(Empresa, { foreignKey: 'empresaId' });

Empresa.hasMany(Servicio, { foreignKey: 'empresaId' });
Servicio.belongsTo(Empresa, { foreignKey: 'empresaId' });

Empresa.hasMany(Venta, { foreignKey: 'empresaId' });
Venta.belongsTo(Empresa, { foreignKey: 'empresaId' });
Usuario.hasMany(Venta, { foreignKey: 'usuarioId' });
Venta.belongsTo(Usuario, { foreignKey: 'usuarioId' });
Cliente.hasMany(Venta, { foreignKey: 'clienteId' });
Venta.belongsTo(Cliente, { foreignKey: 'clienteId' });

Venta.hasMany(VentaDetalle, { foreignKey: 'ventaId' });
VentaDetalle.belongsTo(Venta, { foreignKey: 'ventaId' });
Producto.hasMany(VentaDetalle, { foreignKey: 'productoId' });
VentaDetalle.belongsTo(Producto, { foreignKey: 'productoId' });
Servicio.hasMany(VentaDetalle, { foreignKey: 'servicioId' });
VentaDetalle.belongsTo(Servicio, { foreignKey: 'servicioId' });

// Receta de un plato: productoId = plato, insumoId = ingrediente.
Producto.hasMany(RecetaItem, { foreignKey: 'productoId', as: 'receta' });
RecetaItem.belongsTo(Producto, { foreignKey: 'productoId', as: 'plato' });
RecetaItem.belongsTo(Producto, { foreignKey: 'insumoId', as: 'insumo' });

// Caja (turno de un usuario) y las ventas registradas en ella.
Empresa.hasMany(Caja, { foreignKey: 'empresaId' });
Caja.belongsTo(Empresa, { foreignKey: 'empresaId' });
Caja.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Caja.belongsTo(Usuario, { foreignKey: 'usuarioCierreId', as: 'usuarioCierre' });
Caja.hasMany(Venta, { foreignKey: 'cajaId' });
Venta.belongsTo(Caja, { foreignKey: 'cajaId' });

// Ajustes manuales de inventario (merma, vencido, conteo).
Empresa.hasMany(AjusteInventario, { foreignKey: 'empresaId' });
AjusteInventario.belongsTo(Empresa, { foreignKey: 'empresaId' });
Producto.hasMany(AjusteInventario, { foreignKey: 'productoId' });
AjusteInventario.belongsTo(Producto, { foreignKey: 'productoId' });
AjusteInventario.belongsTo(Usuario, { foreignKey: 'usuarioId' });

// Gastos operativos y egresos de caja.
Empresa.hasMany(Gasto, { foreignKey: 'empresaId' });
Gasto.belongsTo(Empresa, { foreignKey: 'empresaId' });
Gasto.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Gasto.belongsTo(Proveedor, { foreignKey: 'proveedorId' });
Caja.hasMany(CajaMovimiento, { foreignKey: 'cajaId', as: 'movimientos' });
CajaMovimiento.belongsTo(Caja, { foreignKey: 'cajaId' });
CajaMovimiento.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// Solicitudes de anulación de ventas.
Venta.hasMany(AnulacionVenta, { foreignKey: 'ventaId', as: 'anulaciones' });
AnulacionVenta.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
AnulacionVenta.belongsTo(Usuario, { foreignKey: 'solicitada_por', as: 'solicitante' });
AnulacionVenta.belongsTo(Usuario, { foreignKey: 'resuelta_por', as: 'resolutor' });
Venta.belongsTo(Usuario, { foreignKey: 'anulada_por', as: 'anuladaPor' });

// Cartera: abonos de clientes sobre ventas a crédito y pagos a proveedores sobre compras a crédito.
Venta.hasMany(AbonoVenta, { foreignKey: 'ventaId', as: 'abonos' });
AbonoVenta.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
AbonoVenta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Compra.hasMany(PagoCompra, { foreignKey: 'compraId', as: 'pagos' });
PagoCompra.belongsTo(Compra, { foreignKey: 'compraId', as: 'compra' });
PagoCompra.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// Devoluciones parciales de ventas.
Venta.hasMany(DevolucionVenta, { foreignKey: 'ventaId', as: 'devoluciones' });
DevolucionVenta.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
DevolucionVenta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
DevolucionVenta.hasMany(DevolucionVentaDetalle, { foreignKey: 'devolucionId', as: 'detalles' });
DevolucionVentaDetalle.belongsTo(DevolucionVenta, { foreignKey: 'devolucionId' });
DevolucionVentaDetalle.belongsTo(VentaDetalle, { foreignKey: 'ventaDetalleId', as: 'linea' });

// Modificadores de platos.
Empresa.hasMany(Modificador, { foreignKey: 'empresaId' });
Modificador.belongsTo(Empresa, { foreignKey: 'empresaId' });
Modificador.hasMany(ModificadorItem, { foreignKey: 'modificadorId', as: 'items' });
ModificadorItem.belongsTo(Modificador, { foreignKey: 'modificadorId' });
ModificadorItem.belongsTo(Producto, { foreignKey: 'insumoId', as: 'insumo' });

// Solo de lectura desde el backoffice (ver logController) — belongsTo basta,
// no hace falta el lado hasMany en Usuario/Empresa.
Usuario.hasMany(LogEvento, { foreignKey: 'usuarioId' });
LogEvento.belongsTo(Usuario, { foreignKey: 'usuarioId' });
Empresa.hasMany(LogEvento, { foreignKey: 'empresaId' });
LogEvento.belongsTo(Empresa, { foreignKey: 'empresaId' });

module.exports = {
  sequelize, Empresa, Role, Usuario, Modulo, Departamento, Municipio, ActividadCiiu, Sesion,
  Producto, Proveedor, Cliente, Servicio, Compra, CompraDetalle, Venta, VentaDetalle, Pedido, PedidoDetalle,
  LogEvento, RecetaItem, Caja, AjusteInventario, Modificador, ModificadorItem, Gasto, CajaMovimiento, AnulacionVenta, AbonoVenta, PagoCompra, DevolucionVenta, DevolucionVentaDetalle, RolEmpresa, UsuarioEmpresa,
};
