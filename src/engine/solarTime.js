/**
 * 真太阳时模块（六爻工作台 - 新增）
 *
 * 纯函数模块，无 DOM 依赖。接口：
 *   eqOfTime(date) -> number                  均时差 EoT（分钟，-16 ~ +16）
 *   trueSolarMinutes(date, lng) -> number     真太阳时（当日分钟数 0-1440，已归一化）
 *   cityLocalClock(date, tzOffsetMin) -> {y,m,d,hour,min}  城市本地时钟（含日历日期）
 *   solarHourGZ(dayGZ, minutes) -> string     真太阳时 → 时干支（五鼠遁，基于日干不变）
 *   shichenName(minutes) -> string            时辰名（如 '戌时'）
 *   trueSolarDayRef(y, m, d, minutes) -> string  真太阳时换日参考日建（展示用）
 *   trueSolarLunar(lunar, date, cfg) -> {lunar, info}  汇总计算（供 paipan 应用）
 *
 * 原理（用户拍板口径）：
 *   真太阳时 = 北京时间 + (当地经度 − 120°) × 4 分钟/度 + 均时差(EoT)
 *   - 经度修正：北京时间基准东经 120°，每差 1° = 4 分钟（东经 >120° 加，<120° 减）
 *   - 均时差 EoT：Meeus《Astronomical Algorithms》第 28 章平太阳时/真太阳时公式
 *     （黄赤交角 + 轨道离心率导致的太阳视运动不均，极值约 ±16 分钟），纯本地计算无需联网
 *   - 时区：城市表内置固定偏移（不含夏令时动态切换，见 src/data/cities.js）
 *
 * 影响范围：
 *   - 时柱：按真太阳时时辰 + 五鼠遁（基于最终日干，日干不变）
 *   - 日柱/旬空：与默认（trueSolar=null）完全一致——直接复用 toLunar 的
 *     北京时间日期 + 北京时间 23:00 换日结果，不再按城市本地日历日期重算
 *   - 参考日建：若按当地真太阳时 23:00 换日，日建应为何（展示用，不改变实际日建；
 *     参考基准仍为城市本地日历日期 + 真太阳时时刻，见 trueSolarDayRef）
 *   - 月建/太岁：不变（节气是绝对时刻，全球同时）
 *
 * 说明：date 的本地字段按应用口径视为「北京时间」（与 ganzhi.toLunar 一致）；
 *   城市本地时钟 = 北京时间 + (timezoneOffsetMin − 480) 分钟，仅用于参考日建与展示。
 */
import { GAN, ZHI, ganzhiDayOf } from './ganzhi.js';

/** Unix 纪元（1970-01-01）对应的儒略日 */
const JD_UNIX_EPOCH = 2440587.5;
const DAY_MS = 86400000;

/** 北京时间基准东经 */
const BEIJING_LNG = 120;

/** 校验 Date 入参 */
function assertDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`需要 Date 对象，收到：${date}`);
  }
  return date;
}

/** 校验经度入参（-180 ~ 180，东经正、西经负） */
function assertLng(lng) {
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(`经度须为 -180 ~ 180 的数值（东经正、西经负），收到：${lng}`);
  }
  return lng;
}

/** 分钟数 → 归一化到 [0, 1440) */
function normMinutes(m) {
  return ((m % 1440) + 1440) % 1440;
}

/**
 * 均时差 EoT（分钟）：Meeus《Astronomical Algorithms》第 28 章公式。
 * 由太阳平黄经 L0、平近点角 M、轨道离心率 e、黄赤交角 ε 计算视太阳时与平太阳时之差：
 *   E = y·sin(2·L0) − 2·e·sin(M) + 4·e·y·sin(M)·cos(2·L0) − 0.5·y²·sin(4·L0) − 1.25·e²·sin(2·M)
 *   EoT(分钟) = E(弧度) × 180/π × 4
 * 极值：2 月中 ≈ −14.2 分钟，11 月初 ≈ +16.5 分钟；误差 < 1 秒（相对完整章动/光行差修正）。
 * @param {Date} date 任意时刻（取儒略日，不依赖时区）
 * @returns {number} 均时差分钟数（正 = 真太阳时快于平太阳时）
 */
export function eqOfTime(date) {
  assertDate(date);
  const jd = date.getTime() / DAY_MS + JD_UNIX_EPOCH;
  const T = (jd - 2451545.0) / 36525; // 自 J2000.0 的儒略世纪数
  const L0 = ((280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360 + 360) % 360;
  const M = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360 + 360) % 360;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  // 中心差（方程 of center，度）
  const C =
    ((1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin((M * Math.PI) / 180) +
      (0.019993 - 0.000101 * T) * Math.sin((2 * M * Math.PI) / 180) +
      0.000289 * Math.sin((3 * M * Math.PI) / 180));
  // 视黄经（度）：真黄经 − 光行差 0.00569° − 章动 0.00478°·sin(Ω)；仅用于 ε 精度，E 主项已含 L0/M
  const omega = 125.04 - 1934.136 * T;
  void C; void omega;
  // 平黄赤交角（度，Meeus 22.2）
  const eps = 23.43929111 - 0.013004167 * T - 0.000000164 * T * T + 0.0000005036 * T ** 3;
  const y = Math.tan((eps * Math.PI) / 360) ** 2; // tan²(ε/2)
  const L0r = (L0 * Math.PI) / 180;
  const Mr = (M * Math.PI) / 180;
  const E =
    y * Math.sin(2 * L0r) -
    2 * e * Math.sin(Mr) +
    4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
    0.5 * y * y * Math.sin(4 * L0r) -
    1.25 * e * e * Math.sin(2 * Mr);
  return (E * 720) / Math.PI; // E(弧度) × 180/π × 4 分钟/度
}

/**
 * 真太阳时（当日分钟数 0-1440，已归一化跨午夜回卷）：
 *   真太阳时 = 北京时间 + (当地经度 − 120°) × 4 分钟/度 + 均时差(EoT)
 * date 的本地字段视为北京时间（应用口径）；返回东经当地的真太阳时刻。
 * @param {Date} date 北京时间时刻
 * @param {number} lng 当地经度（东经正、西经负）
 * @returns {number} 真太阳时分钟数 [0, 1440)
 */
export function trueSolarMinutes(date, lng) {
  assertDate(date);
  assertLng(lng);
  const bjMin =
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60 +
    date.getMilliseconds() / 60000;
  const solar = bjMin + (lng - BEIJING_LNG) * 4 + eqOfTime(date);
  return normMinutes(solar);
}

/**
 * 城市本地时钟（含日历日期）：北京时钟 + (timezoneOffsetMin − 480) 分钟。
 * 日历日期跨日/跨月/跨年回卷用 Date 本地日历算术（与浏览器时区无关）。
 * @param {Date} date 北京时间时刻（本地字段 = 北京时间）
 * @param {number} tzOffsetMin 城市时区偏移分钟（如北京 +480、纽约 -300）
 * @returns {{y:number, m:number, d:number, hour:number, min:number}} 城市本地年月日与时分
 */
export function cityLocalClock(date, tzOffsetMin) {
  assertDate(date);
  if (typeof tzOffsetMin !== 'number' || !Number.isFinite(tzOffsetMin)) {
    throw new RangeError(`时区偏移须为分钟数，收到：${tzOffsetMin}`);
  }
  const bjMin = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const localMin = bjMin + (tzOffsetMin - 480);
  const dayOffset = Math.floor(localMin / 1440);
  const rem = normMinutes(localMin);
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset);
  return {
    y: base.getFullYear(),
    m: base.getMonth() + 1,
    d: base.getDate(),
    hour: Math.floor(rem / 60),
    min: Math.floor(rem % 60),
  };
}

/**
 * 分钟数 → 时辰下标（0=子(23-1点) 1=丑 … 11=亥(21-23点)，与 ganzhi.toLunar 的 shichen 一致）。
 * @param {number} minutes 当日分钟数
 * @returns {number} 0-11 时辰下标
 */
export function shichenIdx(minutes) {
  const h = Math.floor(normMinutes(minutes) / 60);
  return Math.floor(((h + 1) % 24) / 2);
}

/**
 * 分钟数 → 时辰名（如 '戌时'）。
 * @param {number} minutes 当日分钟数
 * @returns {string} 时辰名（地支 + '时'）
 */
export function shichenName(minutes) {
  return `${ZHI[shichenIdx(minutes)]}时`;
}

/**
 * 真太阳时时干支：五鼠遁（甲己还加甲）基于「最终日干」（日干不变），
 * 时辰由真太阳时分钟数决定。
 * @param {string} dayGZ 最终日干支（如 '庚戌'，取天干为五鼠遁基准）
 * @param {number} minutes 真太阳时分钟数 [0, 1440)
 * @returns {string} 时干支，如 '丁亥'
 */
export function solarHourGZ(dayGZ, minutes) {
  if (typeof dayGZ !== 'string' || dayGZ.length !== 2) {
    throw new RangeError(`日干支须为 2 字字符串，收到：${JSON.stringify(dayGZ)}`);
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    throw new RangeError(`真太阳时分钟数须为数值，收到：${minutes}`);
  }
  const dayGanIdx = GAN.indexOf(dayGZ[0]);
  const dayZhiIdx = ZHI.indexOf(dayGZ[1]);
  if (dayGanIdx < 0 || dayZhiIdx < 0) {
    throw new RangeError(`日干支非法（须为天干+地支），收到：${JSON.stringify(dayGZ)}`);
  }
  const idx = shichenIdx(minutes);
  const ziGan = (dayGanIdx * 2) % 10; // 甲己还加甲 → 子时干 = 日干 × 2 mod 10
  const hourGan = (ziGan + idx) % 10;
  return GAN[hourGan] + ZHI[idx];
}

/**
 * 真太阳时换日参考日建（展示用）：若按「当地真太阳时 23:00」换日，日建应为何。
 * 以城市本地日历日期为基准，换日触发小时取真太阳时小时（>=23 则进入次日）。
 * @param {number} y 城市本地公历年
 * @param {number} m 城市本地公历月
 * @param {number} d 城市本地公历日
 * @param {number} minutes 真太阳时分钟数
 * @returns {string} 参考日干支
 */
export function trueSolarDayRef(y, m, d, minutes) {
  const h = Math.floor(normMinutes(minutes) / 60);
  return ganzhiDayOf(y, m, d, h);
}

/**
 * 汇总计算真太阳时排盘（供 paipan 应用）：
 *   - 日柱/旬空：与默认（trueSolar=null）完全一致——复用 toLunar 的北京时间日期 +
 *     北京时间 23:00 换日结果（官方口径不变），不随城市本地日历日期变化
 *   - 时柱：五鼠遁（基于最终日干，日干不变）+ 真太阳时时辰
 *   - 参考日建：若按当地真太阳时 23:00 换日则为何（展示用，基于城市本地日期 + 真太阳时时刻）
 *   - 月建/年建/农历：保持 toLunar 结果不变（节气是绝对时刻）
 * @param {object} lunar toLunar(date) 的原始结果
 * @param {Date} date 北京时间时刻
 * @param {{lng:number, tzOffsetMin:number, cityName?:string}} cfg 真太阳时配置
 * @returns {{lunar: object, info: object}} 修正后的 lunar（仅时柱替换，日柱/旬空不变）与展示信息
 */
export function trueSolarLunar(lunar, date, cfg) {
  if (!lunar || !lunar.ganzhiDay) {
    throw new TypeError(`trueSolarLunar 需要 toLunar 结果，收到：${lunar}`);
  }
  const lng = assertLng(cfg?.lng);
  const tzOffsetMin = cfg?.tzOffsetMin;
  if (typeof tzOffsetMin !== 'number' || !Number.isFinite(tzOffsetMin)) {
    throw new RangeError(`trueSolarLunar 需要时区偏移分钟数，收到：${tzOffsetMin}`);
  }
  assertDate(date);

  const tsMin = trueSolarMinutes(date, lng);
  // 城市本地时钟仅用于参考日建（trueSolarDayRef）与展示（localDate），不再参与日柱计算
  const local = cityLocalClock(date, tzOffsetMin);

  // 日柱/旬空：直接复用默认路径结果（北京时间日期 + 北京时间 23:00 换日）——
  // 与 trueSolar=null 时完全一致，不按城市本地日历日期重算
  const dayGZ = lunar.ganzhiDay;
  const xunkong = [...lunar.xunkong];

  // 时柱：五鼠遁（日干不变）+ 真太阳时时辰
  const hourGZ = solarHourGZ(dayGZ, tsMin);

  // 参考日建：若按当地真太阳时 23:00 换日（独立参考信息，不改变实际日建）
  const refDayGZ = trueSolarDayRef(local.y, local.m, local.d, tsMin);

  const tsNorm = normMinutes(tsMin);
  const fmt = (n) => String(Math.floor(n)).padStart(2, '0');
  const info = {
    enabled: true,
    cityName: cfg?.cityName ?? '',
    lng,
    tzOffsetMin,
    eotMin: eqOfTime(date),
    bjTime: `${fmt(date.getHours())}:${fmt(date.getMinutes())}`,
    trueSolarTime: `${fmt(tsNorm / 60)}:${fmt(tsNorm % 60)}`,
    trueSolarShichen: shichenName(tsMin),
    localDate: `${local.y}-${fmt(local.m)}-${fmt(local.d)}`,
    dayGZ,
    hourGZ,
    refDayGZ,
  };

  return {
    lunar: {
      ...lunar,
      ganzhiDay: dayGZ,
      ganzhiHour: hourGZ,
      xunkong,
    },
    info,
  };
}
