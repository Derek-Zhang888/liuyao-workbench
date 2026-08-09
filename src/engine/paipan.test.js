import { describe, expect, test } from 'vitest';
import { paipan, WUXING_COLOR, naganGan, NAGAN_GAN, TRIGRAM_LINES, yongShenHit, yongShenHitFushen, guashenBedroom } from './paipan';
import { computePanMarkers } from './panMarkers.js';
import { GUA_64 } from './guaTable';
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

  test('旺衰（v0.10 标准口径）：2026-08-04 月建未土 vs 乾为天', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.yuejian).toBe('未'); // 月建未土
    // 初→上：子水(土克水=月建克爻=死) 寅木(木克土=爻克月建=囚) 辰土(同=旺) 午火(生月建=休) 申金(月建生=相) 戌土(旺)
    expect(r.yao.map((y) => y.wangshuai)).toEqual(['死', '囚', '旺', '休', '相', '旺']);
  });

  test('旺衰（v0.10 标准口径）：2024-02-10 月建寅木 vs 坤为地', () => {
    const r = paipan({ method: 'qian', params: { lines: '222222', dong: [] }, date: new Date(2024, 1, 10) });
    expect(r.yuejian).toBe('寅'); // 正月建寅
    // 初→上：未土(木克土=月建克爻=死) 巳火(月建生=相) 卯木(同=旺) 丑土(死) 亥水(生月建=休) 酉金(金克木=爻克月建=囚)
    expect(r.yao.map((y) => y.wangshuai)).toEqual(['死', '相', '旺', '死', '休', '囚']);
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

  test('v0.10 改进建7 #4 香闺/床帐全地支：乾为天卦身巳火→香闺=金全部[申,酉]、床帐=土全部[丑,辰,未,戌]（十二支序）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.guashenPrecise).toBe('巳');
    // 不再扫描爻：按卦身五行 所克=金→申酉、所生=土→丑辰未戌（十二支顺序，天然无重复）
    expect(r.xianggui).toEqual([{ zhi: '申' }, { zhi: '酉' }]);
    expect(r.chuangzhang).toEqual([{ zhi: '丑' }, { zhi: '辰' }, { zhi: '未' }, { zhi: '戌' }]);
    // 任意卦：结构与只含 zhi（不带五行字）
    const r2 = paipan({ method: 'qian', params: { lines: '222222', dong: [] }, date: new Date(2026, 7, 4) });
    expect(Array.isArray(r2.xianggui)).toBe(true);
    expect(Array.isArray(r2.chuangzhang)).toBe(true);
    for (const item of [...r2.xianggui, ...r2.chuangzhang]) {
      expect(item).toHaveProperty('zhi');
      expect(item.wuxing).toBeUndefined();
    }
  });

  test('v0.10 改进建7 #4 guashenBedroom 纯五行→地支映射（各五行样例）', () => {
    const cases = [
      ['子', { xianggui: [{ zhi: '巳' }, { zhi: '午' }], chuangzhang: [{ zhi: '寅' }, { zhi: '卯' }] }], // 水克火、水生木
      ['寅', { xianggui: [{ zhi: '丑' }, { zhi: '辰' }, { zhi: '未' }, { zhi: '戌' }], chuangzhang: [{ zhi: '巳' }, { zhi: '午' }] }], // 木克土、木生火
      ['午', { xianggui: [{ zhi: '申' }, { zhi: '酉' }], chuangzhang: [{ zhi: '丑' }, { zhi: '辰' }, { zhi: '未' }, { zhi: '戌' }] }], // 火克金、火生土
      ['申', { xianggui: [{ zhi: '寅' }, { zhi: '卯' }], chuangzhang: [{ zhi: '子' }, { zhi: '亥' }] }], // 金克木、金生水（十二支序：子在亥前）
    ];
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    for (const [zhi, want] of cases) {
      expect(guashenBedroom(zhi, r.yao)).toEqual(want);
    }
    // 非法卦身 → 空数组
    expect(guashenBedroom('', r.yao)).toEqual({ xianggui: [], chuangzhang: [] });
  });

  test('新历/农历日期与神煞（2026-08-04 庚戌日）', () => {
    const r = paipan({ method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r.solarDate).toBe('2026-08-04');
    // 农历中文格式（v0.10 建议3 #3）：农历2026年六月廿二（月/日均为中文，末尾无「日」字）
    expect(r.lunarDate).toMatch(/^农历\d+年(闰)?[正一二三四五六七八九十冬腊]月[初一二三四五六七八九十廿]+$/);
    expect(r.lunarDate).toBe('农历2026年六月廿二');
    // 庚日贵人临丑未；天风姤初爻父丑土 → 贵
    expect(r.yao[0].shensha).toContain('贵');
  });

  test('农历中文：正月/初一/初十/二十 边界', () => {
    const r1 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2024, 1, 10) });
    expect(r1.lunarDate).toBe('农历2024年正月初一');
    const r2 = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    expect(r2.lunarDate).toBe('农历2026年六月廿二');
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

describe('纳干（功能三：八宫纳甲）', () => {
  test('默认关闭：yao 无 gan 字段，pan.nagan 省略（旧快照兼容）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4) });
    expect(r.yao[0].gan).toBeUndefined();
    expect(r.nagan).toBeUndefined();
  });

  test('乾宫：内卦甲、外卦壬（初二三爻甲，四五六爻壬）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.gong).toBe('乾');
    expect(r.nagan).toBe(true);
    expect(r.yao.map((y) => y.gan)).toEqual(['甲', '甲', '甲', '壬', '壬', '壬']);
    expect(r.yao[0].zhi).toBe('子'); // 甲子水（初爻）
    expect(r.yao[3].zhi).toBe('午'); // 壬午火（四爻）
  });

  test('坤宫：内卦乙、外卦癸', () => {
    const r = paipan({ method: 'qian', params: { lines: '222222' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.gong).toBe('坤');
    expect(r.yao.map((y) => y.gan)).toEqual(['乙', '乙', '乙', '癸', '癸', '癸']);
  });

  test('八宫抽查：震庚 / 巽辛 / 坎戊 / 离己 / 艮丙 / 兑丁（内外同干）', () => {
    expect(NAGAN_GAN).toEqual({
      乾: { nei: '甲', wai: '壬' }, 坤: { nei: '乙', wai: '癸' },
      震: { nei: '庚', wai: '庚' }, 巽: { nei: '辛', wai: '辛' },
      坎: { nei: '戊', wai: '戊' }, 离: { nei: '己', wai: '己' },
      艮: { nei: '丙', wai: '丙' }, 兑: { nei: '丁', wai: '丁' },
    });
    // 兑宫实卦验证：兑为泽 112112 → 内丁外丁
    const dui = paipan({ method: 'qian', params: { lines: '112112' }, date: new Date(2026, 7, 4), nagan: true });
    expect(dui.ben.gong).toBe('兑');
    expect(dui.yao.map((y) => y.gan)).toEqual(['丁', '丁', '丁', '丁', '丁', '丁']);
  });

  test('离宫实卦验证：离为火 121121 → 内己外己', () => {
    const li = paipan({ method: 'qian', params: { lines: '121121' }, date: new Date(2026, 7, 4), nagan: true });
    expect(li.ben.gong).toBe('离');
    expect(li.yao.map((y) => y.gan)).toEqual(['己', '己', '己', '己', '己', '己']);
  });

  test('naganGan 边界：非法宫/索引返回 null', () => {
    expect(naganGan('乾', 6)).toBeNull();
    expect(naganGan('乾', -1)).toBeNull();
    expect(naganGan('X', 0)).toBeNull();
  });

  // ---- v0.10 #8：纳干按上下经卦各自纳甲（修复混合卦内外干配错）----
  test('乾为天（上乾下乾）→ 甲子甲寅甲辰 壬午壬申壬戌（标准纳甲）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.yao.map((y) => `${y.gan}${y.zhi}`)).toEqual(['甲子', '甲寅', '甲辰', '壬午', '壬申', '壬戌']);
  });

  test('天风姤（上乾下巽）→ 辛丑辛亥辛酉 壬午壬申壬戌（旧实现会误配为甲丑）', () => {
    const r = paipan({ method: 'qian', params: { lines: '211111' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.name).toBe('天风姤');
    expect(r.yao.map((y) => `${y.gan}${y.zhi}`)).toEqual(['辛丑', '辛亥', '辛酉', '壬午', '壬申', '壬戌']);
  });

  test('风天小畜（上巽下乾）→ 甲子甲寅甲辰 辛未辛巳辛卯', () => {
    const r = paipan({ method: 'qian', params: { lines: '111211' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.name).toBe('风天小畜');
    expect(r.yao.map((y) => `${y.gan}${y.zhi}`)).toEqual(['甲子', '甲寅', '甲辰', '辛未', '辛巳', '辛卯']);
  });

  test('火地晋（上离下坤）→ 乙未乙巳乙卯 己酉己未己巳', () => {
    const r = paipan({ method: 'qian', params: { lines: '222121' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.name).toBe('火地晋');
    expect(r.yao.map((y) => `${y.gan}${y.zhi}`)).toEqual(['乙未', '乙巳', '乙卯', '己酉', '己未', '己巳']);
  });

  test('雷山小过（上震下艮）→ 丙辰丙午丙申 庚午庚申庚戌（震内外同庚）', () => {
    const r = paipan({ method: 'qian', params: { lines: '221122' }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.name).toBe('雷山小过');
    expect(r.yao.map((y) => `${y.gan}${y.zhi}`)).toEqual(['丙辰', '丙午', '丙申', '庚午', '庚申', '庚戌']);
  });

  test('64 卦 × 6 爻：全部爻位的纳干与「经卦推导」自洽（每卦下卦前3位、上卦后3位）', () => {
    for (const g of GUA_64) {
      const lower = g.lines.slice(0, 3);
      const upper = g.lines.slice(3, 6);
      const lowerGua = TRIGRAM_LINES[lower];
      const upperGua = TRIGRAM_LINES[upper];
      expect(lowerGua, `${g.name} 下卦 ${lower}`).toBeTruthy();
      expect(upperGua, `${g.name} 上卦 ${upper}`).toBeTruthy();
      for (let i = 0; i < 6; i++) {
        const gan = naganGan(g.gong, i, g.lines);
        // 初二三爻用下卦内干，四五六爻用上卦外干
        const want = i < 3
          ? NAGAN_GAN[lowerGua].nei
          : NAGAN_GAN[upperGua].wai;
        expect(gan, `${g.name} 第${i + 1}爻`).toBe(want);
      }
    }
  });

  test('v0.10 改进建7 #5：开启纳干后变卦也烘焙 gan（按变卦上下经卦纳甲）', () => {
    // 乾为天 初爻动 → 天风姤（下巽上乾）：变卦天干 辛辛辛壬壬壬
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [0] }, date: new Date(2026, 7, 4), nagan: true });
    expect(r.ben.name).toBe('乾为天');
    expect(r.bian.name).toBe('天风姤');
    expect(r.bian.gan).toEqual(['辛', '辛', '辛', '壬', '壬', '壬']);
    // 天风姤 初爻动 → 乾为天（下乾上乾）：变卦天干 甲甲甲壬壬壬
    const r2 = paipan({ method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4), nagan: true });
    expect(r2.bian.name).toBe('乾为天');
    expect(r2.bian.gan).toEqual(['甲', '甲', '甲', '壬', '壬', '壬']);
  });

  test('v0.10 改进建7 #5：未开纳干 / 旧快照 bian.gan 缺省（向后兼容）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [0] }, date: new Date(2026, 7, 4) });
    expect(r.bian.gan).toBeUndefined();
    // 旧快照形态：手动删除 bian.gan 后 PanView/导出端留空不崩（此处验证 paipan 输出即无 gan）
    const old = paipan({ method: 'qian', params: { lines: '111111', dong: [0] }, date: new Date(2026, 7, 4), nagan: true });
    delete old.bian.gan;
    expect(old.bian.gan).toBeUndefined();
  });
});

describe('v0.10 改进建7 #8：化进化退补齐土支（用户实例：天泽履上爻动→化退）', () => {
  test('天泽履上爻戌土动 → 兑为泽上爻未土 = 化退（引擎表：天泽履 112111 上爻翻转 = 兑为泽 112112）', () => {
    const r = paipan({
      method: 'qian', params: { lines: '112111', dong: [5] }, date: new Date(2026, 7, 4),
      dizhi: true, markers: { 'marker-jintui-fanfuyin': true },
    });
    // 天泽履六爻（初→上）丁巳 丁卯 丁丑 壬午 壬申 壬戌；上爻戌土动
    expect(r.ben.name).toBe('天泽履');
    expect(r.yao[5].zhi).toBe('戌');
    expect(r.yao[5].wuxing).toBe('土');
    expect(r.yao[5].dong).toBe(true);
    // 变卦上爻未土（同土逆行 = 化退）；变卦六亲按本宫（艮宫土）重排 → 未土=兄
    expect(r.bian.name).toBe('兑为泽');
    expect(r.bian.liuqin[0]).toBe('兄未土');
    // 盘面标记：上爻「退」（修复前漏判为无）
    expect(r.markers.jinTui).toEqual([{ i: 5, label: '退' }]);
    // 地支分析：化退神（戌→未）
    expect(r.dizhiAnalysis.benBian).toContainEqual({ yaoIndex: 5, text: '化退神（戌→未）' });
  });

  test('土支化进退各环：丑→辰 进、辰→丑 退、辰→未 进、未→辰 退、未→戌 进、戌→丑 进', () => {
    // 直接验证 JINSHEN/TUISHEN 土支（经 panMarkers 链路）：
    const mkYao = (zhi, dong) => ({ liuqin: '父', zhi, wuxing: '土', line: 1, dong, wangshuai: '旺' });
    const yao = [
      { ...mkYao('丑', true) }, // 变辰 → 进
      { ...mkYao('辰', true) }, // 变丑 → 退
      { ...mkYao('辰', true) }, // 变未 → 进
      { ...mkYao('未', true) }, // 变辰 → 退
      { ...mkYao('未', true) }, // 变戌 → 进
      { ...mkYao('戌', true) }, // 变丑 → 进
    ];
    const bian = { liuqin: ['父丑土', '父戌土', '父辰土', '父未土', '父丑土', '父辰土'] }; // 上→初：i0→[5]辰, i1→[4]丑, i2→[3]未, i3→[2]辰, i4→[1]戌, i5→[0]丑
    const m = computePanMarkers({ yao, bian, markers: { 'marker-jintui-fanfuyin': true } });
    expect(m.jinTui).toEqual([
      { i: 0, label: '进' },
      { i: 1, label: '退' },
      { i: 2, label: '进' },
      { i: 3, label: '退' },
      { i: 4, label: '进' },
      { i: 5, label: '进' },
    ]);
  });

  test('防回归：震为雷 二爻动化进、兑为泽 二爻动化退（上轮用例保持）', () => {
    const p1 = paipan({
      method: 'qian', params: { lines: '122122', dong: [1] }, date: new Date(2026, 7, 4),
      markers: { 'marker-jintui-fanfuyin': true },
    });
    expect(p1.bian.name).toBe('雷泽归妹');
    expect(p1.markers.jinTui).toEqual([{ i: 1, label: '进' }]);

    const p2 = paipan({
      method: 'qian', params: { lines: '112112', dong: [1] }, date: new Date(2026, 7, 4),
      markers: { 'marker-jintui-fanfuyin': true },
    });
    expect(p2.bian.name).toBe('泽雷随');
    expect(p2.markers.jinTui).toEqual([{ i: 1, label: '退' }]);
  });
});

describe('用神命中伏神（功能二：伏神高亮判定）', () => {
  // 天风姤（211111）：二爻本卦六亲为孙亥水，伏神为财寅木（乾宫缺财寅木）
  const gua = () =>
    paipan({ method: 'qian', params: { lines: '211111', dong: [] }, date: new Date(2026, 7, 4) });

  test('用神=伏神六亲：yongShenHitFushen true，本卦六亲不同 → yongShenHit false', () => {
    const y = gua().yao[1];
    expect(y.fushen).toEqual({ liuqin: '财', zhi: '寅', wuxing: '木' });
    expect(y.liuqin).toBe('孙'); // 本卦六亲与伏神不同
    expect(yongShenHitFushen(y, { type: 'liuqin', value: '财' })).toBe(true);
    expect(yongShenHit(y, { type: 'liuqin', value: '财' })).toBe(false);
  });

  test('用神=伏神地支：yongShenHitFushen true，本卦地支不同 → yongShenHit false', () => {
    const y = gua().yao[1];
    expect(y.zhi).toBe('亥'); // 本卦地支与伏神不同
    expect(yongShenHitFushen(y, { type: 'zhi', value: '寅' })).toBe(true);
    expect(yongShenHit(y, { type: 'zhi', value: '寅' })).toBe(false);
  });

  test('用神不匹配：六亲/地支均 false', () => {
    const y = gua().yao[1];
    expect(yongShenHitFushen(y, { type: 'liuqin', value: '官' })).toBe(false);
    expect(yongShenHitFushen(y, { type: 'zhi', value: '子' })).toBe(false);
  });

  test('无伏神爻 / 未选用神 / 空爻 → false（向后兼容）', () => {
    const r = gua();
    expect(yongShenHitFushen(r.yao[0], { type: 'liuqin', value: '财' })).toBe(false); // yao[0].fushen null
    expect(yongShenHitFushen(r.yao[1], null)).toBe(false); // 未选用神
    expect(yongShenHitFushen(null, { type: 'liuqin', value: '财' })).toBe(false); // 空爻
    expect(yongShenHitFushen({ liuqin: '孙', zhi: '亥' }, { type: 'liuqin', value: '财' })).toBe(false); // 无 fushen 字段
  });

  test('命中伏神不影响本卦爻命中：同爻本卦财命中、无伏神时互不干扰', () => {
    // 乾为天（无伏神）二爻财寅木：本卦命中，但无伏神 → yongShenHitFushen false
    const r = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) });
    const y1 = r.yao[1];
    expect(y1.liuqin).toBe('财');
    expect(y1.fushen).toBeNull();
    expect(yongShenHit(y1, { type: 'liuqin', value: '财' })).toBe(true);
    expect(yongShenHitFushen(y1, { type: 'liuqin', value: '财' })).toBe(false);
  });
});
