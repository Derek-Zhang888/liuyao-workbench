import { describe, expect, test } from 'vitest';
import { paipan, WUXING_COLOR } from './paipan';
import { toLunar } from './ganzhi';

/**
 * 断言日期与日干（前置确认，与 ganzhi 模块交叉验证）：
 *   2026-08-04 庚戌日（甲辰旬，空亡寅卯），月建未（土）——庚日，六神起白虎
 *   2026-08-08 甲寅日，月建未（土）——甲日，六神起青龙
 *   2024-02-10 甲辰年正月初一 甲辰日，月建寅（木）
 * 伏神说明：guaTable.fushen 为"按所伏爻位展开的 6 项数组（0=初爻，空串=无）"，
 *   天风姤实际伏神"财寅木"在索引 1（二爻），故断言 yao[1]（与 task-2-report 一致）。
 */

describe('paipan 盘面生成器', () => {
  test('六神起法：甲日（2026-08-08 甲寅）初爻青龙', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 8) });
    expect(toLunar(new Date(2026, 7, 8)).ganzhiDay).toBe('甲寅'); // 前置确认
    expect(r.yao.length).toBe(6);
    expect(r.liushen[0]).toBe('青龙');
    expect(r.liushen).toEqual(['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']); // 初→上
  });

  test('六神起法：庚日（2026-08-04 庚戌）初爻白虎', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4) });
    expect(toLunar(new Date(2026, 7, 4)).ganzhiDay).toBe('庚戌'); // 前置确认
    expect(r.liushen[0]).toBe('白虎');
    expect(r.liushen).toEqual(['白虎', '玄武', '青龙', '朱雀', '勾陈', '螣蛇']);
  });

  test('六爻全动变坤：乾为天 111111 全动 → 坤为地', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 1, 2, 3, 4, 5] },
      date: new Date(2026, 7, 4),
    });
    expect(r.bian.name).toBe('坤为地');
    expect(r.bian.gong).toBe('坤');
    // 变卦六亲（上→初）按本宫法：乾宫金为"我"生克坤为地各爻地支
    expect(r.bian.liuqin).toEqual(['兄酉金', '孙亥水', '父丑土', '财卯木', '官巳火', '父未土']);
  });

  test('无动爻 bian=null', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.ben.name).toBe('乾为天');
    expect(r.bian).toBeNull();
  });

  test('世应标记：乾为天 世上爻(索引5)、应二爻(索引2)', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.yao[5].shi).toBe(true);
    expect(r.yao[2].ying).toBe(true);
    expect(r.yao.filter((y) => y.shi).length).toBe(1); // 世唯一
    expect(r.yao.filter((y) => y.ying).length).toBe(1); // 应唯一
  });

  test('伏神：天风姤（211111）伏财寅木于二爻（guaTable 实际索引 1）', () => {
    const r = paipan({ method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.ben.name).toBe('天风姤');
    expect(r.yao[1].fushen).toEqual({ liuqin: '财', zhi: '寅', wuxing: '木' });
    expect(r.yao[0].fushen).toBeNull(); // 其余爻位无伏神
    expect(r.yao.filter((y) => y.fushen !== null).length).toBe(1);
  });

  test('旺衰：2026-08-04 月建未土 vs 乾为天（旺/相/休/囚/死）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.yuejian).toBe('未'); // 月建未土
    // 初→上：子水(月建克=囚) 寅木(克月建=死) 辰土(同=旺) 午火(生月建=休) 申金(月建生=相) 戌土(旺)
    expect(r.yao.map((y) => y.wangshuai)).toEqual(['囚', '死', '旺', '休', '相', '旺']);
  });

  test('旺衰：2024-02-10 月建寅木 vs 坤为地（含死）', () => {
    const r = paipan({ method: 'qian', params: { lines: '222222', dong: [] }, date: new Date(2024, 1, 10) });
    expect(r.yuejian).toBe('寅'); // 正月建寅
    // 初→上：未土(木克=囚) 巳火(月建生=相) 卯木(同=旺) 丑土(囚) 亥水(生月建=休) 酉金(克月建=死)
    expect(r.yao.map((y) => y.wangshuai)).toEqual(['囚', '相', '旺', '囚', '休', '死']);
  });

  test('爻结构：六亲解析/爻画/动爻标记（天火同人 二爻动）', () => {
    const r = paipan({ method: 'qian', params: { lines: '121111', dong: [1] }, date: new Date(2026, 7, 4) });
    expect(r.ben.name).toBe('天火同人');
    // 初爻=父卯木（guaTable.liuqin 为上→初，初爻取 liuqin[5]）
    expect(r.yao[0]).toMatchObject({ liuqin: '父', zhi: '卯', wuxing: '木', line: 1, dong: false, shi: false, ying: false });
    expect(r.yao[1]).toMatchObject({ liuqin: '孙', zhi: '丑', wuxing: '土', line: 2, dong: true });
    expect(r.yao.map((y) => y.line)).toEqual([1, 2, 1, 1, 1, 1]);
    // 二爻动 → 变卦 111111 乾为天
    expect(r.bian.name).toBe('乾为天');
  });

  test('盘面干支字段（2026-08-04 10:30 庚戌日/辛巳时）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) });
    expect(r.yearGZ).toBe('丙午');
    expect(r.monthGZ).toBe('乙未');
    expect(r.dayGZ).toBe('庚戌');
    expect(r.hourGZ).toBe('辛巳');
    expect(r.xunkong).toEqual(['寅', '卯']);
    expect(r.yuejian).toBe('未');
  });

  test('卦身/煞神字段：乾宫卦身戌（测试版简化），煞神空', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.guashen).toBe('戌'); // 简报确认"乾卦身起戌"
    expect(r.shashen).toBeNull(); // 测试版暂无煞神（神煞已按爻展示）
  });

  test('新历/农历日期与神煞（2026-08-04 庚戌日）', () => {
    const r = paipan({ method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.solarDate).toBe('2026-08-04');
    expect(r.lunarDate).toMatch(/^农历\d+年.?\d+月\d+日$/);
    // 庚日贵人临丑未；天风姤初爻父丑土 → 贵
    expect(r.yao[0].shensha).toContain('贵');
  });

  test('method 分派：卦名卦起卦', () => {
    const r = paipan({ method: 'guaname', params: { input: '天风姤' }, date: new Date(2026, 7, 4) });
    expect(r.ben.name).toBe('天风姤');
    expect(r.bian).toBeNull();
  });

  test('数字卦 method=2 可达（顶层 method 与 params.method 两种传法）', () => {
    // 传法 b：顶层 method 直接为 1|2（与 qiguaFromNumber 对齐）——上乾(1)下兑(2)，动爻=3÷6 余3 → 三爻(索引2)
    const r1 = paipan({ method: 2, params: { n1: 1, n2: 2, n3: 3 }, date: new Date(2026, 7, 4) });
    expect(r1.ben.name).toBe('天泽履');
    expect(r1.yao[2].dong).toBe(true);
    // 传法 a：method='number' + params.method=2（UI 标准用法）
    const r2 = paipan({ method: 'number', params: { n1: 1, n2: 2, n3: 3, method: 2 }, date: new Date(2026, 7, 4) });
    expect(r2.ben.name).toBe('天泽履');
    // 默认算法 1 不受影响——上乾(1)下巽(5)，动爻=(1+2+3)÷6 余0 → 上爻(索引5)
    const r3 = paipan({ method: 'number', params: { n1: 1, n2: 2, n3: 3 }, date: new Date(2026, 7, 4) });
    expect(r3.ben.name).toBe('天风姤');
    expect(r3.yao[5].dong).toBe(true);
  });

  test('method 分派：time/baoshu/yaoming/computer', () => {
    // time 时间卦（2024-02-10 10:30 巳时：年支辰5+月1+日1=7 上艮，+时6=13 下巽，动爻=1 → 山风蛊，初爻动）
    const t = paipan({ method: 'time', params: {}, date: new Date(2024, 1, 10, 10, 30) });
    expect(t.ben.name).toBe('山风蛊');
    expect(t.yao[0].dong).toBe(true);
    // baoshu 报数卦（3412：上离(3)下震(4)，动爻 1、2 → 火雷噬嗑，初、二爻动）
    const bs = paipan({ method: 'baoshu', params: { digits: '3412' }, date: new Date(2026, 7, 4) });
    expect(bs.ben.name).toBe('火雷噬嗑');
    expect(bs.yao[0].dong).toBe(true);
    expect(bs.yao[1].dong).toBe(true);
    // yaoming 爻名卦（3 老阳动 → 乾为天，初爻动）
    const ym = paipan({ method: 'yaoming', params: { lines: '311111' }, date: new Date(2026, 7, 4) });
    expect(ym.ben.name).toBe('乾为天');
    expect(ym.yao[0].dong).toBe(true);
    // computer 电脑卦（固定随机序列 [0.1,0.1,0.9,...] → 老阴在第三位 → 天泽履，三爻动）
    const seq = [0.1, 0.1, 0.9, 0.1, 0.1, 0.1];
    const cp = paipan({ method: 'computer', params: { randomFn: () => seq.shift() }, date: new Date(2026, 7, 4) });
    expect(cp.ben.name).toBe('天泽履');
    expect(cp.yao[2].dong).toBe(true);
  });

  test('输入校验：非法爻画 / dong 越界 / dong 非数组 抛 RangeError', () => {
    expect(() => paipan({ method: 'qian', params: { lines: '11111' }, date: new Date(2026, 7, 4) })).toThrow(RangeError);
    expect(() => paipan({ method: 'qian', params: { lines: '111113' }, date: new Date(2026, 7, 4) })).toThrow(RangeError);
    expect(() => paipan({ method: 'qian', params: { lines: '111111', dong: [6] }, date: new Date(2026, 7, 4) })).toThrow(RangeError);
    expect(() => paipan({ method: 'qian', params: { lines: '111111', dong: [-1] }, date: new Date(2026, 7, 4) })).toThrow(RangeError);
    expect(() => paipan({ method: 'qian', params: { lines: '111111', dong: 'x' }, date: new Date(2026, 7, 4) })).toThrow(RangeError);
  });

  test('WUXING_COLOR 五行键齐全', () => {
    expect(Object.keys(WUXING_COLOR).sort()).toEqual(['土', '木', '水', '火', '金'].sort());
    for (const v of Object.values(WUXING_COLOR)) {
      expect(v).toMatch(/^var\(--wuxing-/);
    }
  });

  test('非法输入：未知 method / 数字卦非法参数 / 缺 date 抛错', () => {
    expect(() => paipan({ method: 'nope', params: {}, date: new Date(2026, 7, 4) })).toThrow(RangeError);
    expect(() => paipan({ method: 'number', params: { n1: 0, n2: 1, n3: 1 }, date: new Date(2026, 7, 4) })).not.toThrow(); // 0 现为合法输入（余数按 8/6 处理）
    expect(() => paipan({ method: 'qian', params: { lines: '111111' } })).toThrow(TypeError);
  });
});
