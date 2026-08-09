/**
 * 真太阳时校准设置（六爻工作台 - 新增）
 *
 * 持久化到现有设置存储（IndexedDB settings 表，settingsRepo），两个键：
 *   trueSolarEnabled : boolean  开关（默认关闭）
 *   trueSolarConfig  : object|null  起卦城市/手动经度配置
 *     { source:'city'|'manual', country?, city?, lng, timezoneOffsetMin, label }
 *
 * 旧卦例不追溯：盘面快照（panSnapshot）在保存时固化，本设置只影响新起卦时
 * paipan 传入的 trueSolar 参数；历史快照不重算。
 */
import { getSetting, setSetting } from './settingsRepo.js';
import { findCity, cityLabel } from '../data/cities.js';

export const TRUE_SOLAR_ENABLED_KEY = 'trueSolarEnabled';
export const TRUE_SOLAR_CONFIG_KEY = 'trueSolarConfig';

/** 时区偏移合法范围（分钟）：UTC-14 ~ UTC+16 */
const TZ_MIN_MIN = -840;
const TZ_MIN_MAX = 960;

/**
 * 校验真太阳时配置对象（IndexedDB 存 JSON，需防御脏数据/旧版本结构）
 * @param {unknown} cfg
 * @returns {boolean}
 */
export function isValidTrueSolarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const lng = cfg.lng;
  const tz = cfg.timezoneOffsetMin;
  return (
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    typeof tz === 'number' &&
    Number.isFinite(tz) &&
    tz >= TZ_MIN_MIN &&
    tz <= TZ_MIN_MAX &&
    (cfg.source === 'city' || cfg.source === 'manual') &&
    (typeof cfg.label === 'string' ? cfg.label !== '' : true)
  );
}

/**
 * 读取真太阳时设置（默认关闭；配置缺失/非法返回 null）
 * @returns {Promise<{enabled:boolean, config:object|null}>}
 */
export async function loadTrueSolarSettings() {
  try {
    const enabled = !!(await getSetting(TRUE_SOLAR_ENABLED_KEY));
    const raw = await getSetting(TRUE_SOLAR_CONFIG_KEY);
    return { enabled, config: isValidTrueSolarConfig(raw) ? raw : null };
  } catch (_) {
    // 读取失败按默认（关闭、无配置）处理，不阻断起卦
    return { enabled: false, config: null };
  }
}

/**
 * 仅保存开关状态（trueSolarEnabled 键），不触碰配置键（trueSolarConfig）。
 * 供开关切换场景使用：挂载读取为异步，用户在读取完成前切换开关时，内存中尚无配置；
 * 若整份写库会把库中已有配置误清为 null。只写开关键可保证「切换开关不碰配置」，
 * 也不引入读写竞态。config 键始终由选城市/手动经度/清除等操作独占维护。
 * @param {boolean} enabled
 * @returns {Promise<boolean>} 规范化后的开关值
 */
export async function saveTrueSolarEnabled(enabled) {
  const en = !!enabled;
  await setSetting(TRUE_SOLAR_ENABLED_KEY, en);
  return en;
}

/**
 * 保存真太阳时设置（开关状态 + 配置对象，非法配置按 null 落库）
 * @param {{enabled:boolean, config:object|null}} params
 * @returns {Promise<{enabled:boolean, config:object|null}>} 规范化后的实际保存值
 */
export async function saveTrueSolarSettings({ enabled, config }) {
  const en = !!enabled;
  const cfg = isValidTrueSolarConfig(config) ? config : null;
  await setSetting(TRUE_SOLAR_ENABLED_KEY, en);
  await setSetting(TRUE_SOLAR_CONFIG_KEY, cfg);
  return { enabled: en, config: cfg };
}

/**
 * 由城市条目生成配置对象（国家 + 城市，经度/时区取城市表）
 * @param {string} country 国家名（如 '中国'）
 * @param {string} city 城市名（如 '北京'）
 * @returns {object|null} 配置对象；城市表查无返回 null
 */
export function configFromCity(country, city) {
  const c = findCity(country, city);
  if (!c) return null;
  return {
    source: 'city',
    country: c.country,
    city: c.city,
    lng: c.lng,
    timezoneOffsetMin: c.timezoneOffsetMin,
    label: cityLabel(c),
  };
}

/**
 * 由手动输入生成配置对象
 * @param {number} lng 经度（东经正、西经负，-180 ~ 180）
 * @param {number} tzOffsetMin 时区偏移分钟（UTC-14 ~ UTC+16）
 * @returns {object|null} 配置对象；非法输入返回 null
 */
export function configFromManual(lng, tzOffsetMin) {
  if (
    !Number.isFinite(lng) || lng < -180 || lng > 180 ||
    !Number.isFinite(tzOffsetMin) || tzOffsetMin < TZ_MIN_MIN || tzOffsetMin > TZ_MIN_MAX
  ) {
    return null;
  }
  const ew = lng >= 0 ? '东经' : '西经';
  const tzH = tzOffsetMin / 60;
  return {
    source: 'manual',
    lng,
    timezoneOffsetMin: Math.round(tzOffsetMin),
    label: `手动：${ew}${Math.abs(lng).toFixed(1)}° UTC${tzH >= 0 ? '+' : ''}${tzH}`,
  };
}

/**
 * 规范化真太阳时 paipan 参数（null = 不启用）
 * @param {{enabled:boolean, config:object|null}} s loadTrueSolarSettings 结果
 * @returns {{lng:number, tzOffsetMin:number, cityName:string}|null}
 */
export function trueSolarParam(s) {
  if (!s?.enabled || !isValidTrueSolarConfig(s.config)) return null;
  return {
    lng: s.config.lng,
    tzOffsetMin: s.config.timezoneOffsetMin,
    cityName: s.config.label ?? '',
  };
}
