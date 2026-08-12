const sequelize = require('../config/database');

const Empresa = require('./Empresa');
const Role = require('./Role');
const Usuario = require('./Usuario');
const Modulo = require('./Modulo');
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

// Relaciones Administrativas
Empresa.belongsToMany(Usuario, { through: 'usuarios_empresas', foreignKey: 'empresaId' });
Usuario.belongsToMany(Empresa, { through: 'usuarios_empresas', foreignKey: 'usuarioId' });

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

module.exports = {
  sequelize, Empresa, Role, Usuario, Modulo, Producto, Proveedor, Cliente, Servicio, Compra, CompraDetalle, Venta, VentaDetalle, Pedido, PedidoDetalle
};
