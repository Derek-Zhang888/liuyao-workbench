import { describe, expect, test } from 'vitest';
import { paipan, yongShenHit } from './paipan';
import {
  computeDizhiAnalysis,
  benBianLabel,
  yueJianLabels,
  riChenLabels,
  sanHeLabels,
  assessSpirit,
  MUKU,
} from './dizhiAnalysis';

/**
 * 地支分析（功能一/二）测试
 *
 * 固定日历口径（与 paipan.test.js 一致）：
 *   2026-08-04 庚戌日（甲辰旬，空亡寅卯），月建未（土）——庚日，六神起白虎
 *   2024-02-10 甲辰日，月建寅（木）
 */

/** 构造完整爻数组（synthetic 单测用）：初→上 6 项 */
function mkYao(list) {
  return list.map(([liuqin, zhi, wuxing, dong, wangshuai]) => ({
    liuqin, zhi, wuxing, dong, wangshuai,
  }));
}

/** assessSpirit 上下文构造：按被判定爻五行自动带入墓库 */
function ctxFor(wuxing, overrides = {}) {
  return {
    yueZhi: '未',
    riZhi: '戌',
    kong: [],
    dongIdx: [],
    bianZhi: null,
    bianWx: null,
    yaoZhi: [],
    mu: MUKU[wuxing],
    ...overrides,
  };
}

describe('A. 本变五行（benBianLabel 各分支）', () => {
  test('同五行：进神 / 退神 / 比和', () => {
    expect(benBianLabel('寅', '木', '卯', '木')).toBe('化进神（寅→卯）');
    expect(benBianLabel('巳', '火', '午', '火')).toBe('化进神（巳→午）');
    expect(benBianLabel('申', '金', '酉', '金')).toBe('化进神（申→酉）');
    expect(benBianLabel('亥', '水', '子', '水')).toBe('化进神（亥→子）');
    expect(benBianLabel('卯', '木', '寅', '木')).toBe('化退神（卯→寅）');
    expect(benBianLabel('午', '火', '巳', '火')).toBe('化退神（午→巳）');
    expect(benBianLabel('酉', '金', '申', '金')).toBe('化退神（酉→申）');
    expect(benBianLabel('子', '水', '亥', '水')).toBe('化退神（子→亥）');
    expect(benBianLabel('午', '火', '午', '火')).toBe('化比和（午→午）');
    expect(benBianLabel('子', '水', '丑', '水')).toBe('化比和（子→丑）'); // 同五行但非进/退
  });

  test('v0.10 改进建7 #8：土支化进退（补齐 丑辰未戌 环）', () => {
    // 顺行（进）：丑→辰、辰→未、未→戌、戌→丑
    expect(benBianLabel('丑', '土', '辰', '土')).toBe('化进神（丑→辰）');
    expect(benBianLabel('辰', '土', '未', '土')).toBe('化进神（辰→未）');
    expect(benBianLabel('未', '土', '戌', '土')).toBe('化进神（未→戌）');
    expect(benBianLabel('戌', '土', '丑', '土')).toBe('化进神（戌→丑）');
    // 逆行（退）：辰→丑、未→辰、戌→未、丑→戌
    expect(benBianLabel('辰', '土', '丑', '土')).toBe('化退神（辰→丑）');
    expect(benBianLabel('未', '土', '辰', '土')).toBe('化退神（未→辰）');
    expect(benBianLabel('戌', '土', '未', '土')).toBe('化退神（戌→未）'); // 用户实例：天泽履上爻戌→未
    expect(benBianLabel('丑', '土', '戌', '土')).toBe('化退神（丑→戌）');
    // 土支同土但非进退（如丑→未 六冲）→ 化比和
    expect(benBianLabel('丑', '土', '未', '土')).toBe('化比和（丑→未）');
  });

  test('异五行：化回头生 / 化回头克 / 化他', () => {
    expect(benBianLabel('辰', '土', '午', '火')).toBe('化回头生（午火生辰土）');
    expect(benBianLabel('子', '水', '未', '土')).toBe('化回头克（未土克子水）');
    expect(benBianLabel('子', '水', '寅', '木')).toBe('化他（寅木）'); // 木既不生也不克水
    expect(benBianLabel('丑', '土', '寅', '木')).toBe('化回头克（寅木克丑土）');
  });

  test('集成：天火同人二爻动 丑土化寅木 → 化回头克', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '121111', dong: [1] },
      date: new Date(2026, 7, 4),
      dizhi: true,
    });
    expect(r.dizhiAnalysis.benBian).toEqual([{ yaoIndex: 1, text: '化回头克（寅木克丑土）' }]);
  });
});

describe('B. 月建与爻（yueJianLabels）', () => {
  test('临月建 / 月破 / 月六合 / 月墓', () => {
    expect(yueJianLabels('未', '土', '未')).toEqual(['临月建']);
    expect(yueJianLabels('丑', '土', '未')).toEqual(['月破']); // 丑未冲
    expect(yueJianLabels('午', '火', '未')).toEqual(['月六合']); // 午未合
    expect(yueJianLabels('卯', '木', '未')).toEqual(['月墓']); // 木墓未
    expect(yueJianLabels('申', '金', '未')).toEqual([]); // 无关系
    expect(yueJianLabels('丑', '土', '子')).toEqual(['月六合']); // 子丑合
  });

  test('集成：坤为地 2026-08-04 月建未 → 初爻未土临月建、三爻卯木月墓、四爻丑土月破', () => {
    const r = paipan({ method: 'qian', params: { lines: '222222' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r.yuejian).toBe('未');
    const yueJian = r.dizhiAnalysis.yueJian;
    expect(yueJian).toContainEqual({ yaoIndex: 0, text: '临月建' });
    expect(yueJian).toContainEqual({ yaoIndex: 2, text: '月墓' });
    expect(yueJian).toContainEqual({ yaoIndex: 3, text: '月破' });
  });

  test('集成：天风姤 2026-08-04 → 初爻丑土月破、四爻午火月六合', () => {
    const r = paipan({ method: 'qian', params: { lines: '211111' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r.dizhiAnalysis.yueJian).toEqual([
      { yaoIndex: 0, text: '月破' },
      { yaoIndex: 3, text: '月六合' },
    ]);
  });
});

describe('C. 日辰与爻（riChenLabels）', () => {
  test('临日建 / 六合 / 三合 / 日墓', () => {
    expect(riChenLabels('戌', '土', false, '旺', '戌')).toEqual(['临日建', '日墓']); // 临日建且土墓戌
    expect(riChenLabels('卯', '木', false, '旺', '戌')).toEqual(['日六合']); // 戌卯合
    expect(riChenLabels('寅', '木', false, '旺', '戌')).toEqual(['日三合火局']); // 寅午戌
    expect(riChenLabels('午', '火', false, '旺', '戌')).toEqual(['日三合火局', '日墓']); // 火墓戌
    expect(riChenLabels('辰', '土', false, '旺', '戌')).toEqual(['暗动', '日墓']); // 辰戌冲(暗动) + 土墓戌
    expect(riChenLabels('戌', '土', false, '旺', '戌')).toEqual(['临日建', '日墓']); // 同日支不计三合，但土墓戌
  });

  test('六冲细分：暗动 / 日破 / 动而愈动 / 动而冲散', () => {
    expect(riChenLabels('辰', '土', false, '旺', '戌')).toContain('暗动'); // 静爻旺相
    expect(riChenLabels('辰', '土', false, '囚', '戌')).toContain('日破'); // 静爻休囚
    expect(riChenLabels('辰', '土', true, '旺', '戌')).toContain('动而愈动'); // 动爻旺相
    expect(riChenLabels('辰', '土', true, '囚', '戌')).toContain('动而冲散'); // 动爻休囚
  });

  test('集成：乾为天 2026-08-04 日戌', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), dizhi: true });
    const riChen = r.dizhiAnalysis.riChen;
    // 三爻辰土：旺相静爻冲日戌 → 暗动；土墓戌 → 日墓
    expect(riChen).toContainEqual({ yaoIndex: 2, text: '暗动' });
    expect(riChen).toContainEqual({ yaoIndex: 2, text: '日墓' });
    // 四爻午火：日三合火局 + 日墓
    expect(riChen).toContainEqual({ yaoIndex: 3, text: '日三合火局' });
    expect(riChen).toContainEqual({ yaoIndex: 3, text: '日墓' });
    // 上爻戌土：临日建（与日支同，不重复计日三合）
    expect(riChen).toContainEqual({ yaoIndex: 5, text: '临日建' });
    expect(riChen).not.toContainEqual({ yaoIndex: 5, text: '日三合火局' });
  });
});

describe('D. 动爻分析', () => {
  test('被其他动爻五行生/克', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [1, 2] },
      date: new Date(2026, 7, 4),
      dizhi: true,
    });
    // 二爻寅木(动) 克 三爻辰土(动) → 三爻被二爻克
    expect(r.dizhiAnalysis.dongYao).toEqual([{ yaoIndex: 2, text: '被二爻克' }]);
  });

  test('被生：初爻子水动被五爻申金动生', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 4] },
      date: new Date(2026, 7, 4),
      dizhi: true,
    });
    // 金生水 → 初爻被五爻生
    expect(r.dizhiAnalysis.dongYao).toContainEqual({ yaoIndex: 0, text: '被五爻生' });
  });
});

describe('E. 卦内三合局检测（sanHeLabels）', () => {
  test('地支全 / 缺支待填实', () => {
    // 乾为天 子寅辰午申戌：申子辰全、寅午戌全
    expect(sanHeLabels(['子', '寅', '辰', '午', '申', '戌'])).toEqual([
      '卦内三合水局（地支全）',
      '卦内三合火局（地支全）',
    ]);
    // 天风姤 丑亥酉午申戌：寅午戌缺寅、巳酉丑缺巳
    expect(sanHeLabels(['丑', '亥', '酉', '午', '申', '戌'])).toEqual([
      '卦内三合火局（缺寅，待填实）',
      '卦内三合金局（缺巳，待填实）',
    ]);
    // 坤为地 未巳卯丑亥酉：亥卯未全、巳酉丑全
    expect(sanHeLabels(['未', '巳', '卯', '丑', '亥', '酉'])).toEqual([
      '卦内三合木局（地支全）',
      '卦内三合金局（地支全）',
    ]);
  });

  test('集成：乾为天 → 水局+火局 地支全', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r.dizhiAnalysis.sanHe).toEqual([
      { text: '卦内三合水局（地支全）' },
      { text: '卦内三合火局（地支全）' },
    ]);
  });
});

describe('F. 入墓', () => {
  test('集成：乾为天 2026-08-04 → 月墓/日墓', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), dizhi: true });
    const ruMu = r.dizhiAnalysis.ruMu;
    expect(ruMu).toContainEqual({ yaoIndex: 1, text: '月墓' }); // 寅木木墓未
    expect(ruMu).toContainEqual({ yaoIndex: 2, text: '日墓' }); // 辰土土墓戌
    expect(ruMu).toContainEqual({ yaoIndex: 3, text: '日墓' }); // 午火火墓戌
    expect(ruMu).toContainEqual({ yaoIndex: 5, text: '日墓' }); // 戌土土墓戌
  });

  test('动爻墓（被X爻墓）+ 空墓（synthetic）：水墓辰，辰在旬空', () => {
    const yao = mkYao([
      ['兄', '辰', '土', true, '旺'],   // 0 辰土动（他人之墓，且辰旬空）
      ['孙', '子', '水', false, '旺'],  // 1 子水 墓库=辰
      ['兄', '酉', '金', false, '相'],  // 2
      ['父', '戌', '土', false, '旺'],  // 3
      ['财', '寅', '木', false, '死'],  // 4
      ['官', '午', '火', false, '休'],  // 5
    ]);
    const da = computeDizhiAnalysis({
      yao,
      bian: { liuqin: ['兄酉金', '孙亥水', '父未土', '财卯木', '官巳火', '父未土'] }, // 初爻变 未土（非水墓，无化墓）
      monthGZ: '甲辰', // 水墓辰 → 月墓
      dayGZ: '壬午',
      xunkong: ['辰', '巳'], // 辰落旬空 → 空墓
    });
    // 子水（索引1）：月墓且辰空 → 月墓（空墓）；另有动爻辰土（初爻）→ 被初爻墓（空墓）
    expect(da.ruMu).toContainEqual({ yaoIndex: 1, text: '月墓（空墓）' });
    expect(da.ruMu).toContainEqual({ yaoIndex: 1, text: '被初爻墓（空墓）' });
    // 辰土（索引0）动爻变未土：土墓戌非未 → 无化墓
    expect(da.ruMu.some((e) => e.yaoIndex === 0 && e.text.includes('化墓'))).toBe(false);
  });

  test('化墓（synthetic）：子水动变辰 → 化墓', () => {
    const yao = mkYao([
      ['孙', '子', '水', true, '旺'],   // 0 子水动，墓库=辰
      ['兄', '酉', '金', false, '相'],  // 1
      ['父', '戌', '土', false, '旺'],  // 2
      ['财', '卯', '木', false, '死'],  // 3
      ['官', '巳', '火', false, '休'],  // 4
      ['父', '未', '土', false, '旺'],  // 5
    ]);
    const da = computeDizhiAnalysis({
      yao,
      bian: { liuqin: ['官巳火', '父未土', '财卯木', '父戌土', '兄酉金', '父辰土'] }, // 初爻变 辰土
      monthGZ: '乙未',
      dayGZ: '庚戌',
      xunkong: [],
    });
    expect(da.ruMu).toContainEqual({ yaoIndex: 0, text: '化墓' });
  });
});

describe('G. 真空', () => {
  test('v0.10 标准口径：2026-08-04 旬空寅卯，二爻寅木 木克月建=囚（非死）→ 不真空', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r.xunkong).toEqual(['寅', '卯']);
    expect(r.yao[1].wangshuai).toBe('囚'); // v0.10：爻克月建=囚（旧口径为死）
    expect(r.dizhiAnalysis.zhenKong).toEqual([]);
  });

  test('死地+旬空 → 真空（synthetic：月建克爻=死）', () => {
    const yao = mkYao([
      ['孙', '子', '水', false, '死'],  // 子水 死 + 旬空 → 真空
      ['兄', '酉', '金', false, '相'],
      ['父', '戌', '土', false, '旺'],
    ]);
    const da = computeDizhiAnalysis({
      yao,
      monthGZ: '乙未', // 未土克子水=死
      dayGZ: '庚戌',
      xunkong: ['子'],
    });
    expect(da.zhenKong).toEqual([{ yaoIndex: 0 }]);
  });

  test('旬空但旺相不真空', () => {
    // 2024-02-10 甲辰日 月建寅：乾为天二爻寅木 旺 且 旬空（寅卯）→ 不真空
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2024, 1, 10), dizhi: true });
    expect(r.xunkong).toEqual(['寅', '卯']);
    expect(r.yao[1].wangshuai).toBe('旺');
    expect(r.dizhiAnalysis.zhenKong).toEqual([]);
  });
});

describe('H. 卦形（六合卦/六冲卦）', () => {
  test('乾为天 六冲卦 / 地天泰 六合卦', () => {
    const r1 = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r1.ben.liuchong).toBe(true);
    expect(r1.dizhiAnalysis.guaXing).toBe('六冲卦');
    const r2 = paipan({ method: 'qian', params: { lines: '111222' }, date: new Date(2026, 7, 4), dizhi: true });
    expect(r2.ben.liuhe).toBe(true);
    expect(r2.dizhiAnalysis.guaXing).toBe('六合卦');
  });
});

describe('I. 元神/忌神有力判定', () => {
  test('用神=财（乾为天 2026-08-04）：元神初爻子水无力（休囚不动）、忌神五爻申金有力（旺相）', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date: new Date(2026, 7, 4),
      yongShen: { type: 'liuqin', value: '财' },
    });
    expect(r.yongShen).toEqual({ type: 'liuqin', value: '财' });
    expect(r.dizhiAnalysis.yongShenJi).toEqual([
      { yaoIndex: 0, text: '元神（初爻·孙子水）无力' },
      { yaoIndex: 4, text: '忌神（五爻·兄申金）有力' },
    ]);
  });

  test('用神=父 多现（天风姤 父×2）→ 命中多现全部命中、元神去重为单条', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '211111' },
      date: new Date(2026, 7, 4),
      yongShen: { type: 'liuqin', value: '父' },
    });
    // 命中多现：初爻、上爻均为父
    const hits = r.yao.map((y, i) => (yongShenHit(y, r.yongShen) ? i : -1)).filter((i) => i >= 0);
    expect(hits).toEqual([0, 5]);
    // 元神=生土者火 → 仅四爻官午火，两条用神共享 → 去重为 1 条（午火休、不动 → 无力）
    expect(r.dizhiAnalysis.yongShenJi).toEqual([
      { yaoIndex: 3, text: '元神（四爻·官午火）无力' },
    ]);
  });

  test('用神=地支 辰（乾为天）', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date: new Date(2026, 7, 4),
      yongShen: { type: 'zhi', value: '辰' },
    });
    const hits = r.yao.map((y, i) => (yongShenHit(y, r.yongShen) ? i : -1)).filter((i) => i >= 0);
    expect(hits).toEqual([2]); // 三爻父辰土
    // 元神=生土者火 → 四爻官午火（休、不动 → 无力）；忌神=克土者木 → 二爻财寅木（死/真空 → 无力）
    expect(r.dizhiAnalysis.yongShenJi).toEqual([
      { yaoIndex: 1, text: '忌神（二爻·财寅木）无力' },
      { yaoIndex: 3, text: '元神（四爻·官午火）无力' },
    ]);
  });

  test('assessSpirit：无力诸因', () => {
    // 月破：丑土冲月未（日支改酉避免与土墓戌相扰）
    expect(assessSpirit({ index: 0, zhi: '丑', wuxing: '土', dong: false, wangshuai: '旺' }, ctxFor('土', { riZhi: '酉' }))).toBe('无力');
    // 入墓：水墓辰，另有动爻辰
    expect(
      assessSpirit(
        { index: 0, zhi: '申', wuxing: '水', dong: false, wangshuai: '旺' },
        ctxFor('水', { dongIdx: [1], yaoZhi: ['申', '辰', '酉', '戌', '寅', '午'] }),
      ),
    ).toBe('无力');
    // 化回头克：动爻子水 化未土
    expect(assessSpirit({ index: 0, zhi: '子', wuxing: '水', dong: true, wangshuai: '旺' }, ctxFor('水', { bianZhi: '未', bianWx: '土' }))).toBe('无力');
    // 化退神：动爻卯木 化寅木（月午日避免木墓未/日戌干扰）
    expect(assessSpirit({ index: 0, zhi: '卯', wuxing: '木', dong: true, wangshuai: '旺' }, ctxFor('木', { yueZhi: '午', riZhi: '子', bianZhi: '寅', bianWx: '木' }))).toBe('无力');
    // 日破：静爻休囚冲日支（辰土冲戌日，土墓戌亦无力，判定一致）
    expect(assessSpirit({ index: 0, zhi: '辰', wuxing: '土', dong: false, wangshuai: '囚' }, ctxFor('土'))).toBe('无力');
    // 真空：旬空 + 死
    expect(assessSpirit({ index: 0, zhi: '寅', wuxing: '木', dong: false, wangshuai: '死' }, ctxFor('木', { yueZhi: '午', riZhi: '子', kong: ['寅'] }))).toBe('无力');
    // 休囚旬空
    expect(assessSpirit({ index: 0, zhi: '寅', wuxing: '木', dong: false, wangshuai: '休' }, ctxFor('木', { yueZhi: '午', riZhi: '子', kong: ['寅'] }))).toBe('无力');
    // 休囚不动
    expect(assessSpirit({ index: 0, zhi: '子', wuxing: '水', dong: false, wangshuai: '囚' }, ctxFor('水'))).toBe('无力');
    // 衰绝
    expect(assessSpirit({ index: 0, zhi: '申', wuxing: '金', dong: false, wangshuai: '死' }, ctxFor('金'))).toBe('无力');
  });

  test('assessSpirit：有力诸因（旺相/临日月/化回头生/化进神/发动）', () => {
    expect(assessSpirit({ index: 0, zhi: '申', wuxing: '金', dong: false, wangshuai: '相' }, ctxFor('金'))).toBe('有力'); // 旺相
    expect(assessSpirit({ index: 0, zhi: '子', wuxing: '水', dong: false, wangshuai: '旺' }, ctxFor('水', { yueZhi: '子' }))).toBe('有力'); // 临月建
    expect(assessSpirit({ index: 0, zhi: '寅', wuxing: '木', dong: true, wangshuai: '休' }, ctxFor('木', { yueZhi: '午', riZhi: '子', bianZhi: '卯', bianWx: '木' }))).toBe('有力'); // 化进神/发动
    expect(assessSpirit({ index: 0, zhi: '子', wuxing: '水', dong: true, wangshuai: '休' }, ctxFor('水', { bianZhi: '申', bianWx: '金' }))).toBe('有力'); // 化回头生
    expect(assessSpirit({ index: 0, zhi: '寅', wuxing: '木', dong: true, wangshuai: '休' }, ctxFor('木', { yueZhi: '午', riZhi: '子' }))).toBe('有力'); // 发动
  });
});

describe('paipan 参数与快照兼容', () => {
  test('默认不计算 dizhiAnalysis（旧行为）', () => {
    const r = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 4) });
    expect(r.dizhiAnalysis).toBeNull();
    expect(r.yongShen).toBeNull();
  });

  test('yongShen 传入即计算 dizhiAnalysis 并记录快照', () => {
    const r = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date: new Date(2026, 7, 4),
      yongShen: { type: 'zhi', value: '子' },
    });
    expect(r.dizhiAnalysis).not.toBeNull();
    expect(r.yongShen).toEqual({ type: 'zhi', value: '子' });
    expect(r.dizhiAnalysis.benBian).toEqual([]); // 无动爻
  });

  test('yongShenHit 边界：未选用神 / 空爻返回 false', () => {
    expect(yongShenHit({ liuqin: '父', zhi: '戌' }, null)).toBe(false);
    expect(yongShenHit(null, { type: 'liuqin', value: '父' })).toBe(false);
  });
});
