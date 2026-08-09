/**
 * 真太阳时校准 - 内置城市表（六爻工作台 - 新增）
 *
 * 结构：CITY_GROUPS = [{ country, cities: [{ city, lng, timezoneOffsetMin }] }]
 *   - lng 经度：东经为正、西经为负（真实城市坐标）
 *   - timezoneOffsetMin 时区偏移（分钟）：北京 +480、纽约 -300 … 均为标准时区固定偏移
 *
 * 注意：本表使用固定标准时区偏移，**不含夏令时动态切换**（如纽约标准 -300、
 * 夏令时 -240）。如需精确夏令时请自行切换，本实现以固定偏移为基准（用户拍板简化方案）。
 *
 * 分组：中国(32) / 美国(7) / 加拿大(4) / 英国(1) / 法国(1) / 德国(1) / 日本(2) /
 * 韩国(1) / 新加坡(1) / 澳大利亚(3) / 新西兰(1) / 其他(40)，共 94 城。
 */

/** 城市分组表（国家 → 城市列表） */
export const CITY_GROUPS = [
  {
    country: '中国',
    cities: [
      { city: '北京', lng: 116.407, timezoneOffsetMin: 480 },
      { city: '上海', lng: 121.474, timezoneOffsetMin: 480 },
      { city: '广州', lng: 113.264, timezoneOffsetMin: 480 },
      { city: '深圳', lng: 114.058, timezoneOffsetMin: 480 },
      { city: '成都', lng: 104.067, timezoneOffsetMin: 480 },
      { city: '重庆', lng: 106.551, timezoneOffsetMin: 480 },
      { city: '杭州', lng: 120.155, timezoneOffsetMin: 480 },
      { city: '武汉', lng: 114.306, timezoneOffsetMin: 480 },
      { city: '西安', lng: 108.94, timezoneOffsetMin: 480 },
      { city: '南京', lng: 118.796, timezoneOffsetMin: 480 },
      { city: '天津', lng: 117.201, timezoneOffsetMin: 480 },
      { city: '苏州', lng: 120.585, timezoneOffsetMin: 480 },
      { city: '郑州', lng: 113.625, timezoneOffsetMin: 480 },
      { city: '长沙', lng: 112.939, timezoneOffsetMin: 480 },
      { city: '沈阳', lng: 123.432, timezoneOffsetMin: 480 },
      { city: '青岛', lng: 120.383, timezoneOffsetMin: 480 },
      { city: '大连', lng: 121.615, timezoneOffsetMin: 480 },
      { city: '厦门', lng: 118.089, timezoneOffsetMin: 480 },
      { city: '福州', lng: 119.296, timezoneOffsetMin: 480 },
      { city: '昆明', lng: 102.833, timezoneOffsetMin: 480 },
      { city: '贵阳', lng: 106.63, timezoneOffsetMin: 480 },
      { city: '南宁', lng: 108.366, timezoneOffsetMin: 480 },
      { city: '哈尔滨', lng: 126.535, timezoneOffsetMin: 480 },
      { city: '长春', lng: 125.324, timezoneOffsetMin: 480 },
      { city: '济南', lng: 117.12, timezoneOffsetMin: 480 },
      { city: '兰州', lng: 103.834, timezoneOffsetMin: 480 },
      { city: '西宁', lng: 101.778, timezoneOffsetMin: 480 },
      { city: '银川', lng: 106.231, timezoneOffsetMin: 480 },
      { city: '乌鲁木齐', lng: 87.617, timezoneOffsetMin: 480 },
      { city: '拉萨', lng: 91.114, timezoneOffsetMin: 480 },
      { city: '呼和浩特', lng: 111.749, timezoneOffsetMin: 480 },
      { city: '海口', lng: 110.199, timezoneOffsetMin: 480 },
    ],
  },
  {
    country: '美国',
    cities: [
      { city: '纽约', lng: -74.006, timezoneOffsetMin: -300 },
      { city: '洛杉矶', lng: -118.244, timezoneOffsetMin: -480 },
      { city: '芝加哥', lng: -87.63, timezoneOffsetMin: -360 },
      { city: '旧金山', lng: -122.419, timezoneOffsetMin: -480 },
      { city: '西雅图', lng: -122.332, timezoneOffsetMin: -480 },
      { city: '休斯顿', lng: -95.37, timezoneOffsetMin: -360 },
      { city: '波士顿', lng: -71.059, timezoneOffsetMin: -300 },
    ],
  },
  {
    country: '加拿大',
    cities: [
      { city: '多伦多', lng: -79.383, timezoneOffsetMin: -300 },
      { city: '温哥华', lng: -123.121, timezoneOffsetMin: -480 },
      { city: '蒙特利尔', lng: -73.567, timezoneOffsetMin: -300 },
      { city: '渥太华', lng: -75.697, timezoneOffsetMin: -300 },
    ],
  },
  {
    country: '英国',
    cities: [
      { city: '伦敦', lng: -0.128, timezoneOffsetMin: 0 },
    ],
  },
  {
    country: '法国',
    cities: [
      { city: '巴黎', lng: 2.352, timezoneOffsetMin: 60 },
    ],
  },
  {
    country: '德国',
    cities: [
      { city: '柏林', lng: 13.405, timezoneOffsetMin: 60 },
    ],
  },
  {
    country: '日本',
    cities: [
      { city: '东京', lng: 139.692, timezoneOffsetMin: 540 },
      { city: '大阪', lng: 135.502, timezoneOffsetMin: 540 },
    ],
  },
  {
    country: '韩国',
    cities: [
      { city: '首尔', lng: 126.978, timezoneOffsetMin: 540 },
    ],
  },
  {
    country: '新加坡',
    cities: [
      { city: '新加坡', lng: 103.82, timezoneOffsetMin: 480 },
    ],
  },
  {
    country: '澳大利亚',
    cities: [
      { city: '悉尼', lng: 151.209, timezoneOffsetMin: 600 },
      { city: '墨尔本', lng: 144.963, timezoneOffsetMin: 600 },
      { city: '布里斯班', lng: 153.028, timezoneOffsetMin: 600 },
    ],
  },
  {
    country: '新西兰',
    cities: [
      { city: '奥克兰', lng: 174.763, timezoneOffsetMin: 720 },
    ],
  },
  {
    country: '其他',
    cities: [
      { city: '马德里', lng: -3.703, timezoneOffsetMin: 60 },
      { city: '罗马', lng: 12.496, timezoneOffsetMin: 60 },
      { city: '阿姆斯特丹', lng: 4.904, timezoneOffsetMin: 60 },
      { city: '布鲁塞尔', lng: 4.351, timezoneOffsetMin: 60 },
      { city: '维也纳', lng: 16.373, timezoneOffsetMin: 60 },
      { city: '苏黎世', lng: 8.542, timezoneOffsetMin: 60 },
      { city: '哥本哈根', lng: 12.568, timezoneOffsetMin: 60 },
      { city: '斯德哥尔摩', lng: 18.068, timezoneOffsetMin: 60 },
      { city: '莫斯科', lng: 37.618, timezoneOffsetMin: 180 },
      { city: '华沙', lng: 21.012, timezoneOffsetMin: 60 },
      { city: '布拉格', lng: 14.438, timezoneOffsetMin: 60 },
      { city: '雅典', lng: 23.728, timezoneOffsetMin: 120 },
      { city: '伊斯坦布尔', lng: 28.978, timezoneOffsetMin: 180 },
      { city: '曼谷', lng: 100.501, timezoneOffsetMin: 420 },
      { city: '吉隆坡', lng: 101.687, timezoneOffsetMin: 480 },
      { city: '雅加达', lng: 106.846, timezoneOffsetMin: 420 },
      { city: '马尼拉', lng: 120.984, timezoneOffsetMin: 480 },
      { city: '河内', lng: 105.834, timezoneOffsetMin: 420 },
      { city: '新德里', lng: 77.21, timezoneOffsetMin: 330 },
      { city: '孟买', lng: 72.878, timezoneOffsetMin: 330 },
      { city: '圣保罗', lng: -46.633, timezoneOffsetMin: -180 },
      { city: '布宜诺斯艾利斯', lng: -58.382, timezoneOffsetMin: -180 },
      { city: '开罗', lng: 31.236, timezoneOffsetMin: 120 },
      { city: '开普敦', lng: 18.424, timezoneOffsetMin: 120 },
      { city: '约翰内斯堡', lng: 28.047, timezoneOffsetMin: 120 },
      { city: '内罗毕', lng: 36.822, timezoneOffsetMin: 180 },
      { city: '迪拜', lng: 55.271, timezoneOffsetMin: 240 },
      { city: '利雅得', lng: 46.675, timezoneOffsetMin: 180 },
      { city: '特拉维夫', lng: 34.782, timezoneOffsetMin: 120 },
      { city: '德黑兰', lng: 51.389, timezoneOffsetMin: 210 },
      { city: '里斯本', lng: -9.14, timezoneOffsetMin: 0 },
      { city: '都柏林', lng: -6.26, timezoneOffsetMin: 0 },
      { city: '赫尔辛基', lng: 24.938, timezoneOffsetMin: 120 },
      { city: '奥斯陆', lng: 10.752, timezoneOffsetMin: 60 },
      { city: '布达佩斯', lng: 19.04, timezoneOffsetMin: 60 },
      { city: '布加勒斯特', lng: 26.102, timezoneOffsetMin: 120 },
      { city: '基辅', lng: 30.524, timezoneOffsetMin: 120 },
      { city: '贝尔格莱德', lng: 20.449, timezoneOffsetMin: 60 },
      { city: '慕尼黑', lng: 11.575, timezoneOffsetMin: 60 },
      { city: '汉堡', lng: 9.993, timezoneOffsetMin: 60 },
    ],
  },
];

/** 扁平化城市列表：[{country, city, lng, timezoneOffsetMin}] */
export const CITIES = CITY_GROUPS.flatMap((g) =>
  g.cities.map((c) => ({ country: g.country, city: c.city, lng: c.lng, timezoneOffsetMin: c.timezoneOffsetMin })),
);

/** 国家列表（下拉用） */
export const COUNTRY_NAMES = CITY_GROUPS.map((g) => g.country);

/**
 * 按国家取城市列表
 * @param {string} country 国家名（如 '中国'）
 * @returns {Array<{city:string, lng:number, timezoneOffsetMin:number}>}
 */
export function citiesOf(country) {
  return CITY_GROUPS.find((g) => g.country === country)?.cities ?? [];
}

/**
 * 查找城市条目
 * @param {string} country 国家名
 * @param {string} city 城市名
 * @returns {{country:string, city:string, lng:number, timezoneOffsetMin:number}|undefined}
 */
export function findCity(country, city) {
  return CITIES.find((c) => c.country === country && c.city === city);
}

/**
 * 生成展示标签：如「中国·北京（东经116.4° UTC+8）」
 * @param {{lng:number, timezoneOffsetMin:number, label?:string}} cfg
 * @returns {string}
 */
export function cityLabel(cfg) {
  if (!cfg) return '';
  if (cfg.label) return cfg.label;
  const ew = cfg.lng >= 0 ? '东经' : '西经';
  const lngAbs = Math.abs(cfg.lng).toFixed(1);
  const tz = cfg.timezoneOffsetMin / 60;
  const tzStr = `${tz >= 0 ? '+' : ''}${tz}`;
  return `${cfg.country ? `${cfg.country}·` : ''}${cfg.city ?? ''}（${ew}${lngAbs}° UTC${tzStr}）`;
}
