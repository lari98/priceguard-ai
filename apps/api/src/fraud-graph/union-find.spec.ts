import { UnionFind } from './union-find';

describe('UnionFind', () => {
  it('groups directly and transitively connected ids into one component', () => {
    const uf = new UnionFind();
    uf.union('a', 'b');
    uf.union('b', 'c'); // transitively connects a-b-c
    uf.add('d'); // isolated

    const components = uf.getComponents().map((c) => c.sort());
    expect(components).toContainEqual(['a', 'b', 'c']);
    expect(components).toContainEqual(['d']);
  });

  it('keeps unconnected ids in separate components', () => {
    const uf = new UnionFind();
    uf.union('x', 'y');
    uf.union('p', 'q');

    expect(uf.find('x')).toBe(uf.find('y'));
    expect(uf.find('x')).not.toBe(uf.find('p'));
  });
});
