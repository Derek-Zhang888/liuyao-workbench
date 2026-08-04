/**
 * 干支历法模块（六爻工作台 - 排盘引擎依赖之二）
 *
 * 纯函数模块，无 DOM 依赖。接口：
 *   toLunar(date) -> { year, month, day, isLeap, ganzhiYear, ganzhiMonth,
 *                      ganzhiDay, ganzhiHour, xunkong:[地支,地支], yuejian }
 *   GAN / ZHI / WUXING_GAN / WUXING_ZHI
 *
 * 算法说明：
 * - 农历：lunarInfo 表（1900-2100）查闰月与每月大小（见 ../data/lunarData.js）
 * - 日干支：锚点法，2000-01-07 为甲子日，按日历日差 mod 60 推算
 * - 年干支：(公历年-4) % 60（测试版按公历年，不处理立春分界，见报告）
 * - 月干支：五虎遁（甲己之年丙作首），正月=寅月，按农历月顺推（闰月与上月同干支）
 * - 时干支：五鼠遁（甲己还加甲），23-1 点子时，子时天干由日干决定
 * - 旬空：日干支所在旬（甲子/甲戌/甲申/甲午/甲辰/甲寅旬）末尾两个空亡地支
 * - 月建：农历月直接映射（正月=寅），不处理立春分界（见报告）
 *
 * 简化约定（测试版）：
 * 1. 年干支按公历年计算，不按立春换年
 * 2. 月柱按农历月计算，不按节气换月
 * 3. 日干支按公历日界（00:00）换日；时柱采用子时换日（23:00 后子时用次日日干），
 *    与主流排盘软件（文墨天机等）及 6tail 默认行为一致
 */
import { LUNAR_INFO } from '../data/lunarData.js';

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export const WUXING_GAN = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

export const WUXING_ZHI = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/** 1900-01-31（1900 年正月初一）的日历日序号 */
const ANCHOR_CNY = Date.UTC(1900, 0, 31) / 86400000;
/** 2000-01-07（甲子日）的日历日序号 */
const ANCHOR_JIAZI = Date.UTC(2000, 0, 7) / 86400000;

/** 公历日期 -> 纯日历日序号（Date.UTC 构造，避免本地历史时区陷阱） */
function toDays(y, m, d) {
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** 某年闰月月份（0=无闰月） */
function leapMonth(y) {
  return LUNAR_INFO[y - 1900] & 0xf;
}

/** 某年闰月天数 */
function leapDays(y) {
  const lm = leapMonth(y);
  return lm && (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
}

/** 某年某农历月天数（1-12） */
function monthDays(y, m) {
  return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29;
}

/** 某农历年总天数 */
function yearDays(y) {
  let s = 0;
  for (let m = 1; m <= 12; m++) s += monthDays(y, m);
  if (leapMonth(y)) s += leapDays(y);
  return s;
}

/**
 * 公历 -> 农历 + 四柱干支 + 旬空 + 月建
 * @param {Date} date 公历日期（时区为本地时间；小时用于时干支）
 * @returns {{year:number, month:number, day:number, isLeap:boolean,
 *   ganzhiYear:string, ganzhiMonth:string, ganzhiDay:string, ganzhiHour:string,
 *   xunkong:string[], yuejian:string}}
 */
export function toLunar(date) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const h = date.getHours();

  // ---- 农历年月日（lunarInfo 查表） ----
  const offset = toDays(gy, gm, gd) - ANCHOR_CNY;
  if (offset < 0) {
    throw new RangeError(`日期超出农历数据范围（最早 1900-01-31）：${gy}-${gm}-${gd}`);
  }
  let ly = 1900;
  let rest = offset;
  while (ly < 2100 && rest >= yearDays(ly)) {
    rest -= yearDays(ly);
    ly += 1;
  }
  if (ly > 2100) {
    throw new RangeError(`日期超出农历数据范围（最晚 2100 年末）：${gy}-${gm}-${gd}`);
  }
  const lm = leapMonth(ly);
  let month = 0;
  let isLeap = false;
  for (let m = 1; m <= 12; m++) {
    const md = monthDays(ly, m);
    if (rest < md) {
      month = m;
      break;
    }
    rest -= md;
    if (m === lm) {
      const ld = leapDays(ly);
      if (rest < ld) {
        month = m;
        isLeap = true;
        break;
      }
      rest -= ld;
    }
  }
  const day = rest + 1;

  // ---- 年干支：(公历年-4) % 60（测试版简化，不按立春分界） ----
  const yearIdx = ((gy - 4) % 60 + 60) % 60;
  const ganzhiYear = GAN[yearIdx % 10] + ZHI[yearIdx % 12];

  // ---- 月干支：五虎遁（正月=寅，农历月顺推，闰月与上月同干支） ----
  const monthZhiIdx = (month + 1) % 12; // 正月=寅(index2)
  const firstMonthGan = (yearIdx % 10) * 2 + 2; // 甲己丙作首：年干 x -> 正月干 (2x+2)%10
  const monthGan = (firstMonthGan + month - 1) % 10;
  const ganzhiMonth = GAN[monthGan] + ZHI[monthZhiIdx];

  // ---- 日干支：锚点 2000-01-07 甲子日，日历日差 mod 60 ----
  const dayIdx = ((toDays(gy, gm, gd) - ANCHOR_JIAZI) % 60 + 60) % 60;
  const ganzhiDay = GAN[dayIdx % 10] + ZHI[dayIdx % 12];

  // ---- 时干支：五鼠遁（23-1 点子时，子时干=(日干x2)%10；23:00 后按次日日干，子时换日） ----
  const shichen = Math.floor(((h + 1) % 24) / 2); // 23/0->子(0) ... 22->亥(11)
  const dayGanForHour = (dayIdx + (h >= 23 ? 1 : 0)) % 10; // 晚子时用次日日干
  const ziGan = dayGanForHour * 2 % 10;
  const hourGan = (ziGan + shichen) % 10;
  const ganzhiHour = GAN[hourGan] + ZHI[shichen];

  // ---- 旬空：日干支所在旬（每旬 10 天，旬末两个地支落空） ----
  const xunStart = dayIdx - (dayIdx % 10);
  const xunkong = [ZHI[(xunStart + 10) % 12], ZHI[(xunStart + 11) % 12]];

  // ---- 月建：农历月直接映射（正月=寅），闰月取同月 ----
  const yuejian = ZHI[monthZhiIdx];

  return {
    year: ly,
    month,
    day,
    isLeap,
    ganzhiYear,
    ganzhiMonth,
    ganzhiDay,
    ganzhiHour,
    xunkong,
    yuejian,
  };
}
