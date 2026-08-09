/**
 * 盘面生成器（六爻工作台 - 排盘引擎之四）
 *
 * 纯函数模块，无 DOM 依赖。接口：
 *   paipan({method, params, date}) -> 完整盘面对象
 *   WUXING_COLOR 五行 -> CSS 颜色变量
 *
 * 盘面对象：
 *   {
 *     ben:  {name, gong, liuqin, shi, ying, youhun, guihun},        // 本卦（liuqin 原始 6 项，上→初）
 *     bian: {name, gong, liuqin, shi, ying, youhun, guihun} | null, // 变卦（无动爻为 null）
 *     yao: [6] { liuqin:'父', zhi:'戌', wuxing:'土', line:1, dong:false,
 *                shi:false, ying:false, fushen:{liuqin,zhi,wuxing}|null, wangshuai:'旺|相|休|囚|死' },
 *     liushen: ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'],          // 初→上，按日干起
 *     yearGZ, monthGZ, dayGZ, hourGZ, xunkong:[地支,地支], yuejian,
 *     guashen, shashen, shenshaList,
 *     dizhiAnalysis|null,   // 地支分析（功能一，yongShen/dizhi 开启时计算）
 *     yongShen|null,        // 自定用神快照（功能二）
 *     nagan,                // 纳干开关快照（功能三，true 时爻含 gan）
 *   }
 *
 * 算法要点：
 * 1. 六神：日干定初爻起神（甲乙青龙 / 丙丁朱雀 / 戊勾陈 / 己螣蛇 / 庚辛白虎 / 壬癸玄武）
 * 2. 变卦：动爻爻画 1↔2 翻转后查表（无动爻 bian=null）
 * 3. 旺衰（测试版简化）：月建五行 vs 爻五行——同我=旺 生我=相 我生=休 克我=囚 我克=死
 * 4. 伏神：guaTable.fushen 为按爻位展开的 6 项数组（0=初爻，空串=无），非空则解析
 * 5. 世应：guaTable.shi/ying（0-5 索引）标记到 yao 数组
 * 6. 六亲：guaTable.liuqin 为"六亲+地支+五行"字符串（如'父戌土'），按序解析（上→初，注意索引反转）
 * 7. 卦身：测试版简化——取本宫首卦卦身支（八宫表：乾戌 坎子 艮寅 震卯 巽巳 离午 坤未 兑酉），
 *    与简报"乾卦身起戌"一致；精修方向：按"阳世从子/阴世从午，从初数至世"推演宫中各卦身
 * 8. 煞神（shashen）：测试版暂不实现，恒为 null；卦级神煞见 shenshaList（15 项整体列表）
 */
import { findGua } from './guaTable.js';
import { toLunar, WUXING_ZHI, ZHI as ZHI_CYCLE } from './ganzhi.js';
import { trueSolarLunar } from './solarTime.js';
import { computeDizhiAnalysis } from './dizhiAnalysis.js';
import { computePanMarkers } from './panMarkers.js';
import {
  qiguaFromQian,
  qiguaFromCoin,
  qiguaFromGuaName,
  qiguaFromNumber,
  qiguaFromBaoshu,
  qiguaFromTime,
  qiguaFromRandom,
} from './qigua.js';

/** 五行 -> CSS 颜色变量（对应 styles/theme.css 的 --wuxing-*） */
export const WUXING_COLOR = {
  木: 'var(--wuxing-mu)',
  火: 'var(--wuxing-huo)',
  土: 'var(--wuxing-tu)',
  金: 'var(--wuxing-jin)',
  水: 'var(--wuxing-shui)',
};

/** 六神序（初→上） */
const LIUSHEN_ORDER = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];

/** 日干 -> 初爻六神 */
const DAY_GAN_LIUSHEN = {
  甲: '青龙', 乙: '青龙',
  丙: '朱雀', 丁: '朱雀',
  戊: '勾陈',
  己: '螣蛇',
  庚: '白虎', 辛: '白虎',
  壬: '玄武', 癸: '玄武',
};

/** 五行相生：木→火→土→金→水→木 */
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 五行相克：木→土→水→火→金→木 */
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
/** 反查：谁生我（五行 → 生我者） */
const SHENG_BY = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' };
/** 反查：谁克我（五行 → 克我者） */
const KE_BY = { 土: '木', 水: '土', 火: '水', 金: '火', 木: '金' };

/** 数字 → 中文数字（1-99） */
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function cnNum(n) {
  if (n < 10) return CN_DIGITS[n];
  if (n === 10) return '十';
  if (n < 20) return `十${CN_DIGITS[n - 10]}`;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return `${CN_DIGITS[t]}十${u ? CN_DIGITS[u] : ''}`;
}
/** 农历月 → 中文月名（正月 / 二月 … 十二月） */
function cnMonth(m) {
  return m === 1 ? '正月' : `${cnNum(m)}月`;
}
/** 农历日 → 中文日名（初一…三十，二十余日用「廿」：廿一、廿二…廿九） */
function cnDay(d) {
  if (d === 1) return '初一';
  if (d < 10) return `初${CN_DIGITS[d]}`;
  if (d === 10) return '初十';
  if (d < 20) return `十${CN_DIGITS[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${CN_DIGITS[d - 20]}`;
  return '三十';
}

/**
 * 旺衰（v0.10 改标准口径）：月建五行 m vs 爻五行 x
 *   同我(x=m)=旺  生我(m生x)=相  我生(x生m)=休  我克(x克m)=囚  克我(m克x)=死
 * （旧口径「月建克爻=囚、爻克月建=死」与主流对调，v0.10 改为标准：爻克月建=囚、月建克爻=死）
 * @param {string} yuejianZhi 月建地支（如'未'）
 * @param {string} wuxing 爻五行
 * @returns {'旺'|'相'|'休'|'囚'|'死'}
 */
export function wangshuai(yuejianZhi, wuxing) {
  const m = WUXING_ZHI[yuejianZhi];
  if (wuxing === m) return '旺';
  if (SHENG[m] === wuxing) return '相'; // 月建生爻
  if (SHENG[wuxing] === m) return '休'; // 爻生月建
  if (KE[wuxing] === m) return '囚'; // 爻克月建
  return '死'; // 月建克爻
}

/** 卦身（测试版简化）：本宫首卦卦身支（八宫表） */
const GONG_GUASHEN = { 乾: '戌', 兑: '酉', 离: '午', 震: '卯', 巽: '巳', 坎: '子', 艮: '寅', 坤: '未' };

/**
 * 卦身精确推演（v0.2，六爻排盘宝口径）：
 *   阳世（世爻爻画 1）从子（ZHI 下标 0）起、阴世（爻画 2）从午（下标 6）起，
 *   从初爻数至世爻：ZHI_CYCLE[(startIdx + shi) % 12]，shi=世爻爻位（初爻=0 … 上爻=5）。
 * 旧简化表 GONG_GUASHEN（乾→戌）仅保留给旧快照展示，新排盘由本函数产出。
 * @param {{shi:number, shiLine:number}} p shi=世爻爻位 0-5；shiLine=世爻爻画 1|2
 * @returns {string} 卦身地支（如乾为天阳世上爻 → '巳'）
 */
export function computeGuashen({ shi, shiLine } = {}) {
  const startIdx = shiLine === 2 ? 6 : 0; // 阴世从午(6)，其余（含非法入参）从子(0)
  const s = Number.isInteger(shi) && shi >= 0 && shi <= 5 ? shi : 0;
  return ZHI_CYCLE[(startIdx + s) % 12];
}

/** 五行 → 全部地支（十二支顺序，v0.10 改进建7 #4 香闺/床帐全匹配口径） */
const WUXING_ALL_ZHI = {};
for (const z of ZHI_CYCLE) {
  const wx = WUXING_ZHI[z];
  if (wx) (WUXING_ALL_ZHI[wx] ??= []).push(z);
}

/**
 * 香闺/床帐（v0.2 功能 C，v0.10 改进建7 #4 改纯五行→地支全匹配）：
 *   香闺=卦身五行所克之五行对应【全部】地支、床帐=卦身五行所生之五行对应【全部】地支
 *   （木=寅卯、火=巳午、土=丑辰未戌、金=申酉、水=亥子），按十二支顺序排列，
 *   只显示地支（不带五行字），天然无重复。
 * @param {string} guashenZhi 卦身地支（如'巳'）
 * @param {Array} [yao] 六爻（初→上）；保留签名兼容，v0.10 起不再扫描爻
 * @returns {{xianggui:Array<{zhi:string}>, chuangzhang:Array<{zhi:string}>}}
 */
export function guashenBedroom(guashenZhi, yao) {
  const gwx = WUXING_ZHI[guashenZhi];
  if (!gwx) return { xianggui: [], chuangzhang: [] };
  const zhiOf = (wx) => (wx && WUXING_ALL_ZHI[wx] ? WUXING_ALL_ZHI[wx].map((z) => ({ zhi: z })) : []);
  return { xianggui: zhiOf(KE[gwx]), chuangzhang: zhiOf(SHENG[gwx]) };
}

/** 解析 '父戌土' -> {liuqin:'父', zhi:'戌', wuxing:'土'} */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s);
  if (!m) {
    throw new RangeError(`六亲字符串格式异常：${JSON.stringify(s)}`);
  }
  return { liuqin: m[1], zhi: m[2], wuxing: m[3] };
}

/** 八宫 → 五行（本宫法：变卦六亲以本宫五行为"我"） */
export const GONG_WUXING = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

/** 纳甲八宫（功能三）：宫名 → {内卦干, 外卦干}（初二三爻用内干，四五六爻用外干） */
export const NAGAN_GAN = {
  乾: { nei: '甲', wai: '壬' },
  坤: { nei: '乙', wai: '癸' },
  震: { nei: '庚', wai: '庚' },
  巽: { nei: '辛', wai: '辛' },
  坎: { nei: '戊', wai: '戊' },
  离: { nei: '己', wai: '己' },
  艮: { nei: '丙', wai: '丙' },
  兑: { nei: '丁', wai: '丁' },
};

/** 三爻画（初→上，1=阳 2=阴）→ 经卦名；用于按上下经卦分别纳甲（v0.10 修复混合卦纳干） */
export const TRIGRAM_LINES = {
  '111': '乾', '112': '兑', '121': '离', '122': '震',
  '211': '巽', '212': '坎', '221': '艮', '222': '坤',
};

/**
 * 按爻位取纳干（0=初爻）。v0.10 修复：混合卦（上卦与下卦经卦不同）按上下经卦各自纳甲——
 *   初二三爻=下卦经卦内干，四五六爻=上卦经卦外干；传入 6 位爻画 lines（初→上）时用经卦推导。
 *   未传 lines（旧调用）时回退旧按宫法（本卦宫内外干），保持向后兼容。
 * @param {string} gong 八宫名（如'乾'）
 * @param {number} i 爻索引（0-5，初爻=0）
 * @param {string} [lines] 6 位 1/2 爻画（初→上）；可选
 * @returns {string|null}
 */
export function naganGan(gong, i, lines) {
  if (!Number.isInteger(i) || i < 0 || i > 5) return null;
  if (typeof lines === 'string' && /^[12]{6}$/.test(lines)) {
    const tri = i < 3 ? lines.slice(0, 3) : lines.slice(3, 6);
    const name = TRIGRAM_LINES[tri];
    const g = name ? NAGAN_GAN[name] : null;
    if (g) return i < 3 ? g.nei : g.wai;
    return null;
  }
  const g = NAGAN_GAN[gong];
  if (!g) return null;
  return i < 3 ? g.nei : g.wai;
}

/**
 * 六亲 → 对应五行关系（六爻惯例：父=生我、兄=同我、孙=我生、财=我克、官=克我，"我"=卦宫五行）
 * @param {string} gongWx 卦宫五行（如'金'）
 * @param {string} liuqin 六亲（父/兄/官/财/孙）
 * @returns {string|null} 对应五行，非法入参返回 null
 */
export function liuqinWuxing(gongWx, liuqin) {
  switch (liuqin) {
    case '父': return SHENG_BY[gongWx]; // 生我者
    case '兄': return gongWx; // 同我
    case '孙': return SHENG[gongWx]; // 我生
    case '财': return KE[gongWx]; // 我克
    case '官': return KE_BY[gongWx]; // 克我者
    default: return null;
  }
}

/**
 * 用神命中判定（功能二）：六亲按 liuqin 匹配，地支按 zhi 匹配；未选用神返回 false
 * @param {object} y 爻对象（至少含 liuqin/zhi）
 * @param {object|null} yongShen {type:'liuqin'|'zhi', value}
 * @returns {boolean}
 */
export function yongShenHit(y, yongShen) {
  if (!yongShen || !y) return false;
  return yongShen.type === 'liuqin' ? y.liuqin === yongShen.value : y.zhi === yongShen.value;
}

/**
 * 用神命中判定——伏神（功能二）：伏神六亲按 liuqin 匹配，伏神地支按 zhi 匹配。
 * 未选用神 / 无伏神 / 空爻返回 false。与本卦爻命中（yongShenHit）相互独立：
 * 本卦爻与伏神可能命中不同的用神（如本卦六亲为兄、伏神为财），需分别判定。
 * @param {object} y 爻对象（至少含 fushen 字段，fushen={liuqin,zhi,wuxing}|null）
 * @param {object|null} yongShen {type:'liuqin'|'zhi', value}
 * @returns {boolean}
 */
export function yongShenHitFushen(y, yongShen) {
  if (!yongShen || !y || !y.fushen) return false;
  return yongShen.type === 'liuqin' ? y.fushen.liuqin === yongShen.value : y.fushen.zhi === yongShen.value;
}

/**
 * 以"我"(wo) 之五行生克地支五行(zhiWx) 定六亲：
 *   同我=兄，生我=父，我生=孙，克我=官，我克=财
 */
export function liuqinByWuxing(wo, zhiWx) {
  if (zhiWx === wo) return '兄';
  const SHENG_WO = { 土: '火', 金: '土', 水: '金', 木: '水', 火: '木' }; // 生 wo 者
  const WO_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // wo 所生
  const KE_WO = { 木: '金', 火: '水', 土: '木', 金: '火', 水: '土' }; // 克 wo 者
  if (zhiWx === SHENG_WO[wo]) return '父';
  if (zhiWx === WO_SHENG[wo]) return '孙';
  if (zhiWx === KE_WO[wo]) return '官';
  return '财'; // wo 所克
}

/** 神煞（卦级）：天乙贵人按日干，驿马/桃花/华盖按年支三合；返回按地支取标签的函数 */
function computeShensha(dayGZ, yearGZ) {
  const GUIREN = { 甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'], 辛: ['寅', '午'] };
  const YIMA = { 寅: '申', 午: '申', 戌: '申', 申: '寅', 子: '寅', 辰: '寅', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' };
  const TAOHUA = { 寅: '卯', 午: '卯', 戌: '卯', 申: '酉', 子: '酉', 辰: '酉', 巳: '午', 酉: '午', 丑: '午', 亥: '子', 卯: '子', 未: '子' };
  const HUAGAI = { 寅: '戌', 午: '戌', 戌: '戌', 申: '辰', 子: '辰', 辰: '辰', 巳: '丑', 酉: '丑', 丑: '丑', 亥: '未', 卯: '未', 未: '未' };
  const guiren = new Set(GUIREN[dayGZ[0]] || []);
  const yima = YIMA[yearGZ[1]];
  const taohua = TAOHUA[yearGZ[1]];
  const huagai = HUAGAI[yearGZ[1]];
  return (zhi) => {
    const t = [];
    if (guiren.has(zhi)) t.push('贵');
    if (zhi === yima) t.push('马');
    if (zhi === taohua) t.push('桃');
    if (zhi === huagai) t.push('盖');
    return t;
  };
}

/** 天乙贵人（甲戊庚牛羊）：日干 → 贵人地支（阳贵/阴贵两位） */
const GUIREN_BY_GAN = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['卯', '巳'],
  辛: ['寅', '午'],
};

/** 禄神：日干 → 地支 */
const LUSHEN_BY_GAN = {
  甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳',
  丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子',
};

/** 羊刃（禄神同五行相邻进一位）：日干 → 地支 */
const YANGREN_BY_GAN = {
  甲: '卯', 乙: '寅', 丙: '午', 戊: '午',
  丁: '巳', 己: '巳', 庚: '酉', 辛: '申', 壬: '子', 癸: '亥',
};

/** 文昌：日干 → 地支 */
const WENCHANG_BY_GAN = {
  甲: '巳', 乙: '午', 丙: '申', 戊: '申',
  丁: '酉', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
};

/** 日支 → 三合局名 */
const SANHE_GROUP = {
  申: '申子辰', 子: '申子辰', 辰: '申子辰',
  寅: '寅午戌', 午: '寅午戌', 戌: '寅午戌',
  巳: '巳酉丑', 酉: '巳酉丑', 丑: '巳酉丑',
  亥: '亥卯未', 卯: '亥卯未', 未: '亥卯未',
};

/** 三合局 → 驿马/桃花/华盖/将星/劫煞/灾煞/谋星 */
const SANHE_SHENSHA = {
  申子辰: { 驿马: '寅', 桃花: '酉', 华盖: '辰', 将星: '子', 劫煞: '巳', 灾煞: '午', 谋星: '戌' },
  寅午戌: { 驿马: '申', 桃花: '卯', 华盖: '戌', 将星: '午', 劫煞: '亥', 灾煞: '子', 谋星: '辰' },
  巳酉丑: { 驿马: '亥', 桃花: '午', 华盖: '丑', 将星: '酉', 劫煞: '寅', 灾煞: '卯', 谋星: '未' },
  亥卯未: { 驿马: '巳', 桃花: '子', 华盖: '未', 将星: '卯', 劫煞: '申', 灾煞: '酉', 谋星: '丑' },
};

/** 天医：月支逆退一位（寅→丑、卯→寅 …） */
const TIANYI_BY_MONTH_ZHI = {
  寅: '丑', 卯: '寅', 辰: '卯', 巳: '辰', 午: '巳', 未: '午',
  申: '未', 酉: '申', 戌: '酉', 亥: '戌', 子: '亥', 丑: '子',
};

/** 天德（正丁二申宫，三壬四辛同，五亥六甲上，七癸八寅逢，九丙十居乙，子巳丑庚中） */
const TIANDE_BY_MONTH_ZHI = {
  寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲',
  申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚',
};

/** 月德（按三合局取干：寅午戌→丙、亥卯未→甲、申子辰→壬、巳酉丑→庚） */
const YUEDE_BY_MONTH_ZHI = {
  寅: '丙', 午: '丙', 戌: '丙',
  亥: '甲', 卯: '甲', 未: '甲',
  申: '壬', 子: '壬', 辰: '壬',
  巳: '庚', 酉: '庚', 丑: '庚',
};

/** 天喜（春戌夏丑秋辰冬未，按月支季节） */
const TIANXI_BY_SEASON = {
  寅: '戌', 卯: '戌', 辰: '戌',
  巳: '丑', 午: '丑', 未: '丑',
  申: '辰', 酉: '辰', 戌: '辰',
  亥: '未', 子: '未', 丑: '未',
};

/**
 * 卦级神煞列表（15 项，整体展示于盘面干支行之后）：
 *   日干系 4 项（天乙贵人/禄神/羊刃/文昌，按日干 dayGZ[0]）
 *   + 日支三合系 7 项（驿马/桃花/华盖/将星/劫煞/灾煞/谋星，按日支 dayGZ[1]）
 *   + 月支系 4 项（天医/天喜/天德/月德，按 monthGZ[1]），项序固定。
 * 天德/月德可能查出天干或地支单字，统一存于 gan 字段；其余存 zhi 字段。
 * @param {string} dayGZ 日干支（如'庚戌'）
 * @param {string} monthGZ 月干支（如'乙未'）
 * @returns {Array<{name:string, zhi?:string, gan?:string}>}
 */
export function computeShenshaList(dayGZ, monthGZ) {
  if (!dayGZ || !monthGZ) return []; // 入参防御：任一干支缺失时返回空列表
  const dayGan = dayGZ[0];
  const dayZhi = dayGZ[1];
  const monthZhi = monthGZ[1];
  const list = [];

  // A. 日干系（按日干）
  const guiren = GUIREN_BY_GAN[dayGan];
  if (guiren) list.push({ name: '天乙贵人', zhi: guiren.join('') });
  if (LUSHEN_BY_GAN[dayGan]) list.push({ name: '禄神', zhi: LUSHEN_BY_GAN[dayGan] });
  if (YANGREN_BY_GAN[dayGan]) list.push({ name: '羊刃', zhi: YANGREN_BY_GAN[dayGan] });
  if (WENCHANG_BY_GAN[dayGan]) list.push({ name: '文昌', zhi: WENCHANG_BY_GAN[dayGan] });

  // B. 日支三合系（按日支，六爻正统口径）
  const sanheDay = SANHE_SHENSHA[SANHE_GROUP[dayZhi]];
  if (sanheDay) {
    for (const name of ['驿马', '桃花', '华盖', '将星', '劫煞', '灾煞', '谋星']) {
      const zhi = sanheDay[name];
      if (zhi) list.push({ name, zhi });
    }
  }

  // C. 月支系（按月支）
  if (TIANYI_BY_MONTH_ZHI[monthZhi]) list.push({ name: '天医', zhi: TIANYI_BY_MONTH_ZHI[monthZhi] });
  if (TIANXI_BY_SEASON[monthZhi]) list.push({ name: '天喜', zhi: TIANXI_BY_SEASON[monthZhi] });
  if (TIANDE_BY_MONTH_ZHI[monthZhi]) list.push({ name: '天德', gan: TIANDE_BY_MONTH_ZHI[monthZhi] });
  if (YUEDE_BY_MONTH_ZHI[monthZhi]) list.push({ name: '月德', gan: YUEDE_BY_MONTH_ZHI[monthZhi] });

  return list;
}

/** 变卦六亲（本宫法）：保留变卦地支/五行，按本宫五行重排六亲前缀 */
function bianLiuqinBenGong(bianGua, benGongWx) {
  return bianGua.liuqin.map((s) => {
    const p = parseLiqin(s);
    return `${liuqinByWuxing(benGongWx, p.wuxing)}${p.zhi}${p.wuxing}`;
  });
}

/** 地支六冲 / 六合（相应位：上-三、五-二、四-初） */
const CHONG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const HE_PAIRS = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
// liuqin 数组为上→初，相应位索引对：(上,三)=0/3，(五,二)=1/4，(四,初)=2/5
const XIANGYING = [[0, 3], [1, 4], [2, 5]];
function hexagramRelation(liuqinArr) {
  const zhis = liuqinArr.map((s) => parseLiqin(s).zhi);
  const match = (pairs) =>
    XIANGYING.every(([a, b]) =>
      pairs.some(([x, y]) => (zhis[a] === x && zhis[b] === y) || (zhis[a] === y && zhis[b] === x)),
    );
  return { liuhe: match(HE_PAIRS), liuchong: match(CHONG_PAIRS) };
}

/** 按 method 分派到 qigua 模块（params.lines 已存在时不经此路径）。
 *  数字卦子算法 method=1|2 支持两种传法（避免不可达）：
 *    a) paipan({method:'number', params:{n1,n2,n3, method:2}, date}) —— UI 标准用法
 *    b) paipan({method:2, params:{n1,n2,n3}, date}) —— 顶层 method 直接为 1|2（与 qiguaFromNumber 对齐）
 */
function resolveQigua(method, params, date) {
  if (method === 'number' || method === 1 || method === 2) {
    return qiguaFromNumber(
      params.n1, params.n2, params.n3,
      method === 'number' ? (params.method ?? 1) : method,
    );
  }
  const dispatch = {
    qian: () => qiguaFromCoin(params.randomFn),
    yaoming: () => qiguaFromQian(params.lines),
    guaname: () => qiguaFromGuaName(params.input ?? params.lines, params.bian),
    baoshu: () => qiguaFromBaoshu(params.digits),
    time: () => qiguaFromTime(date),
    computer: () => qiguaFromRandom(params.randomFn),
  };
  const fn = dispatch[method];
  if (!fn) {
    throw new RangeError(`不支持的起卦方式：${JSON.stringify(method)}`);
  }
  return fn();
}

/** 校验动爻索引数组（0-5 整数，初爻=0） */
function validateDong(dong) {
  if (!Array.isArray(dong)) {
    throw new RangeError(`dong 须为数组（动爻索引 0-5），收到：${JSON.stringify(dong)}`);
  }
  for (const d of dong) {
    if (!Number.isInteger(d) || d < 0 || d > 5) {
      throw new RangeError(`动爻索引须为 0-5 的整数，收到：${JSON.stringify(d)}`);
    }
  }
}

/**
 * 生成完整盘面
 * @param {object} opts
 * @param {string} opts.method 起卦方式 id（qian/yaoming/guaname/number/baoshu/time/computer/fenmiao）
 * @param {object} [opts.params] 起卦参数；若含 6 位 1/2 爻画 lines 则直接采用（dong 默认 []）
 * @param {Date} opts.date 公历日期（用于干支历法）
 * @param {object|null} [opts.trueSolar] 真太阳时校准配置 {lng, tzOffsetMin, cityName?}；
 *   为 null（默认）时完全按北京时间排盘（旧行为）；提供时日柱/旬空仍按北京时间
 *   （与默认一致），仅重算时柱并附参考日建（trueSolarInfo）。
 * @param {object|null} [opts.yongShen] 自定用神 {type:'liuqin'|'zhi', value}（功能二）；
 *   默认 null。传入时计算地支分析的元神/忌神判定并写入快照。
 * @param {boolean} [opts.nagan] 纳干开关（功能三）；默认 false。开启时每爻附加 gan 字段。
 * @param {boolean} [opts.dizhi] 是否计算地支分析（功能一）；默认 false。
 *   dizhiAnalysis = (yongShen || dizhi) ? 计算结果 : null（默认 null 保持旧行为）。
 * @param {object|null} [opts.markers] 盘面标记开关（v0.2，功能 B）：11 键布尔对象
 *   （如 {'marker-wangshuai':true}）；默认 null。任一为 true 时烘焙 pan.markers，
 *   全关/缺省时省略 pan.markers（旧快照向后兼容）。
 * @returns 盘面对象（结构见文件头注释）
 */
export function paipan({ method, params = {}, date, trueSolar = null, yongShen = null, nagan = false, dizhi = false, markers = null } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`paipan 需要 Date 对象，收到：${date}`);
  }

  // ---- 1. 起卦 ----
  // lines 优先策略：params.lines 存在时直接采用（method 仅在无 lines 时才分派到 qigua），
  // 供 UI 层「直接指定爻画」场景使用；lines 存在但格式非法时抛错，绝不静默降级为随机起卦。
  let lines;
  let dong;
  if (typeof params.lines === 'string') {
    if (method === 'yaoming') {
      // 爻名卦：1=阳 2=阴 3=老阳 4=老阴，3/4 记动（格式校验由 qiguaFromQian 完成）
      ({ lines, dong } = qiguaFromQian(params.lines));
    } else if (/^[12]{6}$/.test(params.lines)) {
      lines = params.lines;
      dong = params.dong ?? [];
      validateDong(dong);
    } else {
      throw new RangeError(
        `爻画格式错误：需 6 位 1/2 字符串（初→上，1=阳 2=阴），收到：${JSON.stringify(params.lines)}`,
      );
    }
  } else {
    ({ lines, dong } = resolveQigua(method, params, date));
  }

  // ---- 2. 干支历法 ----
  const lunar = toLunar(date);

  // ---- 2.5 真太阳时校准（可选）：替换日柱/时柱/旬空，其余（月建/年建/农历）不变 ----
  let effLunar = lunar;
  let trueSolarInfo = null;
  if (trueSolar) {
    const r = trueSolarLunar(lunar, date, trueSolar);
    effLunar = r.lunar;
    trueSolarInfo = r.info;
  }

  // ---- 3. 本卦查表 ----
  const benGua = findGua(lines);
  if (!benGua) {
    throw new RangeError(`64 卦表中查无此卦：${JSON.stringify(lines)}`);
  }

  // ---- 4. 变卦：动爻爻画 1↔2 翻转后查表（无动爻 bian=null） ----
  let bianGua = null;
  let bianLines = null;
  if (dong.length > 0) {
    bianLines = lines
      .split('')
      .map((c, i) => (dong.includes(i) ? (c === '1' ? '2' : '1') : c))
      .join('');
    bianGua = findGua(bianLines);
    if (!bianGua) {
      throw new RangeError(`变卦查无此卦：${JSON.stringify(bianLines)}`);
    }
  }

  // ---- 5. 六神：日干起于初爻，顺排 6 位（跟随最终日柱） ----
  const dayGan = effLunar.ganzhiDay[0];
  const start = LIUSHEN_ORDER.indexOf(DAY_GAN_LIUSHEN[dayGan]);
  const liushen = LIUSHEN_ORDER.slice(start).concat(LIUSHEN_ORDER.slice(0, start));
  const shenshaOf = computeShensha(effLunar.ganzhiDay, effLunar.ganzhiYear);

  // ---- 6. 六爻组装（初→上） ----
  // guaTable.liuqin 为上→初，yao[i] 取 liuqin[5-i]；fushen 按爻位展开（0=初爻），与 yao 索引一致
  const yao = [];
  for (let i = 0; i < 6; i++) {
    const li = parseLiqin(benGua.liuqin[5 - i]);
    const fuRaw = benGua.fushen[i];
    yao.push({
      liuqin: li.liuqin,
      zhi: li.zhi,
      wuxing: li.wuxing,
      line: Number(lines[i]),
      dong: dong.includes(i),
      shi: benGua.shi === i,
      ying: benGua.ying === i,
      fushen: fuRaw ? parseLiqin(fuRaw) : null,
      shensha: shenshaOf(li.zhi),
      wangshuai: wangshuai(effLunar.yuejian, li.wuxing),
      gan: nagan ? naganGan(benGua.gong, i, lines) : undefined, // 纳干（功能三，v0.10 按上下经卦纳甲）；旧快照无此字段，向后兼容
    });
  }

  const summary = (g, linesStr) => {
    const rel = hexagramRelation(g.liuqin);
    return {
      name: g.name,
      gong: g.gong,
      lines: linesStr ?? null, // 6 位 1/2 爻画（初→上）；变卦列渲染用，本卦由调用方传入
      liuqin: [...g.liuqin],
      shi: g.shi,
      ying: g.ying,
      youhun: g.youhun,
      guihun: g.guihun,
      liuhe: rel.liuhe,
      liuchong: rel.liuchong,
    };
  };

  const benSummary = summary(benGua, lines);
  const bianSummary = bianGua
    ? {
        ...summary(bianGua, bianLines),
        liuqin: bianLiuqinBenGong(bianGua, GONG_WUXING[benGua.gong]),
        // v0.10 改进建7 #5：变卦纳干——按变卦上下经卦纳甲（bianLines → TRIGRAM_LINES 推导经卦），
        // 供 PanView 变卦列与 exportMd 变卦天干列共用；未开纳干/旧快照无此字段（向后兼容）
        gan: nagan
          ? Array.from({ length: 6 }, (_, i) => naganGan(bianGua.gong, i, bianLines))
          : undefined,
      }
    : null;

  // ---- 7. 地支分析（功能一/二）：传入 yongShen 或 dizhi 开关时计算，默认 null 保持旧行为 ----
  const dizhiAnalysis = yongShen || dizhi
    ? computeDizhiAnalysis({
        yao,
        bian: bianSummary,
        monthGZ: effLunar.ganzhiMonth,
        dayGZ: effLunar.ganzhiDay,
        xunkong: effLunar.xunkong,
        benLiuhe: benSummary.liuhe,
        benLiuchong: benSummary.liuchong,
        yongShen,
      })
    : null;

  // ---- 7.5 盘面标记（v0.2，功能 B）：markers 开关任一开启时烘焙 pan.markers ----
  const markersOn = markers && typeof markers === 'object' && Object.values(markers).some(Boolean);
  const markerSnapshot = markersOn
    ? computePanMarkers({
        yao,
        bian: bianSummary,
        monthGZ: effLunar.ganzhiMonth,
        dayGZ: effLunar.ganzhiDay,
        gongWx: GONG_WUXING[benGua.gong],
        markers,
      })
    : undefined;

  // ---- 7.6 卦身精确推演 + 香闺/床帐（v0.2 功能 C，v0.10 全匹配只显示地支）----
  // pan.guashen 保留旧简化表值（向后兼容旧测试/旧快照口径）；新增 guashenPrecise 为精确值，
  // UI/导出优先取 guashenPrecise。香闺/床帐按精确卦身五行生克推算（数组，旧快照形态为对象/null）。
  const guashenPrecise = computeGuashen({ shi: benGua.shi, shiLine: Number(lines[benGua.shi]) });
  const bedroom = guashenBedroom(guashenPrecise, yao);

  return {
    ben: benSummary,
    bian: bianSummary,
    yao,
    liushen,
    yearGZ: effLunar.ganzhiYear,
    monthGZ: effLunar.ganzhiMonth,
    dayGZ: effLunar.ganzhiDay,
    hourGZ: effLunar.ganzhiHour,
    xunkong: [...effLunar.xunkong],
    yuejian: effLunar.yuejian,
    solarDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    solarTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    lunarDate: `农历${lunar.year}年${lunar.isLeap ? '闰' : ''}${cnMonth(lunar.month)}${cnDay(lunar.day)}`,
    guashen: GONG_GUASHEN[benGua.gong],
    guashenPrecise, // 卦身精确推演（v0.2，功能 C）；UI/导出优先取此值
    xianggui: bedroom.xianggui, // 香闺：卦身五行所克之全部爻（v0.2，v0.10 数组[{zhi}]）
    chuangzhang: bedroom.chuangzhang, // 床帐：卦身五行所生之全部爻（v0.2，v0.10 数组[{zhi}]）
    ...(markersOn ? { markers: markerSnapshot } : {}), // 盘面标记快照（v0.2）；全关/缺省省略
    shashen: null, // 测试版暂不实现煞神（卦级神煞见 shenshaList）
    shenshaList: computeShenshaList(effLunar.ganzhiDay, effLunar.ganzhiMonth), // 卦级神煞 15 项（跟随最终日柱/月柱）
    trueSolarInfo, // 真太阳时校准展示信息（未开启为 null；含参考日建/真太阳时刻等）
    dizhiAnalysis, // 地支分析（功能一）；未计算为 null
    yongShen: yongShen ?? null, // 自定用神快照（功能二）；旧快照无此字段
    nagan: nagan || undefined, // 纳干开关快照（功能三）；false 时省略，兼容旧快照
  };
}
