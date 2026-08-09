import { describe, expect, test } from 'vitest';
import { computeShenshaList, paipan } from './paipan';

/** 便捷：按中文名取神煞项 */
function item(list, name) {
  return list.find((x) => x.name === name);
}

/**
 * 卦级神煞（computeShenshaList）测试：
 *   A. 日干系（dayGZ[0]）：天乙贵人（甲戊庚牛羊）/ 禄神 / 羊刃 / 文昌
 *   B. 日支系（dayGZ[1]，三合局）：驿马 / 桃花 / 华盖 / 将星 / 劫煞 / 灾煞 / 谋星
 *      单基准：仅按日支计算，返回 {name, zhi}（无 zhiYear）
 *   C. 月支系（monthGZ[1]）：天医（逆退一位）/ 天德 / 月德 / 天喜（季节）
 */
describe('computeShenshaList 卦级神煞', () => {
  test('甲日子日寅月：日干系全查 + 申子辰三合组全查 + 月支系全查（15 项）', () => {
    const list = computeShenshaList('甲子', '丙寅'); // 子日属申子辰局
    expect(list).toHaveLength(15);
    // A. 日干系
    expect(item(list, '天乙贵人').zhi).toBe('丑未'); // 甲→丑未
    expect(item(list, '禄神').zhi).toBe('寅'); // 甲→寅
    expect(item(list, '羊刃').zhi).toBe('卯'); // 甲→卯
    expect(item(list, '文昌').zhi).toBe('巳'); // 甲→巳
    // B. 日支三合系（子日→申子辰）
    expect(item(list, '驿马').zhi).toBe('寅');
    expect(item(list, '桃花').zhi).toBe('酉');
    expect(item(list, '华盖').zhi).toBe('辰');
    expect(item(list, '将星').zhi).toBe('子');
    expect(item(list, '劫煞').zhi).toBe('巳');
    expect(item(list, '灾煞').zhi).toBe('午');
    expect(item(list, '谋星').zhi).toBe('戌');
    // C. 月支系（寅月）
    expect(item(list, '天医').zhi).toBe('丑'); // 寅月逆退一位
    expect(item(list, '天喜').zhi).toBe('戌'); // 春月
    expect(item(list, '天德').gan).toBe('丁'); // 正丁
    expect(item(list, '月德').gan).toBe('丙'); // 寅午戌月
  });

  test('庚日贵人丑未（甲戊庚牛羊）', () => {
    expect(item(computeShenshaList('庚戌', '乙未'), '天乙贵人').zhi).toBe('丑未');
    // 辛日贵人寅午
    expect(item(computeShenshaList('辛卯', '乙未'), '天乙贵人').zhi).toBe('寅午');
    // 丙日贵人亥酉
    expect(item(computeShenshaList('丙申', '乙未'), '天乙贵人').zhi).toBe('亥酉');
  });

  test('日干系：乙日禄卯 / 丙日文昌申 / 甲日羊刃卯', () => {
    expect(item(computeShenshaList('乙卯', '乙未'), '禄神').zhi).toBe('卯');
    expect(item(computeShenshaList('丙申', '乙未'), '文昌').zhi).toBe('申');
    expect(item(computeShenshaList('甲子', '乙未'), '羊刃').zhi).toBe('卯');
  });

  test('寅午戌日三合：驿马申/桃花卯/华盖戌/将星午/劫煞亥/灾煞子/谋星辰', () => {
    const list = computeShenshaList('庚午', '乙未');
    expect(item(list, '驿马').zhi).toBe('申');
    expect(item(list, '桃花').zhi).toBe('卯');
    expect(item(list, '华盖').zhi).toBe('戌');
    expect(item(list, '将星').zhi).toBe('午');
    expect(item(list, '劫煞').zhi).toBe('亥');
    expect(item(list, '灾煞').zhi).toBe('子');
    expect(item(list, '谋星').zhi).toBe('辰');
  });

  test('巳酉丑日三合：驿马亥/桃花午/华盖丑/将星酉', () => {
    const list = computeShenshaList('己酉', '乙未');
    expect(item(list, '驿马').zhi).toBe('亥');
    expect(item(list, '桃花').zhi).toBe('午');
    expect(item(list, '华盖').zhi).toBe('丑');
    expect(item(list, '将星').zhi).toBe('酉');
  });

  test('亥卯未日三合：驿马巳/桃花子/华盖未/将星卯', () => {
    const list = computeShenshaList('乙亥', '乙未');
    expect(item(list, '驿马').zhi).toBe('巳');
    expect(item(list, '桃花').zhi).toBe('子');
    expect(item(list, '华盖').zhi).toBe('未');
    expect(item(list, '将星').zhi).toBe('卯');
  });

  test('日支系单基准：仅按日支计算，不含 zhiYear 字段（年支无关）', () => {
    // 壬子日=申子辰局，无论年支是午（寅午戌）还是辰（申子辰），结果都只按日支
    const listA = computeShenshaList('壬子', '乙未');
    expect(item(listA, '华盖').zhi).toBe('辰'); // 日支 子→申子辰 华盖辰
    expect(item(listA, '驿马').zhi).toBe('寅');
    expect(item(listA, '桃花').zhi).toBe('酉');
    expect(item(listA, '将星').zhi).toBe('子');
    expect(item(listA, '劫煞').zhi).toBe('巳');
    expect(item(listA, '灾煞').zhi).toBe('午');
    expect(item(listA, '谋星').zhi).toBe('戌');
    for (const name of ['驿马', '桃花', '华盖', '将星', '劫煞', '灾煞', '谋星']) {
      expect(item(listA, name).zhiYear).toBeUndefined();
      expect(Object.keys(item(listA, name)).sort()).toEqual(['name', 'zhi']);
    }
  });

  test('日干系/月支系项不含 zhiYear 字段', () => {
    const list = computeShenshaList('甲子', '丙寅');
    for (const name of ['天乙贵人', '禄神', '羊刃', '文昌', '天医', '天喜', '天德', '月德']) {
      expect(item(list, name).zhiYear).toBeUndefined();
    }
  });

  test('天医：寅月→丑、午月→巳、子月→亥（月支逆退一位）', () => {
    expect(item(computeShenshaList('庚戌', '丙寅'), '天医').zhi).toBe('丑');
    expect(item(computeShenshaList('庚戌', '戊午'), '天医').zhi).toBe('巳');
    expect(item(computeShenshaList('庚戌', '甲子'), '天医').zhi).toBe('亥');
  });

  test('天德：寅月→丁、午月→亥、酉月→寅（口诀逐月核对）', () => {
    expect(item(computeShenshaList('庚戌', '丙寅'), '天德').gan).toBe('丁');
    expect(item(computeShenshaList('庚戌', '戊午'), '天德').gan).toBe('亥');
    expect(item(computeShenshaList('庚戌', '癸酉'), '天德').gan).toBe('寅');
    // 全 12 月逐月核对（正丁二申三壬四辛五亥六甲七癸八寅九丙十乙子巳丑庚）
    const expectMap = {
      寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲',
      申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚',
    };
    for (const [monthZhi, gan] of Object.entries(expectMap)) {
      const gz = `甲${monthZhi}`;
      expect(item(computeShenshaList('庚戌', gz), '天德').gan).toBe(gan);
    }
  });

  test('月德：寅月→丙（寅午戌）、未月→甲（亥卯未）、子月→壬（申子辰）、酉月→庚（巳酉丑）', () => {
    expect(item(computeShenshaList('庚戌', '丙寅'), '月德').gan).toBe('丙');
    expect(item(computeShenshaList('庚戌', '乙未'), '月德').gan).toBe('甲');
    expect(item(computeShenshaList('庚戌', '甲子'), '月德').gan).toBe('壬');
    expect(item(computeShenshaList('庚戌', '癸酉'), '月德').gan).toBe('庚');
  });

  test('天喜：寅月→戌（春）、巳月→丑（夏）、申月→辰（秋）、亥月→未（冬）', () => {
    expect(item(computeShenshaList('庚戌', '丙寅'), '天喜').zhi).toBe('戌');
    expect(item(computeShenshaList('庚戌', '辛巳'), '天喜').zhi).toBe('丑');
    expect(item(computeShenshaList('庚戌', '戊申'), '天喜').zhi).toBe('辰');
    expect(item(computeShenshaList('庚戌', '乙亥'), '天喜').zhi).toBe('未');
  });

  test('入参防御：dayGZ/monthGZ 任一缺失时返回空列表（不抛 TypeError）', () => {
    expect(computeShenshaList(undefined, undefined)).toEqual([]);
    expect(computeShenshaList('', '乙未')).toEqual([]);
    expect(computeShenshaList('庚戌', '')).toEqual([]);
    expect(computeShenshaList(null, null)).toEqual([]);
  });

  test('项序固定：贵人、禄神、羊刃、文昌、驿马、桃花、华盖、将星、劫煞、灾煞、谋星、天医、天喜、天德、月德', () => {
    expect(computeShenshaList('甲子', '丙寅').map((x) => x.name)).toEqual([
      '天乙贵人', '禄神', '羊刃', '文昌',
      '驿马', '桃花', '华盖', '将星', '劫煞', '灾煞', '谋星',
      '天医', '天喜', '天德', '月德',
    ]);
  });
});

describe('paipan 盘面 shenshaList 字段', () => {
  test('2026-08-04 庚戌日乙未月丙午年：shenshaList 15 项且含贵人丑未/驿马申/天医午/月德甲', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.dayGZ).toBe('庚戌');
    expect(r.monthGZ).toBe('乙未');
    expect(r.yearGZ).toBe('丙午');
    expect(Array.isArray(r.shenshaList)).toBe(true);
    expect(r.shenshaList).toHaveLength(15);
    expect(item(r.shenshaList, '天乙贵人').zhi).toBe('丑未'); // 庚日
    expect(item(r.shenshaList, '驿马').zhi).toBe('申'); // 戌日→寅午戌组
    expect(item(r.shenshaList, '华盖').zhi).toBe('戌'); // 戌日→寅午戌组
    expect(item(r.shenshaList, '天医').zhi).toBe('午'); // 未月逆退
    expect(item(r.shenshaList, '月德').gan).toBe('甲'); // 未月→亥卯未组
  });

  test('不同起卦日期神煞跟随年月日干支变化', () => {
    const r1 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    const r2 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2024, 1, 10) });
    expect(r1.dayGZ).toBe('庚戌');
    expect(r2.dayGZ).toBe('甲辰');
    expect(r1.yearGZ).toBe('丙午'); // 2026 丙午年
    expect(r2.yearGZ).toBe('甲辰'); // 2024 甲辰年
    expect(r1.shenshaList.map((x) => x.name)).toEqual(r2.shenshaList.map((x) => x.name)); // 项序一致
    // 日干不同 → 禄神不同（庚→申 vs 甲→寅）
    expect(item(r1.shenshaList, '禄神').zhi).toBe('申');
    expect(item(r2.shenshaList, '禄神').zhi).toBe('寅');
    // 日支不同 → 三合组不同（戌→寅午戌 vs 辰→申子辰）
    expect(item(r1.shenshaList, '驿马').zhi).toBe('申');
    expect(item(r2.shenshaList, '驿马').zhi).toBe('寅');
    // 月支不同 → 天医不同（未月午 vs 寅月丑）
    expect(item(r1.shenshaList, '天医').zhi).toBe('午');
    expect(item(r2.shenshaList, '天医').zhi).toBe('丑');
  });
});
