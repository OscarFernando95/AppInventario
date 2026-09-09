const TtlCache = require('../src/utils/ttlCache');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TtlCache', () => {
  it('devuelve el valor mientras esté fresco', () => {
    const c = new TtlCache(1000);
    c.set('k', 42);
    expect(c.get('k')).toBe(42);
  });

  it('expira la entrada pasado el TTL', () => {
    const c = new TtlCache(1000);
    c.set('k', 42);
    vi.advanceTimersByTime(1001);
    expect(c.get('k')).toBeUndefined();
  });

  it('acepta un TTL por entrada', () => {
    const c = new TtlCache(1000);
    c.set('corta', 1, 100);
    vi.advanceTimersByTime(200);
    expect(c.get('corta')).toBeUndefined();
  });

  it('delete y clear vacían entradas', () => {
    const c = new TtlCache(1000);
    c.set('a', 1);
    c.set('b', 2);
    c.delete('a');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    c.clear();
    expect(c.get('b')).toBeUndefined();
  });

  it('purga todo al superar maxEntries', () => {
    const c = new TtlCache(1000, 2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3); // dispara el clear()
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });
});
