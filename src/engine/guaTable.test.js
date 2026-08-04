import { describe, expect, test } from 'vitest';
import { GUA_64, findGua } from './guaTable';

describe('guaTable 64卦静态表', () => {
  test('64卦齐全且爻画无重复', () => {
    expect(GUA_64.length).toBe(64);
    const lines = GUA_64.map((g) => g.lines);
    expect(new Set(lines).size).toBe(64);
    GUA_64.forEach((g) => {
      expect(g.lines).toMatch(/^[12]{6}$/);
      expect(g.liuqin).toHaveLength(6);
      expect(g.fushen).toHaveLength(6);
    });
  });

  test('乾为天 (八纯卦)', () => {
    const g = findGua('111111');
    expect(g).toBeDefined();
    expect(g.name).toBe('乾为天');
    expect(g.gong).toBe('乾');
    expect(g.shi).toBe(5);
    expect(g.ying).toBe(2);
    expect(g.liuqin[0]).toBe('父戌土');
    expect(g.liuqin).toEqual(['父戌土', '兄申金', '官午火', '父辰土', '财寅木', '孙子水']);
    expect(g.fushen).toEqual(['', '', '', '', '', '']);
    expect(g.youhun).toBe(false);
    expect(g.guihun).toBe(false);
  });

  test('天风姤伏神（财寅木伏于二爻, 索引1）', () => {
    const g = findGua('211111');
    expect(g.name).toBe('天风姤');
    expect(g.fushen[1]).toBe('财寅木');
    expect(g.fushen[0]).toBe(''); // 初爻无伏神
    expect(g.fushen).toEqual(['', '财寅木', '', '', '', '']);
  });

  test('火地晋为游魂卦且有伏神', () => {
    const g = findGua('222121');
    expect(g.name).toBe('火地晋');
    expect(g.youhun).toBe(true);
    expect(g.guihun).toBe(false);
    expect(g.fushen[0]).toBe('孙子水'); // 乾宫初爻孙水伏于晋之四爻
  });

  test('火天大有为归魂卦', () => {
    const g = findGua('111121');
    expect(g.name).toBe('火天大有');
    expect(g.youhun).toBe(false);
    expect(g.guihun).toBe(true);
    expect(g.shi).toBe(2);
  });

  test('找不到返回 undefined', () => {
    // 说明: 任意 6 位 1/2 组合都是合法卦画(2^6=64 全覆盖)，
    // 故用非法字符/长度测试未命中分支
    expect(findGua('111113')).toBeUndefined();
    expect(findGua('11111')).toBeUndefined();
  });
});
