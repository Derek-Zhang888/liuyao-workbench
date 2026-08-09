/**
 * 盘面标记模块测试（v0.2，功能 B）
 * 验证 computePanMarkers 的 11 个开关判定与 paipan markers 选项烘焙：
 *   旺相休囚死 / 月破 / 日破（引擎休囚细分）/ 月合 / 日合 /
 *   回头生克冲合 / 化进退 / 反伏吟 / 日月建六亲
 * 兼容：markers 缺省/全关时 pan.markers 省略；旧快照无 markers 不崩。
 */
import { describe, expect, test } from 'vitest';
import {
  computePanMarkers,
  MARKER_KEYS,
  MARKER_GLYPHS,
  markerBadgesFor,
  markerBadgesForBian,
  markerBadgesForFushen,
  wangshuaiAt,
} from './panMarkers.js';
import { paipan } from './paipan.js';

/** 构造单个爻对象（初→上 数组由调用方拼装） */
const mkYao = (over = {}) => ({
  liuqin: '父', zhi: '子', wuxing: '水', line: 1, dong: false, wangshuai: '旺',
  ...over,
});

/** 快捷：六爻数组（可部分覆盖） */
const yaoOf = (list) => list.map((o) => mkYao(o));

describe('computePanMarkers 各开关判定', () => {
  test('markers 缺省/全关 → 空对象（paipan 侧省略 pan.markers）', () => {
    expect(computePanMarkers({ yao: yaoOf([{}]), markers: null })).toEqual({});
    expect(computePanMarkers({ yao: yaoOf([{}]), markers: {} })).toEqual({});
    expect(computePanMarkers({ yao: yaoOf([{}]) })).toEqual({});
    // 全 false 亦为空
    const allOff = Object.fromEntries(MARKER_KEYS.map((k) => [k, false]));
    expect(computePanMarkers({ yao: yaoOf([{}]), markers: allOff })).toEqual({});
  });

  test('marker-wangshuai：直读 yao.wangshuai，输出 [{i, ws}]', () => {
    const yao = yaoOf([
      { zhi: '子', wuxing: '水', wangshuai: '囚' },
      { zhi: '寅', wuxing: '木', wangshuai: '死' },
      { zhi: '辰', wuxing: '土', wangshuai: '旺' },
    ]);
    const r = computePanMarkers({ yao, markers: { 'marker-wangshuai': true } });
    expect(r.wangshuai).toEqual([
      { i: 0, ws: '囚' },
      { i: 1, ws: '死' },
      { i: 2, ws: '旺' },
    ]);
    // 仅开启此项时不产出其余键
    expect(r).not.toHaveProperty('yuePo');
  });

  test('marker-yuepo：爻支与月支六冲（CHONG[zhi]===月支）', () => {
    const yao = yaoOf([
      { zhi: '丑', wuxing: '土' }, // 丑未冲 → 月破
      { zhi: '子', wuxing: '水' }, // 子未无冲
    ]);
    const r = computePanMarkers({ yao, monthGZ: '乙未', markers: { 'marker-yuepo': true } });
    expect(r.yuePo).toEqual([0]);
  });

  test('marker-ripo：日破按引擎休囚细分（仅静爻休囚被日冲，旺相=暗动不计）', () => {
    const yao = yaoOf([
      { zhi: '辰', wuxing: '土', dong: false, wangshuai: '囚' }, // 辰戌冲 + 休囚 → 日破
      { zhi: '辰', wuxing: '土', dong: false, wangshuai: '旺' }, // 辰戌冲 + 旺相 → 暗动，不计
      { zhi: '午', wuxing: '火', dong: false, wangshuai: '死' }, // 午戌无冲
    ]);
    const r = computePanMarkers({ yao, dayGZ: '庚戌', markers: { 'marker-ripo': true } });
    expect(r.riPo).toEqual([0]);
    // 日合开关互不影响：仅开 ripo 时无 riHe
    expect(r).not.toHaveProperty('riHe');
  });

  test('marker-yuehe / marker-rihe：爻支与月支/日支六合', () => {
    const yao = yaoOf([
      { zhi: '子', wuxing: '水' }, // 子丑合 → 月合（月建丑）
      { zhi: '卯', wuxing: '木' }, // 卯戌合 → 日合（日建戌）
    ]);
    const r = computePanMarkers({
      yao, monthGZ: '乙丑', dayGZ: '庚戌',
      markers: { 'marker-yuehe': true, 'marker-rihe': true },
    });
    expect(r.yueHe).toEqual([0]);
    expect(r.riHe).toEqual([1]);
  });

  test('回头生/回头克：变爻五行生/克本爻五行（仅动爻）', () => {
    const yao = yaoOf([
      { zhi: '寅', wuxing: '木', dong: true }, // 变子水：水生木 → 回头生
      { zhi: '寅', wuxing: '木', dong: true }, // 变申金：金克木 → 回头克
      { zhi: '子', wuxing: '水', dong: false }, // 静爻不计
    ]);
    // bian.liuqin 为上→初，索引 5-i 取同爻位：0→[5]，1→[4]，2→[3]
    const bian = { liuqin: ['父戌土', '兄申金', '父午火', '兄酉金', '兄申金', '父子水'] };
    const r = computePanMarkers({
      yao, bian,
      markers: { 'marker-huitou-sheng': true, 'marker-huitou-ke': true },
    });
    expect(r.huitouSheng).toEqual([0]);
    expect(r.huitouKe).toEqual([1]);
  });

  test('回头冲/回头合：变爻支与本爻支六冲/六合（仅动爻）', () => {
    const yao = yaoOf([
      { zhi: '子', wuxing: '水', dong: true }, // 变午火：子午冲 → 回头冲
      { zhi: '子', wuxing: '水', dong: true }, // 变丑土：子丑合 → 回头合
      { zhi: '午', wuxing: '火', dong: true }, // 变午火：无冲无合
    ]);
    // bian.liuqin 上→初：i=0→[5]，i=1→[4]，i=2→[3]
    const bian = { liuqin: ['父戌土', '父丑土', '父午火', '父午火', '父丑土', '父午火'] };
    const r = computePanMarkers({
      yao, bian,
      markers: { 'marker-huitou-chong': true, 'marker-huitou-he': true },
    });
    expect(r.huitouChong).toEqual([0]);
    expect(r.huitouHe).toEqual([1]);
  });

  test('化进退：JINSHEN 进 / TUISHEN 退（仅动爻）', () => {
    const yao = yaoOf([
      { zhi: '寅', wuxing: '木', dong: true }, // 变卯 → 进神
      { zhi: '卯', wuxing: '木', dong: true }, // 变寅 → 退神
    ]);
    const bian = { liuqin: ['父戌土', '父寅木', '父午火', '父午火', '父寅木', '父卯木'] };
    const r = computePanMarkers({ yao, bian, markers: { 'marker-jintui-fanfuyin': true } });
    expect(r.jinTui).toEqual([{ i: 0, label: '进' }, { i: 1, label: '退' }]);
  });

  test('反伏吟：本变同支=伏吟、相冲=反吟（仅动爻）', () => {
    const yao = yaoOf([
      { zhi: '子', wuxing: '水', dong: true }, // 变子 → 伏吟
      { zhi: '子', wuxing: '水', dong: true }, // 变午 → 反吟
    ]);
    const bian = { liuqin: ['父戌土', '父午火', '父午火', '父午火', '父午火', '父子水'] };
    const r = computePanMarkers({ yao, bian, markers: { 'marker-jintui-fanfuyin': true } });
    expect(r.fanYin).toEqual([{ i: 0, label: '伏' }, { i: 1, label: '反' }]);
  });

  test('marker-riyue-liuqin：以卦宫五行为"我"推月/日支六亲', () => {
    const r = computePanMarkers({
      yao: yaoOf([{}]),
      monthGZ: '乙未', dayGZ: '庚戌', gongWx: '金',
      markers: { 'marker-riyue-liuqin': true },
    });
    // 金宫：土生金 → 未土/戌土皆六亲「父」
    expect(r.riyueLiqin).toEqual({
      yue: { zhi: '未', wuxing: '土', liuqin: '父' },
      ri: { zhi: '戌', wuxing: '土', liuqin: '父' },
    });
  });

  test('组合开关：多开关同时开启时各键互不干扰', () => {
    const yao = yaoOf([
      { zhi: '丑', wuxing: '土', wangshuai: '旺' },
      { zhi: '子', wuxing: '水', wangshuai: '囚' },
    ]);
    const r = computePanMarkers({
      yao, monthGZ: '乙未', dayGZ: '庚戌', gongWx: '金',
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true, 'marker-riyue-liuqin': true },
    });
    expect(r.wangshuai).toHaveLength(2);
    expect(r.yuePo).toEqual([0]); // 丑未冲
    expect(r.riyueLiqin.ri.liuqin).toBe('父');
    expect(r).not.toHaveProperty('riPo');
    expect(r).not.toHaveProperty('huitouSheng');
  });
});

describe('paipan markers 选项集成', () => {
  test('开启任一开关 → pan.markers 烘焙；缺省/全关 → 省略（旧快照兼容）', () => {
    const date = new Date(2026, 7, 4, 10, 30);
    const pOn = paipan({
      method: 'qian', params: { lines: '111111', dong: [0, 2] }, date,
      markers: { 'marker-wangshuai': true },
    });
    expect(pOn.markers.wangshuai).toHaveLength(6); // 乾为天六爻
    // v0.10 标准口径：2026-08-04 月建未土 克 初爻子水 → 死（旧口径为囚）
    expect(pOn.markers.wangshuai[0]).toMatchObject({ i: 0, ws: '死' });

    const pOff = paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date });
    expect('markers' in pOff).toBe(false);

    const pAllOff = paipan({
      method: 'qian', params: { lines: '111111', dong: [0, 2] }, date,
      markers: { 'marker-wangshuai': false },
    });
    expect('markers' in pAllOff).toBe(false);
  });

  test('乾为天 初三爻动：回头生/化进/反伏吟标记与 engine 语义一致', () => {
    const p = paipan({
      method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30),
      markers: {
        'marker-huitou-sheng': true,
        'marker-huitou-ke': true,
        'marker-jintui-fanfuyin': true,
        'marker-yuepo': true,
      },
    });
    expect(p.markers.yuePo).toBeDefined();
    // 不抛错且各数组均为数字索引或 {i,label} 结构
    for (const key of ['huitouSheng', 'huitouKe']) {
      if (p.markers[key]) {
        for (const i of p.markers[key]) expect(Number.isInteger(i)).toBe(true);
      }
    }
  });
});

describe('markerBadgesFor / MARKER_GLYPHS（v0.10 字形写全）', () => {
  test('markers 为 null → []；有命中 → 字形+说明（月破/日破/月合/日合写全）', () => {
    expect(markerBadgesFor(null, 0)).toEqual([]);
    const markers = {
      yuePo: [0],
      riPo: [0],
      yueHe: [0],
      riHe: [0],
      jinTui: [{ i: 2, label: '进' }],
      fanYin: [{ i: 3, label: '反' }],
    };
    expect(markerBadgesFor(markers, 0)).toEqual([
      { g: MARKER_GLYPHS.yuePo, t: '月破' },
      { g: MARKER_GLYPHS.riPo, t: '日破（静爻休囚被日冲）' },
      { g: MARKER_GLYPHS.yueHe, t: '月合' },
      { g: MARKER_GLYPHS.riHe, t: '日合' },
    ]);
    expect(markerBadgesFor(markers, 2)).toEqual([{ g: '进', t: '化进神' }]);
    expect(markerBadgesFor(markers, 3)).toEqual([{ g: '反', t: '反吟' }]);
    expect(markerBadgesFor(markers, 4)).toEqual([]);
    // v0.10：字形写全（不再只写「破/合」）
    expect(MARKER_GLYPHS.yuePo).toBe('月破');
    expect(MARKER_GLYPHS.riPo).toBe('日破');
    expect(MARKER_GLYPHS.yueHe).toBe('月合');
    expect(MARKER_GLYPHS.riHe).toBe('日合');
  });

  test('v0.10：回头生克冲合移至变爻处（markerBadgesFor 不含回头，markerBadgesForBian 含且箭头指向左）', () => {
    const markers = {
      huitouSheng: [0],
      huitouKe: [1],
      huitouChong: [2],
      huitouHe: [3],
    };
    // 本卦列不再显示回头
    expect(markerBadgesFor(markers, 0)).toEqual([]);
    // 变爻列显示回头，箭头指向左 ↲
    expect(markerBadgesForBian(markers, 0)).toEqual([{ g: '↲生', t: '回头生' }]);
    expect(markerBadgesForBian(markers, 1)).toEqual([{ g: '↲克', t: '回头克' }]);
    expect(markerBadgesForBian(markers, 2)).toEqual([{ g: '↲冲', t: '回头冲' }]);
    expect(markerBadgesForBian(markers, 3)).toEqual([{ g: '↲合', t: '回头合' }]);
  });

  test('v0.10：markerBadgesForBian 含变爻月破日破月合日合；markerBadgesForFushen 含伏神破合', () => {
    const markers = {
      bianYuePo: [0],
      bianRiPo: [0],
      bianYueHe: [1],
      bianRiHe: [1],
      fushenYuePo: [2],
      fushenRiHe: [3],
    };
    expect(markerBadgesForBian(markers, 0)).toEqual([
      { g: '月破', t: '变爻月破' },
      { g: '日破', t: '变爻日破' },
    ]);
    expect(markerBadgesForBian(markers, 1)).toEqual([
      { g: '月合', t: '变爻月合' },
      { g: '日合', t: '变爻日合' },
    ]);
    expect(markerBadgesForFushen(markers, 2)).toEqual([{ g: '月破', t: '伏神月破' }]);
    expect(markerBadgesForFushen(markers, 3)).toEqual([{ g: '日合', t: '伏神日合' }]);
  });

  test('wangshuaiAt：ben/fushen/bian 三态取值，无命中返回 null', () => {
    const markers = {
      wangshuai: [{ i: 0, ws: '旺' }],
      fushenWangshuai: [{ i: 1, ws: '囚' }],
      bianWangshuai: [{ i: 2, ws: '死' }],
    };
    expect(wangshuaiAt(markers, 0, 'ben')).toEqual({ i: 0, ws: '旺' });
    expect(wangshuaiAt(markers, 1, 'fushen')).toEqual({ i: 1, ws: '囚' });
    expect(wangshuaiAt(markers, 2, 'bian')).toEqual({ i: 2, ws: '死' });
    expect(wangshuaiAt(markers, 3, 'ben')).toBeNull();
    expect(wangshuaiAt(null, 0, 'ben')).toBeNull();
  });
});

describe('v0.10：变爻/伏神旺相休囚死 + 月破日破月合日合扩展', () => {
  /** 构造单个爻对象（含 fushen） */
  const mkYao = (over = {}) => ({
    liuqin: '父', zhi: '子', wuxing: '水', line: 1, dong: false, wangshuai: '旺', fushen: null,
    ...over,
  });
  const yaoOf = (list) => list.map((o) => mkYao(o));

  test('伏神旺衰：按伏神五行 vs 月建现算（marker-wangshuai）', () => {
    const yao = yaoOf([
      { fushen: { liuqin: '财', zhi: '寅', wuxing: '木' } }, // 月建未土：木克土 → 囚
      { fushen: { liuqin: '官', zhi: '子', wuxing: '水' } }, // 月建未土：土克水 → 死
      {}, // 无伏神
    ]);
    const r = computePanMarkers({ yao, monthGZ: '乙未', markers: { 'marker-wangshuai': true } });
    expect(r.fushenWangshuai).toEqual([{ i: 0, ws: '囚' }, { i: 1, ws: '死' }]);
  });

  test('伏神月破/日破/月合/日合', () => {
    // 月破：月建未土，伏神丑土（丑未冲）
    const r1 = computePanMarkers({
      yao: yaoOf([{ fushen: { liuqin: '财', zhi: '丑', wuxing: '土' } }]),
      monthGZ: '乙未',
      markers: { 'marker-yuepo': true },
    });
    expect(r1.fushenYuePo).toEqual([0]);
    // 月合：月建丑土，伏神子水（子丑合）
    const r2 = computePanMarkers({
      yao: yaoOf([{ fushen: { liuqin: '财', zhi: '子', wuxing: '水' } }]),
      monthGZ: '乙丑',
      markers: { 'marker-yuehe': true },
    });
    expect(r2.fushenYueHe).toEqual([0]);
    // 日合：日建戌土，伏神卯木（卯戌合）
    const r3 = computePanMarkers({
      yao: yaoOf([{ fushen: { liuqin: '财', zhi: '卯', wuxing: '木' } }]),
      dayGZ: '庚戌',
      markers: { 'marker-rihe': true },
    });
    expect(r3.fushenRiHe).toEqual([0]);
    // 日破：日建戌土，伏神辰土（辰戌冲）且休囚（月建未土：同土=旺 → 暗动，不日破）
    const r4 = computePanMarkers({
      yao: yaoOf([{ fushen: { liuqin: '财', zhi: '辰', wuxing: '土' } }]),
      monthGZ: '乙未', dayGZ: '庚戌',
      markers: { 'marker-ripo': true },
    });
    expect(r4.fushenRiPo).toBeUndefined();
    // 日破：伏神申金（申戌无冲）→ 无；伏神辰土休囚场景：月建寅木克土=死 → 日破
    const r5 = computePanMarkers({
      yao: yaoOf([{ fushen: { liuqin: '财', zhi: '辰', wuxing: '土' } }]),
      monthGZ: '甲寅', dayGZ: '庚戌',
      markers: { 'marker-ripo': true },
    });
    expect(r5.fushenRiPo).toEqual([0]);
  });

  test('v0.10 改进建7 #7：变卦全部 6 爻旺衰（不再仅动爻，marker-wangshuai）', () => {
    const yao = yaoOf([
      { dong: true },  // 变申金：月建未土生金 → 相
      { dong: true },  // 变寅木：木克土 → 囚
      { dong: false }, // 静爻也计（变午火：火生土 → 休）
    ]);
    const bian = { liuqin: ['父戌土', '父寅木', '父午火', '父午火', '父寅木', '父申金'] }; // i0→[5]申金, i1→[4]寅木, i2→[3]午火
    const r = computePanMarkers({ yao, bian, monthGZ: '乙未', markers: { 'marker-wangshuai': true } });
    expect(r.bianWangshuai).toEqual([
      { i: 0, ws: '相' },
      { i: 1, ws: '囚' },
      { i: 2, ws: '休' },
    ]);
  });

  test('v0.10 改进建7 #7：变卦全部 6 爻月破/月合（不再仅动爻）', () => {
    const yao = yaoOf([
      { dong: true },  // 变丑土：丑未冲 → 变爻月破
      { dong: true },  // 变午火：午未合 → 变爻月合
      { dong: false }, // 静爻也计（变午火：午未合 → 变爻月合）
    ]);
    const bian = { liuqin: ['父戌土', '父午火', '父午火', '父午火', '父午火', '父丑土'] }; // i0→[5]丑土, i1→[4]午火, i2→[3]午火
    const r = computePanMarkers({
      yao, bian, monthGZ: '乙未',
      markers: { 'marker-yuepo': true, 'marker-yuehe': true },
    });
    expect(r.bianYuePo).toEqual([0]);
    expect(r.bianYueHe).toEqual([1, 2]);
  });

  test('集成：天风姤 初爻动（父丑土→孙子水）变卦 6 爻旺衰/月破全显示', () => {
    // 2026-08-04 月建未土：本卦初爻丑土（未丑冲=月破）；变卦=乾为天（子寅辰午申戌）
    const p = paipan({
      method: 'qian', params: { lines: '211111', dong: [0] }, date: new Date(2026, 7, 4),
      markers: { 'marker-wangshuai': true, 'marker-yuepo': true, 'marker-yuehe': true },
    });
    expect(p.markers.yuePo).toEqual([0]); // 本卦初爻丑土月破
    // 变卦全部 6 爻都有旺衰（不再仅动爻）；初爻子水：土克水=死
    expect(p.markers.bianWangshuai).toHaveLength(6);
    expect(p.markers.bianWangshuai).toContainEqual({ i: 0, ws: '死' });
    // 变卦 6 爻位破合全量：乾为天（子寅辰午申戌）无丑 → 无月破（键省略）；午未合 → 月合=[3]
    expect(p.markers.bianYuePo ?? []).toEqual([]);
    expect(p.markers.bianYueHe).toEqual([3]);
  });

  test('集成：真实化进神/化退神经完整链路计算并渲染角标（#13 排查回归）', () => {
    // 进神：震为雷 二爻动（寅→卯，变雷泽归妹）；退神：兑为泽 二爻动（卯→寅，变泽雷随）
    const p1 = paipan({
      method: 'qian', params: { lines: '122122', dong: [1] }, date: new Date(2026, 7, 4),
      markers: { 'marker-jintui-fanfuyin': true },
    });
    expect(p1.bian.name).toBe('雷泽归妹');
    expect(p1.markers.jinTui).toEqual([{ i: 1, label: '进' }]);
    expect(markerBadgesFor(p1.markers, 1)).toEqual([{ g: '进', t: '化进神' }]);

    const p2 = paipan({
      method: 'qian', params: { lines: '112112', dong: [1] }, date: new Date(2026, 7, 4),
      markers: { 'marker-jintui-fanfuyin': true },
    });
    expect(p2.bian.name).toBe('泽雷随');
    expect(p2.markers.jinTui).toEqual([{ i: 1, label: '退' }]);
    expect(markerBadgesFor(p2.markers, 1)).toEqual([{ g: '退', t: '化退神' }]);
  });

  test('v0.10 改进建7 #8：天泽履上爻戌土动→兑为泽上爻未土=化退（用户实例）', () => {
    const p = paipan({
      method: 'qian', params: { lines: '112111', dong: [5] }, date: new Date(2026, 7, 4),
      markers: { 'marker-jintui-fanfuyin': true },
    });
    expect(p.ben.name).toBe('天泽履');
    expect(p.bian.name).toBe('兑为泽');
    expect(p.markers.jinTui).toEqual([{ i: 5, label: '退' }]);
    expect(markerBadgesFor(p.markers, 5)).toEqual([{ g: '退', t: '化退神' }]);
  });
});
