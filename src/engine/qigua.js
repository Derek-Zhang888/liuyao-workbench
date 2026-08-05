/**
 * 起卦算法模块（六爻工作台 - 排盘引擎依赖之三）
 *
 * 纯函数模块，无 DOM 依赖。8 种起卦算法，统一输出：
 *   { lines: '211111'(6 位爻画, 初爻→上爻, 1=阳 2=阴), dong: [0,2](动爻索引, 0=初爻) }
 *
 * 接口（与 task-4-brief.md 一致）：
 *   qiguaFromQian(lines)            爻名卦：输入 6 位爻画（1阳 2阴 3老阳 4老阴）
 *   qiguaFromCoin(randomFn)         钱币卦：3 枚×6 次，randomFn 每次返回正面枚数 0-3
 *   qiguaFromGuaName(input, bian)   卦名卦：输入 64 卦名 / 纯卦单字 / 6 位爻画，变卦选填（相异爻位为动爻）
 *   searchGuaByName(keyword)        卦名模糊搜索：子串匹配 64 卦名
 *   qiguaFromNumber(n1,n2,n3,m)     数字卦：method=1|2
 *   qiguaFromBaoshu(digits)         报数卦：2-8 位数字字符串
 *   qiguaFromTime(date)             时间卦：农历年月日时起卦
 *   qiguaFromRandom(randomFn)       电脑卦：默认 Math.random
 *   QIGUA_METHODS                   7 项配置 {id, name, desc}
 *
 * 卦数映射（先天八卦数，与简报一致）：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤
 * 三爻画（初→上）：乾111 兑112 离121 震122 巽211 坎212 艮221 坤222
 *
 * 上下卦位置（传统六爻口径，简报个别注释有镜像歧义，见 task-4-report.md）：
 *   下卦 = 前 3 位（初二三爻），上卦 = 后 3 位（四五上爻）
 *   例：天风姤（巽下乾上）= 下巽'211' + 上乾'111' = '211111'，与 64 卦表一致
 *
 * 余数约定：÷8 余 0 记作 8（坤）；÷6 余 0 记作 6（第 6 爻动，索引 5）
 *
 * 钱币卦（0正=老阳 1正=少阴 2正=少阳 3正=老阴）：
 *   沿用传统「背为阳」约定——三枚钱币中正（字面）为阴、反（背面/花面）为阳；
 *   故正面枚数越多越偏阴，0正（3背）= 老阳、3正（0背）= 老阴。
 */
import { toLunar } from './ganzhi.js';
import { GUA_64 } from './guaTable.js';

/** 卦数 → 三爻画（初→上，1=阳 2=阴）；下标即卦数 1-8 */
const GUA_NUM_LINES = ['', '111', '112', '121', '122', '211', '212', '221', '222'];

/** 钱币卦：正面枚数(0-3) → 和数（6老阴 7少阳 8少阴 9老阳，按「背为阳」约定）
 *  0正=老阳(9)  1正=少阴(8)  2正=少阳(7)  3正=老阴(6) */
const HEADS_TO_VALUE = { 0: 9, 1: 8, 2: 7, 3: 6 };

/** 除 8 取卦数，余 0 记 8（坤）；n 均为非负整数 */
function guaNumMod(n) {
  const r = n % 8;
  return r === 0 ? 8 : r;
}

/** 除 6 取动爻编号 1-6，余 0 记 6（第 6 爻） */
function dongNumMod(n) {
  const r = n % 6;
  return r === 0 ? 6 : r;
}

/** 动爻编号 1-6 → 索引 0-5 */
function dongIdx(n) {
  return n - 1;
}

/** 动爻索引去重 + 升序 */
function normalizeDong(dong) {
  return [...new Set(dong)].sort((a, b) => a - b);
}

/** 上下卦数 + 动爻编号 → 统一输出 */
function buildResult(shangNum, xiaNum, dongNum) {
  return {
    lines: GUA_NUM_LINES[xiaNum] + GUA_NUM_LINES[shangNum], // 下卦前 3 位，上卦后 3 位
    dong: [dongIdx(dongNum)],
  };
}

/** 参数必须为 Date */
function toDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`需要 Date 对象，收到：${date}`);
  }
  return date;
}

/** 时辰序数 1-12（子=1 ... 亥=12，23-1 点为子时） */
function shichenNo(d) {
  return Math.floor(((d.getHours() + 1) % 24) / 2) + 1;
}

/**
 * 爻名卦：直接输入 6 位爻画（1阳 2阴 3老阳 4老阴），3/4 对应爻位记动
 * @param {string} lines 6 位字符串，取值 1-4
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromQian(lines) {
  if (typeof lines !== 'string' || !/^[1-4]{6}$/.test(lines)) {
    throw new RangeError(`爻名卦需要 6 位字符串（1阳 2阴 3老阳 4老阴），收到：${JSON.stringify(lines)}`);
  }
  const out = lines
    .split('')
    .map((c) => (c === '3' ? '1' : c === '4' ? '2' : c));
  const dong = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '3' || lines[i] === '4') dong.push(i);
  }
  return { lines: out.join(''), dong };
}

/**
 * 钱币卦：连摇 6 次，每次 3 枚钱币。
 * randomFn() 每次返回 0-3，表示 3 枚钱币中正面向上的枚数（按「背为阳」约定）：
 *   0正=老阳(9, 阳爻动)  1正=少阴(8, 阴爻静)
 *   2正=少阳(7, 阳爻静) 3正=老阴(6, 阴爻动)
 * @param {() => number} randomFn 须返回 0-3 的整数（正面枚数）；默认 () => Math.floor(Math.random() * 4)
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromCoin(randomFn = () => Math.floor(Math.random() * 4)) {
  if (typeof randomFn !== 'function') {
    throw new TypeError('randomFn 必须为函数');
  }
  const lines = [];
  const dong = [];
  for (let i = 0; i < 6; i++) {
    const n = randomFn();
    if (!Number.isInteger(n) || n < 0 || n > 3) {
      throw new RangeError(`钱币卦 randomFn 须返回 0-3（正面枚数），收到：${n}`);
    }
    const v = HEADS_TO_VALUE[n]; // 0正=9老阳 1正=8少阴 2正=7少阳 3正=6老阴
    lines.push(v === 7 || v === 9 ? '1' : '2');
    if (v === 6 || v === 9) dong.push(i); // 老阴/老阳动
  }
  return { lines: lines.join(''), dong };
}

/** 卦名别名表：把口语/易混写法规范为 64 卦表中的标准名。
 *  主要收录「水火既济/火水未济」对称记忆造成的上下互换错写。 */
const GUA_NAME_ALIASES = {
  水火未济: '火水未济',
};

/** 卦名 → 64 卦表条目（名 / 纯卦单字 / 去「为」简称 / 别名）；查无返回 undefined */
export function findGuaByName(name) {
  if (typeof name !== 'string') return undefined;
  let hit = GUA_64.find((g) => g.name === name);
  if (!hit) hit = GUA_64.find((g) => g.gong === name); // 八纯卦单字（乾 兑 离 震 巽 坎 艮 坤）
  if (!hit) hit = GUA_64.find((g) => g.name.replace('为', '') === name); // 如「乾天」
  if (!hit && GUA_NAME_ALIASES[name]) hit = GUA_64.find((g) => g.name === GUA_NAME_ALIASES[name]); // 别名
  return hit;
}

/**
 * 卦名模糊搜索：关键词按子串匹配卦名（含去「为」简称）与八宫名。
 * 排序：精确名 > 名前缀 > 名含 > 宫名含；关键词为空返回空数组。
 * 例：'天' → 天风姤 / 天山遁 / 天地否 / 火天大有 …
 * @param {string} keyword 关键词，如「天」「同人」「乾」
 * @param {number} [limit=12] 最多返回条数（<=0 表示不限）
 * @returns {Array<{gong:string, name:string, lines:string}>} 64 卦表条目
 */
export function searchGuaByName(keyword, limit = 12) {
  const k = typeof keyword === 'string' ? keyword.trim() : '';
  if (!k) return [];
  const rank = (g) => {
    const short = g.name.replace('为', '');
    if (g.name === k || short === k) return 0;
    if (g.name.startsWith(k) || short.startsWith(k)) return 1;
    if (g.name.includes(k) || short.includes(k)) return 2;
    if (g.gong.includes(k)) return 3;
    return 9;
  };
  // 别名（口语写法）→ 标准名：搜索时对别名也做完全匹配（rank 0）和子串匹配（rank 2）
  const aliasedName = GUA_NAME_ALIASES[k];
  const aliasRank = (g) => {
    if (!aliasedName) return 9;
    if (g.name === aliasedName) return 0; // 命中别名
    if (g.name.includes(aliasedName)) return 2; // 子串命中别名
    return 9;
  };
  const hits = GUA_64
    .map((g, i) => ({ g, r: Math.min(rank(g), aliasRank(g)), i }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.g);
  return limit > 0 ? hits.slice(0, limit) : hits;
}

/**
 * 卦名卦：输入 64 卦名（如「乾为天」「天风姤」）、八纯卦单字（如「坎」）
 * 或直接给 6 位爻画字符串。
 * 传入变卦名时，本卦与变卦爻画相异的爻位即为动爻；不传则无动爻。
 * @param {string} input 本卦卦名或爻画
 * @param {string} [bianInput] 变卦卦名或爻画（选填）
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromGuaName(input, bianInput) {
  const toLines = (v, label) => {
    if (typeof v === 'string' && /^[12]{6}$/.test(v)) return v;
    const hit = findGuaByName(v);
    if (!hit) {
      throw new RangeError(`${label}查无此卦：${JSON.stringify(v)}`);
    }
    return hit.lines;
  };
  const lines = toLines(input, '卦名卦');
  if (bianInput == null || bianInput === '') {
    return { lines, dong: [] };
  }
  const bianLines = toLines(bianInput, '卦名卦变卦');
  const dong = [];
  for (let i = 0; i < 6; i++) {
    if (lines[i] !== bianLines[i]) dong.push(i);
  }
  return { lines, dong };
}

/**
 * 数字卦：输入 3 个正整数。
 *   method=1：(第1数)÷8 上卦，(第2+第3)÷8 下卦，(1+2+3)÷6 动爻
 *   method=2：第1数÷8 上卦，第2数÷8 下卦，第3数÷6 动爻
 * 余 0 记作 8（坤）/ 第 6 爻动（索引 5）
 * @param {number} n1 n2 n3 正整数
 * @param {1|2} method
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromNumber(n1, n2, n3, method = 1) {
  for (const n of [n1, n2, n3]) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`数字卦需要非负整数，收到：${n}`);
    }
  }
  if (method !== 1 && method !== 2) {
    throw new RangeError(`数字卦 method 仅支持 1|2，收到：${method}`);
  }
  let shangNum;
  let xiaNum;
  let dongNum;
  if (method === 1) {
    shangNum = guaNumMod(n1);
    xiaNum = guaNumMod(n2 + n3);
    dongNum = dongNumMod(n1 + n2 + n3);
  } else {
    shangNum = guaNumMod(n1);
    xiaNum = guaNumMod(n2);
    dongNum = dongNumMod(n3);
  }
  return buildResult(shangNum, xiaNum, dongNum);
}

/**
 * 报数卦：2-8 位数字字符串。
 * 前两位为卦数 0-8（先上后下），其余各位为动爻编号 0-6（多个动爻去重排序）。
 * 0 视为「零」，按「零除以八当作八 / 零除以六当作六」约定映射：卦数位 0→8，动爻位 0→6。
 * @param {string} digits 如 '1234'：上乾下兑，3、4 爻动
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromBaoshu(digits) {
  if (typeof digits !== 'string' || !/^\d{2,8}$/.test(digits)) {
    throw new RangeError(`报数卦需要 2-8 位数字字符串，收到：${JSON.stringify(digits)}`);
  }
  const normNum = (s, max, fallback) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > max) {
      throw new RangeError(`报数卦数字须为 0-${max}，收到：${s}`);
    }
    return n === 0 ? fallback : n; // 0 → fallback（卦数位 0→8，动爻位 0→6）
  };
  const shangNum = normNum(digits[0], 8, 8);
  const xiaNum = normNum(digits[1], 8, 8);
  const dong = [];
  for (let i = 2; i < digits.length; i++) {
    dong.push(dongIdx(normNum(digits[i], 6, 6)));
  }
  return { lines: GUA_NUM_LINES[xiaNum] + GUA_NUM_LINES[shangNum], dong: normalizeDong(dong) };
}

/**
 * 时间卦（梅花传统起卦）：以农历年支序数(子=1...亥=12)、农历月、农历日、
 * 时辰序数(子=1...亥=12) 四数起卦。
 *   上卦 = (年支 + 月 + 日) ÷ 8；下卦 = (年支 + 月 + 日 + 时) ÷ 8；
 *   动爻 = (年支 + 月 + 日 + 时) ÷ 6
 * @param {Date} date 公历日期（农历由 ganzhi.toLunar 换算）
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromTime(date) {
  const d = toDate(date);
  const l = toLunar(d);
  const yearZhi = (((d.getFullYear() - 4) % 12) + 12) % 12 + 1; // 年支序数 子=1
  const sz = shichenNo(d);
  const shangNum = guaNumMod(yearZhi + l.month + l.day);
  const xiaNum = guaNumMod(yearZhi + l.month + l.day + sz);
  const dongNum = dongNumMod(yearZhi + l.month + l.day + sz);
  return buildResult(shangNum, xiaNum, dongNum);
}

/**
 * 电脑卦：随机生成 6 爻。randomFn() 每次返回 [0,1) 的随机数，等概率映射 4 种爻型：
 *   [0,0.25) 少阳(1)  [0.25,0.5) 少阴(2)  [0.5,0.75) 老阳(3,动)  [0.75,1) 老阴(4,动)
 * @param {() => number} randomFn 默认 Math.random
 * @returns {{lines:string, dong:number[]}}
 */
export function qiguaFromRandom(randomFn = Math.random) {
  if (typeof randomFn !== 'function') {
    throw new TypeError('randomFn 必须为函数');
  }
  const lines = [];
  const dong = [];
  for (let i = 0; i < 6; i++) {
    const r = randomFn();
    if (typeof r !== 'number' || r < 0 || r >= 1) {
      throw new RangeError(`电脑卦 randomFn 须返回 [0,1) 的随机数，收到：${r}`);
    }
    const v = r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4;
    lines.push(v === 1 || v === 3 ? '1' : '2');
    if (v >= 3) dong.push(i);
  }
  return { lines: lines.join(''), dong };
}

/** 7 种起卦方式配置 */
export const QIGUA_METHODS = [
  { id: 'qian', name: '钱币卦', desc: '按六爻各三枚钱币的正/背面成卦（如初爻「背正正」），老阳/老阴为动爻' },
  { id: 'yaoming', name: '爻名卦', desc: '直接输入六爻爻画（1阳 2阴 3老阳 4老阴）成卦' },
  { id: 'guaname', name: '卦名卦', desc: '分别搜索本卦、变卦卦名成卦；变卦留空则无动爻，选定变卦后相异爻位即动爻' },
  { id: 'number', name: '数字卦', desc: '输入三个正整数成卦，method=1 用第2+第3数取下卦，method=2 用第2数取下卦' },
  { id: 'baoshu', name: '报数卦', desc: '报 2-8 位数字：前两位为上下卦数，后几位为动爻编号' },
  { id: 'time', name: '时间卦', desc: '以农历年支、月、日、时辰序起卦（年月日时法）' },
  { id: 'computer', name: '电脑卦', desc: '随机生成六爻（含动爻），由 randomFn 驱动，默认 Math.random' },
];
