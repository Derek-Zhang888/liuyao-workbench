/**
 * 盘面标记（六爻工作台 - v0.2 盘面标记 B，v0.10 扩展）
 *
 * 纯函数模块，无 DOM / 无外部状态。由 paipan 在传入 markers 选项（11 个设置开关，
 * 任一为 true）时烘焙进快照 pan.markers，供 PanView 渲染角标与 exportMd 渲染「标记」列
 * 共用同一计算源（无双实现漂移）。旧快照无 pan.markers → UI/导出均跳过，向后兼容。
 *
 * 接口：
 *   MARKER_KEYS              11 个设置键（settings 表 marker-*）
 *   MARKER_GLYPHS            角标字形常量（月破/日破/月合/日合/↲生/进/伏…）
 *   MARKER_WANGSHUAI_COLOR   旺相休囚死小字配色（五行）
 *   computePanMarkers({yao,bian,monthGZ,dayGZ,gongWx,markers}) -> pan.markers
 *   markerBadgesFor(markers, i)          本卦爻紧凑角标（PanView 本卦列 / exportMd 共用）
 *   markerBadgesForBian(markers, i)      变爻角标（回头生克冲合 + 变爻月破日破月合日合）
 *   markerBadgesForFushen(markers, i)    伏神角标（伏神月破日破月合日合）
 *   wangshuaiAt(markers, i, kind)        取某爻旺衰（ben/fushen/bian）
 *
 * pan.markers 结构（仅包含开启的键，全关时省略）：
 *   { wangshuai:[{i,ws}], yuePo:[i], riPo:[i], yueHe:[i], riHe:[i],
 *     fushenWangshuai:[{i,ws}], fushenYuePo:[i], fushenRiPo:[i], fushenYueHe:[i], fushenRiHe:[i],
 *     bianWangshuai:[{i,ws}], bianYuePo:[i], bianRiPo:[i], bianYueHe:[i], bianRiHe:[i],
 *     huitouSheng:[i], huitouKe:[i], huitouChong:[i], huitouHe:[i],
 *     jinTui:[{i,label:'进'|'退'}], fanYin:[{i,label:'伏'|'反'}],
 *     riyueLiqin:{ yue:{zhi,wuxing,liuqin}, ri:{zhi,wuxing,liuqin} } | null }
 *
 * 判定口径：
 *   - 旺相休囚死：本卦爻直读 yao.wangshuai；伏神/变爻按各自五行 vs 月建现算
 *     （v0.10 改进建7 #7：变卦全部 6 爻都显示，不再仅动爻）
 *   - 月破/月合：复用 dizhiAnalysis yueJianLabels 语义（CHONG[zhi]===月支 / HE[zhi]===月支）
 *   - 日破/日合：复用 riChenLabels 语义（日破=静爻休囚被日冲；日合=HE[zhi]===日支）
 *   - 回头生/克：直读 benBianLabel 语义（变爻五行生/克本爻五行，仅动爻）
 *   - 回头冲/回头合：新增判定 CHONG[bianZhi]===benZhi / HE[bianZhi]===benZhi（仅动爻）
 *   - 化进退：JINSHEN[benZhi]===bianZhi 进 / TUISHEN[benZhi]===bianZhi 退（仅动爻）
 *   - 反伏吟：bianZhi===benZhi 伏吟 / CHONG[bianZhi]===benZhi 反吟（仅动爻）
 *   - 日月建六亲：liuqinByWuxing(gongWx, WUXING_ZHI[月支/日支])（卦宫五行为"我"）
 */
import { CHONG, HE, JINSHEN, TUISHEN, riChenLabels } from './dizhiAnalysis.js';
import { WUXING_ZHI } from './ganzhi.js';
import { liuqinByWuxing, wangshuai } from './paipan.js';

/** 11 个盘面标记设置键（SettingsPage「盘面选项」卡片逐项对应） */
export const MARKER_KEYS = [
  'marker-wangshuai',
  'marker-yuepo',
  'marker-ripo',
  'marker-yuehe',
  'marker-rihe',
  'marker-huitou-sheng',
  'marker-huitou-ke',
  'marker-huitou-chong',
  'marker-huitou-he',
  'marker-jintui-fanfuyin',
  'marker-riyue-liuqin',
];

/** 角标字形常量（UI 与 md 导出共用同一套字形，避免漂移；v0.10 写全月破/日破/月合/日合，回头箭头指向左） */
export const MARKER_GLYPHS = {
  yuePo: '月破',
  riPo: '日破',
  yueHe: '月合',
  riHe: '日合',
  huitouSheng: '↲生',
  huitouKe: '↲克',
  huitouChong: '↲冲',
  huitouHe: '↲合',
  jin: '进',
  tui: '退',
  fan: '反',
  fu: '伏',
};

/** 旺相休囚死小字配色（设计：旺=火红、相=橙、休=灰、囚=水灰、死=红——v0.10 修复死字与背景同色看不清） */
export const MARKER_WANGSHUAI_COLOR = {
  旺: 'var(--wuxing-huo)',
  相: '#f97316',
  休: '#9ca3af',
  囚: 'var(--wuxing-shui)',
  死: '#ef4444',
};

/** 五行相生：木→火→土→金→水→木 */
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 五行相克：木→土→水→火→金→木 */
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 解析 '父戌土' -> {liuqin, zhi, wuxing}（与 paipan/dizhiAnalysis 同规则；非法返回 null） */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s ?? '');
  return m ? { liuqin: m[1], zhi: m[2], wuxing: m[3] } : null;
}

/**
 * 计算盘面标记快照（pan.markers）
 * @param {object} p
 * @param {Array} p.yao 六爻（初→上），每项 {liuqin,zhi,wuxing,dong,wangshuai}
 * @param {object|null} p.bian 变卦摘要（含 liuqin 上→初 六亲字符串数组；无动爻为 null）
 * @param {string} p.monthGZ 月干支（如'乙未'）
 * @param {string} p.dayGZ 日干支（如'庚戌'）
 * @param {string} p.gongWx 卦宫五行（如'金'）
 * @param {object} p.markers 11 键布尔对象（{ 'marker-wangshuai': true, ... }）
 * @returns {object} pan.markers（仅含开启的键）
 */
export function computePanMarkers({
  yao = [],
  bian = null,
  monthGZ = '',
  dayGZ = '',
  gongWx = '',
  markers = {},
} = {}) {
  const out = {};
  const on = (k) => !!(markers && typeof markers === 'object' && markers[k]);
  const yueZhi = monthGZ ? monthGZ[1] : '';
  const riZhi = dayGZ ? dayGZ[1] : '';
  const bianLiuqin = bian && Array.isArray(bian.liuqin) ? bian.liuqin : null;
  /** 变爻信息（bian.liuqin 为上→初，5-i 取同爻位） */
  const bianOf = (i) => {
    if (!bianLiuqin) return null;
    return parseLiqin(bianLiuqin[5 - i]);
  };

  // 1. 旺相休囚死：直读 yao.wangshuai
  if (on('marker-wangshuai')) {
    out.wangshuai = yao.map((y, i) => ({ i, ws: y.wangshuai })).filter((e) => !!e.ws);
  }

  // 2-5. 月破/日破/月合/日合：复用 dizhiAnalysis 语义（本卦爻）
  if (on('marker-yuepo')) {
    out.yuePo = yao.map((y, i) => (CHONG[y.zhi] === yueZhi ? i : -1)).filter((i) => i >= 0);
  }
  if (on('marker-ripo')) {
    // 日破按引擎口径：riChenLabels 中「日破」= 静爻休囚被日冲（旺相=暗动、动爻=动而愈动/动而冲散）
    out.riPo = yao
      .map((y, i) => (riChenLabels(y.zhi, y.wuxing, y.dong, y.wangshuai, riZhi).includes('日破') ? i : -1))
      .filter((i) => i >= 0);
  }
  if (on('marker-yuehe')) {
    out.yueHe = yao.map((y, i) => (HE[y.zhi] === yueZhi ? i : -1)).filter((i) => i >= 0);
  }
  if (on('marker-rihe')) {
    out.riHe = yao.map((y, i) => (HE[y.zhi] === riZhi ? i : -1)).filter((i) => i >= 0);
  }

  // 2b. 伏神 月破/日破/月合/日合（v0.10：伏神也显示；日破按伏神五行现算旺衰判定）
  const fushenNeed = on('marker-yuepo') || on('marker-ripo') || on('marker-yuehe') || on('marker-rihe');
  if (fushenNeed) {
    for (let i = 0; i < yao.length; i++) {
      const f = yao[i].fushen;
      if (!f) continue;
      const fws = wangshuai(yueZhi, f.wuxing); // 伏神旺衰（按五行现算）
      if (on('marker-yuepo') && CHONG[f.zhi] === yueZhi) (out.fushenYuePo ??= []).push(i);
      if (on('marker-ripo') && riChenLabels(f.zhi, f.wuxing, false, fws, riZhi).includes('日破')) (out.fushenRiPo ??= []).push(i);
      if (on('marker-yuehe') && HE[f.zhi] === yueZhi) (out.fushenYueHe ??= []).push(i);
      if (on('marker-rihe') && HE[f.zhi] === riZhi) (out.fushenRiHe ??= []).push(i);
    }
  }

  // 10d. 伏神 旺相休囚死（v0.10：按伏神五行 vs 月建现算）
  if (on('marker-wangshuai')) {
    for (let i = 0; i < yao.length; i++) {
      const f = yao[i].fushen;
      if (!f) continue;
      const ws = wangshuai(yueZhi, f.wuxing);
      if (ws) (out.fushenWangshuai ??= []).push({ i, ws });
    }
  }

  // 6-10. 动爻回头生/克/冲/合 + 化进退/反伏吟（仅动爻）
  const needDong =
    on('marker-huitou-sheng') || on('marker-huitou-ke') ||
    on('marker-huitou-chong') || on('marker-huitou-he') ||
    on('marker-jintui-fanfuyin');
  if (needDong) {
    for (let i = 0; i < yao.length; i++) {
      const y = yao[i];
      if (!y.dong) continue;
      const b = bianOf(i);
      if (!b) continue;
      if (on('marker-huitou-sheng') && SHENG[b.wuxing] === y.wuxing) (out.huitouSheng ??= []).push(i);
      if (on('marker-huitou-ke') && KE[b.wuxing] === y.wuxing) (out.huitouKe ??= []).push(i);
      if (on('marker-huitou-chong') && CHONG[b.zhi] === y.zhi) (out.huitouChong ??= []).push(i);
      if (on('marker-huitou-he') && HE[b.zhi] === y.zhi) (out.huitouHe ??= []).push(i);
      if (on('marker-jintui-fanfuyin')) {
        if (JINSHEN[y.zhi] === b.zhi) (out.jinTui ??= []).push({ i, label: '进' });
        else if (TUISHEN[y.zhi] === b.zhi) (out.jinTui ??= []).push({ i, label: '退' });
        if (b.zhi === y.zhi) (out.fanYin ??= []).push({ i, label: '伏' }); // 伏吟
        else if (CHONG[b.zhi] === y.zhi) (out.fanYin ??= []).push({ i, label: '反' }); // 反吟
      }
    }
  }

  // 10b. 变爻 旺相休囚死（v0.10 改进建7 #7：变卦【全部 6 爻】都显示，不再仅动爻；
  // 按变爻五行 vs 月建现算）
  if (on('marker-wangshuai') && bianLiuqin) {
    for (let i = 0; i < yao.length; i++) {
      const b = bianOf(i);
      if (!b) continue;
      const ws = wangshuai(yueZhi, b.wuxing);
      if (ws) (out.bianWangshuai ??= []).push({ i, ws });
    }
  }

  // 10c. 变爻 月破/日破/月合/日合（v0.10 改进建7 #7：变卦【全部 6 爻】都显示；
  // 日破按变爻五行现算旺衰判定）
  const bianNeed = on('marker-yuepo') || on('marker-ripo') || on('marker-yuehe') || on('marker-rihe');
  if (bianNeed && bianLiuqin) {
    for (let i = 0; i < yao.length; i++) {
      const b = bianOf(i);
      if (!b) continue;
      const bws = wangshuai(yueZhi, b.wuxing);
      if (on('marker-yuepo') && CHONG[b.zhi] === yueZhi) (out.bianYuePo ??= []).push(i);
      if (on('marker-ripo') && riChenLabels(b.zhi, b.wuxing, false, bws, riZhi).includes('日破')) (out.bianRiPo ??= []).push(i);
      if (on('marker-yuehe') && HE[b.zhi] === yueZhi) (out.bianYueHe ??= []).push(i);
      if (on('marker-rihe') && HE[b.zhi] === riZhi) (out.bianRiHe ??= []).push(i);
    }
  }

  // 11. 日月建六亲：以卦宫五行为"我"，月/日支五行定六亲
  if (on('marker-riyue-liuqin') && gongWx && yueZhi && riZhi) {
    out.riyueLiqin = {
      yue: { zhi: yueZhi, wuxing: WUXING_ZHI[yueZhi], liuqin: liuqinByWuxing(gongWx, WUXING_ZHI[yueZhi]) },
      ri: { zhi: riZhi, wuxing: WUXING_ZHI[riZhi], liuqin: liuqinByWuxing(gongWx, WUXING_ZHI[riZhi]) },
    };
  }

  return out;
}

/**
 * 单爻紧凑角标列表（本卦爻：PanView 本卦列与 exportMd「标记」列共用）
 * 含 月破/日破/月合/日合 + 化进退/反伏吟（v0.10：回头生克冲合移至变爻处 markerBadgesForBian）
 * @param {object|null} markers pan.markers（无 markers 返回 []）
 * @param {number} i 爻索引（初爻=0）
 * @returns {Array<{g:string, t:string}>} g=角标字形，t=悬浮/标题说明
 */
export function markerBadgesFor(markers, i) {
  if (!markers) return [];
  const out = [];
  const push = (g, t) => out.push({ g, t });
  if (Array.isArray(markers.yuePo) && markers.yuePo.includes(i)) push(MARKER_GLYPHS.yuePo, '月破');
  if (Array.isArray(markers.riPo) && markers.riPo.includes(i)) push(MARKER_GLYPHS.riPo, '日破（静爻休囚被日冲）');
  if (Array.isArray(markers.yueHe) && markers.yueHe.includes(i)) push(MARKER_GLYPHS.yueHe, '月合');
  if (Array.isArray(markers.riHe) && markers.riHe.includes(i)) push(MARKER_GLYPHS.riHe, '日合');
  const jt = Array.isArray(markers.jinTui) ? markers.jinTui.find((e) => e.i === i) : null;
  if (jt) push(jt.label === '进' ? MARKER_GLYPHS.jin : MARKER_GLYPHS.tui, jt.label === '进' ? '化进神' : '化退神');
  const fy = Array.isArray(markers.fanYin) ? markers.fanYin.find((e) => e.i === i) : null;
  if (fy) push(fy.label === '伏' ? MARKER_GLYPHS.fu : MARKER_GLYPHS.fan, fy.label === '伏' ? '伏吟' : '反吟');
  return out;
}

/**
 * 变爻角标列表（PanView 变卦列与 exportMd「标记」列共用）：
 * 回头生/克/冲/合（v0.10 标志放变爻处、箭头指向左）+ 变爻月破/日破/月合/日合
 * @param {object|null} markers pan.markers
 * @param {number} i 爻索引（初爻=0）
 * @returns {Array<{g:string, t:string}>}
 */
export function markerBadgesForBian(markers, i) {
  if (!markers) return [];
  const out = [];
  const push = (g, t) => out.push({ g, t });
  if (Array.isArray(markers.huitouSheng) && markers.huitouSheng.includes(i)) push(MARKER_GLYPHS.huitouSheng, '回头生');
  if (Array.isArray(markers.huitouKe) && markers.huitouKe.includes(i)) push(MARKER_GLYPHS.huitouKe, '回头克');
  if (Array.isArray(markers.huitouChong) && markers.huitouChong.includes(i)) push(MARKER_GLYPHS.huitouChong, '回头冲');
  if (Array.isArray(markers.huitouHe) && markers.huitouHe.includes(i)) push(MARKER_GLYPHS.huitouHe, '回头合');
  if (Array.isArray(markers.bianYuePo) && markers.bianYuePo.includes(i)) push(MARKER_GLYPHS.yuePo, '变爻月破');
  if (Array.isArray(markers.bianRiPo) && markers.bianRiPo.includes(i)) push(MARKER_GLYPHS.riPo, '变爻日破');
  if (Array.isArray(markers.bianYueHe) && markers.bianYueHe.includes(i)) push(MARKER_GLYPHS.yueHe, '变爻月合');
  if (Array.isArray(markers.bianRiHe) && markers.bianRiHe.includes(i)) push(MARKER_GLYPHS.riHe, '变爻日合');
  return out;
}

/**
 * 伏神角标列表（PanView 伏神行与 exportMd 伏神行「标记」列共用）：
 * 伏神月破/日破/月合/日合（v0.10）
 * @param {object|null} markers pan.markers
 * @param {number} i 爻索引（初爻=0）
 * @returns {Array<{g:string, t:string}>}
 */
export function markerBadgesForFushen(markers, i) {
  if (!markers) return [];
  const out = [];
  const push = (g, t) => out.push({ g, t });
  if (Array.isArray(markers.fushenYuePo) && markers.fushenYuePo.includes(i)) push(MARKER_GLYPHS.yuePo, '伏神月破');
  if (Array.isArray(markers.fushenRiPo) && markers.fushenRiPo.includes(i)) push(MARKER_GLYPHS.riPo, '伏神日破');
  if (Array.isArray(markers.fushenYueHe) && markers.fushenYueHe.includes(i)) push(MARKER_GLYPHS.yueHe, '伏神月合');
  if (Array.isArray(markers.fushenRiHe) && markers.fushenRiHe.includes(i)) push(MARKER_GLYPHS.riHe, '伏神日合');
  return out;
}

/**
 * 取某爻旺衰（ben/fushen/bian）；无返回 null
 * @param {object|null} markers pan.markers
 * @param {number} i 爻索引（初爻=0）
 * @param {'ben'|'fushen'|'bian'} [kind] 默认 'ben'
 * @returns {{i:number, ws:string}|null}
 */
export function wangshuaiAt(markers, i, kind = 'ben') {
  if (!markers) return null;
  const key = kind === 'bian' ? 'bianWangshuai' : kind === 'fushen' ? 'fushenWangshuai' : 'wangshuai';
  const arr = markers[key];
  if (!Array.isArray(arr)) return null;
  return arr.find((e) => e.i === i) ?? null;
}
