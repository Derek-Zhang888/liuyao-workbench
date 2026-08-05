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
 *     guashen, shashen
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
 * 8. 煞神（shashen）：测试版暂不实现，恒为 null
 */
import { findGua } from './guaTable.js';
import { toLunar, WUXING_ZHI } from './ganzhi.js';
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
 * 旺衰（测试版简化）：月建五行 m vs 爻五行 x
 *   同我(x=m)=旺  生我(m生x)=相  我生(x生m)=休  克我(m克x)=囚  我克(x克m)=死
 * @param {string} yuejianZhi 月建地支（如'未'）
 * @param {string} wuxing 爻五行
 * @returns {'旺'|'相'|'休'|'囚'|'死'}
 */
export function wangshuai(yuejianZhi, wuxing) {
  const m = WUXING_ZHI[yuejianZhi];
  if (wuxing === m) return '旺';
  if (SHENG[m] === wuxing) return '相'; // 月建生爻
  if (SHENG[wuxing] === m) return '休'; // 爻生月建
  if (KE[m] === wuxing) return '囚'; // 月建克爻
  return '死'; // 爻克月建
}

/** 卦身（测试版简化）：本宫首卦卦身支（八宫表） */
const GONG_GUASHEN = { 乾: '戌', 兑: '酉', 离: '午', 震: '卯', 巽: '巳', 坎: '子', 艮: '寅', 坤: '未' };

/** 解析 '父戌土' -> {liuqin:'父', zhi:'戌', wuxing:'土'} */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s);
  if (!m) {
    throw new RangeError(`六亲字符串格式异常：${JSON.stringify(s)}`);
  }
  return { liuqin: m[1], zhi: m[2], wuxing: m[3] };
}

/** 八宫 → 五行（本宫法：变卦六亲以本宫五行为"我"） */
const GONG_WUXING = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

/**
 * 以"我"(wo) 之五行生克地支五行(zhiWx) 定六亲：
 *   同我=兄，生我=父，我生=孙，克我=官，我克=财
 */
function liuqinByWuxing(wo, zhiWx) {
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
 * @returns 盘面对象（结构见文件头注释）
 */
export function paipan({ method, params = {}, date } = {}) {
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

  // ---- 5. 六神：日干起于初爻，顺排 6 位 ----
  const dayGan = lunar.ganzhiDay[0];
  const start = LIUSHEN_ORDER.indexOf(DAY_GAN_LIUSHEN[dayGan]);
  const liushen = LIUSHEN_ORDER.slice(start).concat(LIUSHEN_ORDER.slice(0, start));
  const shenshaOf = computeShensha(lunar.ganzhiDay, lunar.ganzhiYear);

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
      wangshuai: wangshuai(lunar.yuejian, li.wuxing),
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

  return {
    ben: summary(benGua, lines),
    bian: bianGua
      ? { ...summary(bianGua, bianLines), liuqin: bianLiuqinBenGong(bianGua, GONG_WUXING[benGua.gong]) }
      : null,
    yao,
    liushen,
    yearGZ: lunar.ganzhiYear,
    monthGZ: lunar.ganzhiMonth,
    dayGZ: lunar.ganzhiDay,
    hourGZ: lunar.ganzhiHour,
    xunkong: [...lunar.xunkong],
    yuejian: lunar.yuejian,
    solarDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    solarTime: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    lunarDate: `农历${lunar.year}年${lunar.isLeap ? '闰' : ''}${cnMonth(lunar.month)}${cnDay(lunar.day)}`,
    guashen: GONG_GUASHEN[benGua.gong],
    shashen: null, // 测试版暂不实现煞神（神煞已按爻展示于盘面）
  };
}
