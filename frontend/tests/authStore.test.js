import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../src/store/authStore';

const usuario = (modulos) => ({
  id: 1, nombre: 'Ana', username: 'ana', rol: 'FRONT_ADMIN', mustChangePassword: false,
  empresas: [{ id: 7, nombre: 'Café', tipo_negocio: 'RESTAURANTE', modulos }],
});

describe('authStore.syncSesion', () => {
  beforeEach(() => {
    useAuthStore.getState().login(usuario(['Inventario', 'Ventas', 'Clientes', 'Caja']));
  });

  it('refleja al instante un módulo quitado (ya no obliga a abrir caja)', () => {
    expect(useAuthStore.getState().activeEmpresa.modulos).toContain('Caja');
    useAuthStore.getState().syncSesion(usuario(['Inventario', 'Ventas', 'Clientes']));
    const { activeEmpresa, user } = useAuthStore.getState();
    expect(activeEmpresa.modulos).not.toContain('Caja');
    expect(user.empresas[0].modulos).not.toContain('Caja');
    expect(activeEmpresa.id).toBe(7);
  });

  it('refleja un módulo nuevo', () => {
    useAuthStore.getState().syncSesion(usuario(['Inventario', 'Ventas', 'Clientes', 'Caja', 'Gastos']));
    expect(useAuthStore.getState().activeEmpresa.modulos).toContain('Gastos');
  });

  it('si nada cambió, no reemplaza el estado (sin renders de más)', () => {
    const antes = useAuthStore.getState();
    useAuthStore.getState().syncSesion(usuario(['Inventario', 'Ventas', 'Clientes', 'Caja']));
    expect(useAuthStore.getState()).toBe(antes);
  });

  it('si el usuario pierde acceso a la empresa activa, la deja en null', () => {
    useAuthStore.getState().syncSesion({ ...usuario([]), empresas: [] });
    expect(useAuthStore.getState().activeEmpresa).toBeNull();
  });

  it('actualiza el rol si cambió', () => {
    useAuthStore.getState().syncSesion({ ...usuario(['Inventario', 'Ventas', 'Clientes', 'Caja']), rol: 'FRONT_USER' });
    expect(useAuthStore.getState().user.rol).toBe('FRONT_USER');
  });
});
