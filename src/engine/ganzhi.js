/**
 * 干支历法模块（六爻工作台 - 排盘引擎依赖之二）
 *
 * 纯函数模块，无 DOM 依赖。接口：
 *   toLunar(date) -> { year, month, day, isLeap, ganzhiYear, ganzhiMonth,
 *                      ganzhiDay, ganzhiHour, xunkong:[地支,地支], yuejian }
 *   fromLunar(y, m, d, isLeap) -> { year, month, day }（农历 -> 公历，toLunar 逆运算）
 *   jieMs(y, i) -> number（第 i 个节令交节时刻，UTC 毫秒；i: 0=小寒 1=立春 … 11=大雪）
 *   GAN / ZHI / WUXING_GAN / WUXING_ZHI
 *
 * 算法说明：
 * - 农历：lunarInfo 表（1900-2100）查闰月与每月大小（见 ../data/lunarData.js）
 * - 日干支：锚点法，2000-01-07 为甲子日，按日历日差 mod 60 推算
 * - 年干支：以立春为岁首——当年立春（交节时刻）前用上年干支，立春起用新年干支
 * - 月干支：以节气（十二节令）定月支（立春→寅月 … 小寒→丑月），
 *           月干按五虎遁（年干定寅月干，顺推），月干基于换年后的年干
 * - 时干支：五鼠遁（甲己还加甲），23-1 点子时，子时天干由日干决定
 * - 日界：每日 23:00（子时）起进入次日——日建、旬空、时柱子时天干均用次日干支，
 *          农历日期与节气月/年判断仍按实际时刻（23:00 换日不影响月建/年建）
 * - 旬空：日干支所在旬（甲子/甲戌/甲申/甲午/甲辰/甲寅旬）末尾两个空亡地支，
 *          跟随换日后的日干支
 * - 月建：节气月支（与月干支的月支一致），如立春后惊蛰前 = 寅月
 *
 * 节气算法（见 JIE_TERMS / sunApparentLongitude / jieMs）：
 * - 内置十二节令（小寒/立春/惊蛰/清明/立夏/芒种/小暑/立秋/白露/寒露/立冬/大雪）
 *   对应的太阳黄经（立春 315° … 小寒 285°），交节时刻 = 太阳到达该黄经的瞬间
 * - 太阳视黄经用 VSOP87D 截断级数（L0 64 / L1 34 / L2 20 / L3 7 / L4 3 / L5 1 项，
 *   等价于 Meeus《Astronomical Algorithms》表 25.B）+ 光行差 + 章动 Δψ（IAU1980
 *   主项），精度约 0.001°（≈秒级）；并以 -1.60″ 常数与紫金山天文台《中国天文年历》
 *   官方口径对齐（官方采用完整 VSOP87/DE + IAU2000B 章动，与截断实现存在系统差）
 * - 交节时刻在 TT（JDE）尺度用牛顿迭代 + 二分精化求解（收敛 <1 毫秒），
 *   再按 ΔT（Espenak-Meeus 2006 + 2016-2050 USNO/DE440s 拟合表）换算为 UTC，
 *   输出北京时间（东八区，UTC+8）即与便民查询网 bmcx / 紫金山官方时刻一致
 * - 覆盖范围 1900-2100（与 lunarInfo 同范围，顺带覆盖 2101 年初的小寒），
 *   实测 2022-2031 立春及 2026 二十四节气与官方时刻误差 <20 秒
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

const DAY_MS = 86400000;
/** Unix 纪元（1970-01-01）对应的儒略日 */
const JD_UNIX_EPOCH = 2440587.5;

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

/* ============================ 节气（十二节令） ============================ */

/**
 * 十二节令配置（月建分界）：下标 0-11 依次为 小寒→大雪。
 *   lon    ：太阳视黄经（度），交节时刻 = 太阳到达该黄经的瞬间
 *   monthNum：该节起算的月建序号（寅月=1 … 丑月=12，五虎遁顺推用）
 *   zhiIdx ：月建地支在 ZHI 中的下标（寅=2 … 丑=1）
 */
const JIE_TERMS = [
  { lon: 285, monthNum: 12, zhiIdx: 1, name: '小寒' }, // 小寒→立春 = 丑月
  { lon: 315, monthNum: 1, zhiIdx: 2, name: '立春' },  // 立春→惊蛰 = 寅月
  { lon: 345, monthNum: 2, zhiIdx: 3, name: '惊蛰' },  // 惊蛰→清明 = 卯月
  { lon: 15, monthNum: 3, zhiIdx: 4, name: '清明' },   // 清明→立夏 = 辰月
  { lon: 45, monthNum: 4, zhiIdx: 5, name: '立夏' },   // 立夏→芒种 = 巳月
  { lon: 75, monthNum: 5, zhiIdx: 6, name: '芒种' },   // 芒种→小暑 = 午月
  { lon: 105, monthNum: 6, zhiIdx: 7, name: '小暑' },  // 小暑→立秋 = 未月
  { lon: 135, monthNum: 7, zhiIdx: 8, name: '立秋' },  // 立秋→白露 = 申月
  { lon: 165, monthNum: 8, zhiIdx: 9, name: '白露' },  // 白露→寒露 = 酉月
  { lon: 195, monthNum: 9, zhiIdx: 10, name: '寒露' }, // 寒露→立冬 = 戌月
  { lon: 225, monthNum: 10, zhiIdx: 11, name: '立冬' }, // 立冬→大雪 = 亥月
  { lon: 255, monthNum: 11, zhiIdx: 0, name: '大雪' }, // 大雪→次年小寒 = 子月
];

/**
 * sTermInfo 经典线性近似表（24 节气，下标 0=小寒、2=立春、4=惊蛰 … 23=冬至），
 * 单位：相对 1900-01-06 02:05(UTC) 的分钟偏移。仅用作交节时刻求解的线性初值，
 * 其本身精度仅到「日」级（百年内漂移可达约半天），真正的交节时刻由
 * sunApparentLongitude 天文公式牛顿迭代 + 二分精化求出。
 */
const S_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072,
  240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795,
  462224, 483532, 504758,
];
/** 1900 年小寒（S_TERM_INFO[0]=0）的线性初值基准时刻 */
const S_TERM_BASE_MS = Date.UTC(1900, 0, 6, 2, 5);

/** 角度归一化到 [0, 360) */
function norm360(x) {
  return ((x % 360) + 360) % 360;
}

/* ------------------- 高精度太阳视黄经（VSOP87D 截断级数） ------------------- */

/**
 * VSOP87D 地球黄经周期项（截断版，等价于 Meeus《Astronomical Algorithms》表 25.B）：
 *   L0 64 项 / L1 34 项 / L2 20 项 / L3 7 项 / L4 3 项 / L5 1 项。
 * 每项 [A, B, C]，贡献 A·cos(B + C·τ)，τ = 自 J2000.0 起的儒略千年数（TDB）。
 * 数据取自 IMCCE 官方 VSOP87D.ear（地球黄经 559/341/142/22/11/5 项中按振幅降序取前 N 项），
 * 截断误差 < 0.2″，1900-2100 内视黄经精度约 0.001°（秒级）。
 */
const VSOP_L0 = [
  [1.75347045673, 0, 0],
  [0.03341656456, 4.66925680417, 6283.0758499914],
  [0.00034894275, 4.62610241759, 12566.1516999828],
  [0.00003497056, 2.74411800971, 5753.3848848968],
  [0.00003417571, 2.82886579606, 3.523118349],
  [0.00003135896, 3.62767041758, 77713.7714681205],
  [0.00002676218, 4.41808351397, 7860.4193924392],
  [0.00002342687, 6.13516237631, 3930.2096962196],
  [0.00001324292, 0.74246356352, 11506.7697697936],
  [0.00001273166, 2.03709655772, 529.6909650946],
  [0.00001199167, 1.10962944315, 1577.3435424478],
  [0.0000099025, 5.23268129594, 5884.9268465832],
  [0.00000857223, 3.50849156957, 398.1490034082],
  [0.00000779786, 1.17882652114, 5223.6939198022],
  [0.00000753141, 2.53339053818, 5507.5532386674],
  [0.00000505264, 4.58292563052, 18849.2275499742],
  [0.00000492379, 4.20506639861, 775.522611324],
  [0.00000317087, 5.84901952218, 11790.6290886588],
  [0.00000284125, 1.89869034186, 796.2980068164],
  [0.00000271039, 0.31488607649, 10977.078804699],
  [0.0000024281, 0.34481140906, 5486.777843175],
  [0.0000020616, 4.80646606059, 2544.3144198834],
  [0.00000205385, 1.86947813692, 5573.1428014331],
  [0.00000202261, 2.45767795458, 6069.7767545534],
  [0.00000155516, 0.83306073807, 213.299095438],
  [0.00000132212, 3.41118275555, 2942.4634232916],
  [0.00000126184, 1.0830263021, 20.7753954924],
  [0.00000102851, 0.63599846727, 4694.0029547076],
  [0.00000101895, 0.97569221824, 15720.8387848784],
  [0.00000101724, 4.26679821365, 7.1135470008],
  [9.9206e-7, 6.20992940258, 2146.1654164752],
  [8.5803e-7, 5.98322631256, 161000.6857376741],
  [8.5128e-7, 1.29870743025, 6275.9623029906],
  [8.4711e-7, 3.67080093025, 71430.69561812909],
  [7.9637e-7, 1.807913307, 17260.1546546904],
  [7.8756e-7, 3.03698313141, 12036.4607348882],
  [7.4651e-7, 1.75508916159, 5088.6288397668],
  [7.3874e-7, 3.50319443167, 3154.6870848956],
  [7.3547e-7, 4.67926565481, 801.8209311238],
  [6.9627e-7, 0.83297596966, 9437.762934887],
  [6.2449e-7, 3.97763880587, 8827.3902698748],
  [6.1148e-7, 1.81839811024, 7084.8967811152],
  [5.6963e-7, 2.78430398043, 6286.5989683404],
  [5.6116e-7, 4.38694880779, 14143.4952424306],
  [5.5577e-7, 3.47006009062, 6279.5527316424],
  [5.1992e-7, 0.18914945834, 12139.5535091068],
  [5.1605e-7, 1.33282746983, 1748.016413067],
  [5.1145e-7, 0.28306864501, 5856.4776591154],
  [4.9e-7, 0.48735065033, 1194.4470102246],
  [4.1036e-7, 5.36817351402, 8429.2412664666],
  [4.0938e-7, 2.39850881707, 19651.048481098],
  [3.92e-7, 6.16832995016, 10447.3878396044],
  [3.677e-7, 6.04133859347, 10213.285546211],
  [3.6596e-7, 2.56955238628, 1059.3819301892],
  [3.5954e-7, 1.70876111898, 2352.8661537718],
  [3.5566e-7, 1.77597314691, 6812.766815086],
  [3.3291e-7, 0.59309499459, 17789.845619785],
  [3.0412e-7, 0.44294464135, 83996.84731811189],
  [3.0047e-7, 2.73975123935, 1349.8674096588],
  [2.5352e-7, 3.16470953405, 4690.4798363586],
  [2.4738e-7, 0.21484762138, 3.5904286518],
  [2.3663e-7, 0.48473567763, 8031.0922630584],
  [2.3574e-7, 2.06527720049, 3340.6124266998],
  [2.282e-7, 5.22197888032, 4705.7323075436],
];

const VSOP_L1 = [
  [6283.31966747491, 0, 0],
  [0.00206058863, 2.67823455584, 6283.0758499914],
  [0.0000430343, 2.63512650414, 12566.1516999828],
  [0.00000425264, 1.59046980729, 3.523118349],
  [0.00000108977, 2.96618001993, 1577.3435424478],
  [9.3478e-7, 2.59212835365, 18849.2275499742],
  [7.2122e-7, 1.13846158196, 529.6909650946],
  [6.7768e-7, 1.87472304791, 398.1490034082],
  [6.7327e-7, 4.40918235168, 5507.5532386674],
  [5.9027e-7, 2.8879703846, 5223.6939198022],
  [4.5407e-7, 0.39803079805, 796.2980068164],
  [3.6369e-7, 0.46624739835, 775.522611324],
  [2.8958e-7, 2.64707383882, 7.1135470008],
  [1.9097e-7, 1.84628332577, 5486.777843175],
  [1.8508e-7, 4.96855124577, 213.299095438],
  [1.7293e-7, 2.99116864949, 6275.9623029906],
  [1.6233e-7, 0.03216483047, 2544.3144198834],
  [1.5832e-7, 1.43049285325, 2146.1654164752],
  [1.4615e-7, 1.20532366323, 10977.078804699],
  [1.2461e-7, 2.83432285512, 1748.016413067],
  [1.1877e-7, 3.25804815607, 5088.6288397668],
  [1.1808e-7, 5.2737979048, 1194.4470102246],
  [1.1514e-7, 2.07502418155, 4694.0029547076],
  [9.969e-8, 1.30262991097, 6286.5989683404],
  [9.721e-8, 4.23925472239, 1349.8674096588],
  [7.576e-8, 5.30062664886, 2352.8661537718],
  [6.385e-8, 2.65033984967, 9437.762934887],
  [6.101e-8, 4.66632584188, 4690.4798363586],
  [5.834e-8, 1.76649917904, 1059.3819301892],
  [5.305e-8, 0.90857521574, 3154.6870848956],
  [5.223e-8, 5.66135767624, 71430.69561812909],
  [5.198e-8, 1.85353197345, 801.8209311238],
  [4.33e-8, 0.24102555403, 6812.766815086],
  [4.259e-8, 0.77355900599, 10447.3878396044],
];

const VSOP_L2 = [
  [0.0005291887, 0, 0],
  [0.00008719837, 1.07209665242, 6283.0758499914],
  [0.00000309125, 0.86728818832, 12566.1516999828],
  [2.7339e-7, 0.05297871691, 3.523118349],
  [9.541e-8, 0.75742297675, 18849.2275499742],
  [8.937e-8, 2.05705419118, 77713.7714681205],
  [6.952e-8, 0.8267330541, 775.522611324],
  [5.064e-8, 4.66284525271, 1577.3435424478],
  [4.061e-8, 1.03057162962, 7.1135470008],
  [3.81e-8, 3.4405080349, 5573.1428014331],
  [3.463e-8, 5.14074632811, 796.2980068164],
  [3.169e-8, 6.05291851171, 5507.5532386674],
  [2.886e-8, 6.11652627155, 529.6909650946],
  [2.714e-8, 0.30637881025, 398.1490034082],
  [2.371e-8, 4.38118838167, 5223.6939198022],
  [1.534e-8, 5.75900462759, 1349.8674096588],
  [1.449e-8, 4.3641591397, 1748.016413067],
  [1.341e-8, 3.72061130861, 1194.4470102246],
  [1.224e-8, 2.97328088405, 2146.1654164752],
  [1.103e-8, 1.27104454479, 161000.6857376741],
];

const VSOP_L3 = [
  [0.00000289226, 5.84384198723, 6283.0758499914],
  [3.4955e-7, 0, 0],
  [1.6819e-7, 5.48766912348, 12566.1516999828],
  [1.288e-8, 4.72200252235, 3.523118349],
  [7.14e-9, 5.30045809128, 18849.2275499742],
  [7.2e-10, 4.2976812618, 6286.5989683404],
  [2.4e-10, 5.16003960716, 25132.3033999656],
];

const VSOP_L4 = [
  [0.00000114084, 3.14159265359, 0],
  [7.717e-8, 4.13446589358, 6283.0758499914],
  [7.65e-9, 3.83803776214, 12566.1516999828],
];

const VSOP_L5 = [
  [8.78e-9, 3.14159265359, 0],
];

/** 各阶黄经周期项（下标 0-5 对应 τ^0..τ^5） */
const VSOP_SERIES = [VSOP_L0, VSOP_L1, VSOP_L2, VSOP_L3, VSOP_L4, VSOP_L5];

/**
 * 太阳几何黄经（弧度，0-2π）：地球日心黄经 + 180° = 太阳地心黄经，平春分点历元。
 * @param {number} jde 儒略日（TT/TDB 尺度）
 */
function sunGeometricLongitude(jde) {
  const tau = (jde - 2451545.0) / 365250; // 自 J2000.0 的儒略千年数
  let L = 0;
  let tauPow = 1;
  for (let i = 0; i < 6; i++) {
    let s = 0;
    const terms = VSOP_SERIES[i];
    for (let k = 0; k < terms.length; k++) {
      const t = terms[k];
      s += t[0] * Math.cos(t[1] + t[2] * tau);
    }
    L += s * tauPow;
    tauPow *= tau;
  }
  return L + Math.PI;
}

/**
 * 日地距离（AU），Meeus《Astronomical Algorithms》式 25.5（用于光行差）。
 */
function earthRadiusAU(jde) {
  const T = (jde - 2451545.0) / 36525;
  const M = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI) / 180;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C =
    ((1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
      (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
      0.000289 * Math.sin(3 * M)) * (Math.PI / 180);
  return (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(M + C));
}

/**
 * 章动（黄经章动 Δψ，角秒）：Meeus《Astronomical Algorithms》表 22.A 前 10 项（IAU1980 主项）。
 * 与完整 IAU1980（63 项）及 IAU2000B 相差 <0.1″，可忽略。
 */
function nutationPsi(jde) {
  const T = (jde - 2451545.0) / 36525;
  const D = (297.85036 + 445267.11148 * T - 0.0019142 * T * T + (T ** 3) / 189474) % 360;
  const M = (357.52772 + 35999.05034 * T - 0.0001603 * T * T - (T ** 3) / 300000) % 360;
  const Mp = (134.96298 + 477198.867398 * T + 0.0086972 * T * T + (T ** 3) / 56250) % 360;
  const F = (93.27191 + 483202.017538 * T - 0.0036825 * T * T + (T ** 3) / 327270) % 360;
  const Om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T ** 3) / 450000) % 360;
  // 每行 [D, M, M', F, Ω, a, aT]，Δψ += ((a + aT·T)/1e4)″ · sin(D·D+M·M+M'·M'+F·F+Ω·Ω)
  const rows = [
    [0, 0, 0, 0, 1, -171996, -174.2],
    [-2, 0, 0, 2, 2, -13187, -1.6],
    [0, 0, 0, 2, 2, -2274, -0.2],
    [0, 0, 0, 0, 2, 2062, 0.2],
    [0, 1, 0, 0, 0, 1426, -3.4],
    [0, 0, 1, 0, 0, 712, 0.1],
    [-2, 1, 0, 2, 2, -517, 1.2],
    [0, 0, 0, 2, 1, -386, -0.4],
    [0, 0, 1, 2, 2, -301, 0],
    [-2, -1, 0, 2, 2, 217, -0.5],
  ];
  let psi = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const arg = ((row[0] * D + row[1] * M + row[2] * Mp + row[3] * F + row[4] * Om) * Math.PI) / 180;
    psi += ((row[5] + row[6] * T) / 1e4) * Math.sin(arg);
  }
  return psi;
}

/**
 * 与紫金山天文台《中国天文年历》官方口径的系统对齐常数（角秒）。
 * 官方历表采用完整 VSOP87/DE + IAU2000B 章动 + 光行时，与本实现
 * （截断 VSOP87D + IAU1980 主项章动）存在约 1.6″（≈38 秒等效时间）系统差；
 * 按 2022-2031 立春 + 2026 二十四节气官方时刻（便民查询网 bmcx 同源）拟合取 1.60″，
 * 拟合后全部基准点误差 <19 秒。
 * 注意：该常数为针对现代（2020-2030 年代）官方口径的经验校准；离拟合区间较远的
 * 年份（如 1900 年代、2100 年代）系统差会随章动模型漂移而略有变化（约 ±1 分钟级），
 * 对月建/年建判定仅在交节瞬间前后一分钟内有影响，可忽略。
 */
const ALMANAC_ALIGN_ARCSEC = 1.6;

/**
 * 太阳视黄经（度，0-360）：几何黄经 + FK5 微修正 + 光行差 + 章动 Δψ - 官方对齐常数。
 * 精度约 0.001°（≈秒级），1900-2100 内与紫金山天文台官方口径一致（误差 <20 秒等效时间）。
 * @param {number} jde 儒略日（TT/TDB 尺度）
 */
function sunApparentLongitude(jde) {
  let L = sunGeometricLongitude(jde);
  L += (-0.09033 / 3600) * (Math.PI / 180); // FK5 微修正（黄经）
  L += ((-20.4898 / 3600) * (Math.PI / 180)) / earthRadiusAU(jde); // 光行差
  L += ((nutationPsi(jde) - ALMANAC_ALIGN_ARCSEC) / 3600) * (Math.PI / 180); // 章动 + 官方口径对齐
  return norm360((L * 180) / Math.PI);
}

/** 太阳视黄经与目标 λ 的差值（弧度，[-π, π)）；=0 表示到达目标黄经 */
function lonDiffRad(jde, targetDeg) {
  const d = (sunApparentLongitude(jde) * Math.PI) / 180 - (targetDeg * Math.PI) / 180;
  return (((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/** d(太阳几何黄经)/d(jd)，弧度/日（章动/光行差导数 <0.01%，可忽略） */
function dLonDt(jde) {
  const tau = (jde - 2451545.0) / 365250;
  let dL = 0;
  let tauPow = 1;
  for (let i = 0; i < 6; i++) {
    let s = 0;
    let sp = 0;
    const terms = VSOP_SERIES[i];
    for (let k = 0; k < terms.length; k++) {
      const t = terms[k];
      const arg = t[1] + t[2] * tau;
      s += t[0] * Math.cos(arg);
      sp += -t[0] * t[2] * Math.sin(arg);
    }
    if (i > 0) dL += i * tau ** (i - 1) * s;
    dL += tauPow * sp;
    tauPow *= tau;
  }
  return dL / 365250; // 弧度/日
}

/* ----------------------------- ΔT（TT-UT1） ----------------------------- */

/**
 * 2016-2050 年 ΔT 三次样条（USNO 实测 + Skyfield DE440s 预测拟合，寿星万年历同源常数）。
 * 每段 [起始年, a0, a1, a2, a3]，ΔT = a0 + a1·t + a2·t² + a3·t³，t = ((y-起始年)/4)*10。
 */
const SXWNL_DT = [
  [2016, 68.1024, 0.5456, -0.0542, -0.001172],
  [2020, 69.3612, 0.0422, -0.0502, 0.006216],
  [2024, 69.1752, -0.0335, -0.0048, 0.000811],
  [2028, 69.0206, -0.0275, 0.0055, -0.000014],
  [2032, 68.9981, 0.0163, 0.0054, 0.000006],
  [2036, 69.1498, 0.0599, 0.0053, 0.000026],
  [2040, 69.4751, 0.1035, 0.0051, 0.000046],
  [2044, 69.9737, 0.1469, 0.005, 0.000066],
  [2048, 70.6451, 0.1903, 0.0049, 0.000085],
];

/**
 * ΔT（TT-UT1，秒）。
 * - 2016-2050：SXWNL_DT 三次样条（现代观测/预测，2020 年代实测 ≈69.2s）；
 * - 2050 后：按 2048 段趋势线性外推；
 * - 1900-2016：Espenak & Meeus（2006）分段多项式（NASA eclipse 站点发布）。
 * @param {number} y 小数年
 */
function deltaTSeconds(y) {
  if (y >= 2016 && y < 2050) {
    for (let i = 0; i < SXWNL_DT.length - 1; i++) {
      const seg = SXWNL_DT[i];
      const next = SXWNL_DT[i + 1];
      if (y >= seg[0] && y < next[0]) {
        const t = ((y - seg[0]) / (next[0] - seg[0])) * 10;
        return seg[1] + seg[2] * t + seg[3] * t * t + seg[4] * t ** 3;
      }
    }
    return 71.0457;
  }
  if (y >= 2050) return 71.0457 + 0.55 * (y - 2050);
  let t;
  if (y >= 2005) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y >= 1986) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y >= 1961) { t = y - 1975; return 45.45 + 1.067 * t - (t * t) / 260 - (t ** 3) / 718; }
  if (y >= 1941) { t = y - 1950; return 29.07 + 0.407 * t - (t * t) / 233 + (t ** 3) / 2547; }
  if (y >= 1920) { t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t * t + 0.0020936 * t ** 3; }
  if (y >= 1900) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y >= 1860) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + (t ** 5) / 233174; }
  if (y >= 1800) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
  return -20 + 32 * ((y - 1820) / 100) ** 2;
}

/* --------------------------- 交节时刻求解 --------------------------- */

/** 线性初值：y 年 sTermInfo 下标 n 的近似交节时刻（ms since epoch, UTC） */
function linearTermMs(y, n) {
  return S_TERM_BASE_MS + S_TERM_INFO[n] * 60000 + 31556925974.7 * (y - 1900);
}

/**
 * 求解 y 年第 i 个节令（0-11，小寒→大雪）的交节时刻（ms since epoch, UTC）。
 * 以 sTermInfo 线性近似为初值（百年内偏差 <12 小时），先在 TT（JDE）尺度做
 * 牛顿迭代，再二分精化，收敛到 <1 毫秒；最后按 ΔT 换算回 UTC。
 * @param {number} y 公历年
 * @param {number} i 节令下标 0-11
 */
function solveJieMs(y, i) {
  const target = JIE_TERMS[i].lon;
  const estMs = linearTermMs(y, i * 2); // sTermInfo 下标 = 2*i（小寒0 立春2 惊蛰4 …）
  const jde0 = estMs / DAY_MS + JD_UNIX_EPOCH + deltaTSeconds(y + 0.15) / 86400; // UTC→TT 初值
  // 牛顿迭代（太阳黄经对时间单调递增，归一化残差后迭代稳定）
  let jde = jde0;
  let newtonOk = true;
  for (let k = 0; k < 8; k++) {
    const d = lonDiffRad(jde, target);
    if (Math.abs(d) < 1e-9) break;
    const step = d / dLonDt(jde);
    if (!Number.isFinite(step) || Math.abs(step) > 5) {
      newtonOk = false;
      break;
    }
    jde -= step;
  }
  // 二分精化：牛顿收敛则以牛顿结果为中心 ±0.5 天，否则回退到初值 ±2 天
  let lo = newtonOk ? jde - 0.5 : jde0 - 2;
  let hi = newtonOk ? jde + 0.5 : jde0 + 2;
  if (lonDiffRad(lo, target) > 0) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (lonDiffRad(mid, target) > 0) hi = mid;
    else lo = mid;
  }
  const jdeFinal = (lo + hi) / 2;
  // TT → UTC：UTC = TT - ΔT；小数年由 JDE 反推
  const dt = deltaTSeconds(2000 + (jdeFinal - 2451545.0) / 365.25);
  const jdUT = jdeFinal - dt / 86400;
  return Math.round((jdUT - JD_UNIX_EPOCH) * DAY_MS);
}

/** 交节时刻缓存（节气结果是确定性天文值，可安全复用） */
const jieCache = new Map();

/**
 * y 年第 i 个节令（0-11，小寒→大雪）的交节时刻（ms since epoch, UTC）。
 * 换算到北京时间（东八区）即 `new Date(ms + 8h)` 的年月日时分秒。
 * @param {number} y 公历年（1900-2101，2101 仅需小寒以覆盖 2100 年末子月）
 * @param {number} i 节令下标 0-11
 * @returns {number} 交节时刻 UTC 毫秒
 */
export function jieMs(y, i) {
  const key = `${y}-${i}`;
  let v = jieCache.get(key);
  if (v === undefined) {
    v = solveJieMs(y, i);
    jieCache.set(key, v);
  }
  return v;
}

/**
 * 公历 -> 农历 + 四柱干支 + 旬空 + 月建
 * @param {Date} date 公历日期（时区为本地时间；小时用于时干支与节气判断）
 * @returns {{year:number, month:number, day:number, isLeap:boolean,
 *   ganzhiYear:string, ganzhiMonth:string, ganzhiDay:string, ganzhiHour:string,
 *   xunkong:string[], yuejian:string}}
 */
export function toLunar(date) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const h = date.getHours();
  const ms = date.getTime();

  // ---- 农历年月日（lunarInfo 查表） ----
  const offset = toDays(gy, gm, gd) - ANCHOR_CNY;
  if (offset < 0) {
    throw new RangeError(`日期超出农历数据范围（最早 1900-01-31）：${gy}-${gm}-${gd}`);
  }
  let ly = 1900;
  let rest = offset;
  while (rest >= yearDays(ly)) {
    rest -= yearDays(ly);
    ly += 1;
  }
  if (ly > 2100) {
    // 2100 农历年（庚申年）止于 2101-01-27（腊月廿九），此后日期超出数据范围
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

  // ---- 年干支：立春为岁首（立春交节时刻前用上年干支） ----
  const lichunMs = jieMs(gy, 1); // 立春（JIE_TERMS 下标 1）
  const yearBase = ms >= lichunMs ? gy : gy - 1;
  const yearIdx = ((yearBase - 4) % 60 + 60) % 60;
  const ganzhiYear = GAN[yearIdx % 10] + ZHI[yearIdx % 12];

  // ---- 月干支：节气定月支 + 五虎遁定月干（基于换年后的年干） ----
  // 遍历当年 12 节（小寒→大雪）找最后一个 <= 当前时刻的节；若早于当年小寒，
  // 则上一节为上年大雪（子月）；若晚于当年大雪，则下一节为次年小寒（丑月）。
  let lastJieIdx = -1; // -1 = 早于当年小寒，属上年大雪→子月
  for (let i = 0; i < 12; i++) {
    if (jieMs(gy, i) <= ms) lastJieIdx = i;
    else break;
  }
  if (lastJieIdx === 11 && jieMs(gy + 1, 0) <= ms) lastJieIdx = 12; // 防御：越过次年小寒
  let monthNum;
  if (lastJieIdx === -1) monthNum = 11; // 早于当年小寒 → 上年大雪 = 子月
  else if (lastJieIdx === 0 || lastJieIdx === 12) monthNum = 12; // 小寒 → 丑月
  else monthNum = lastJieIdx; // 立春=1→寅月，惊蛰=2→卯月 … 大雪=11→子月
  const monthZhiIdx = (monthNum + 1) % 12; // 寅=2 … 丑=1
  const firstMonthGan = (yearIdx % 10) * 2 + 2; // 五虎遁：年干定寅月干（甲己丙作首 …）
  const monthGan = (firstMonthGan + monthNum - 1) % 10;
  const ganzhiMonth = GAN[monthGan] + ZHI[monthZhiIdx];

  // ---- 日干支：锚点 2000-01-07 甲子日，日历日差 mod 60；23:00 起换次日 ----
  const dayIdx = ((toDays(gy, gm, gd) - ANCHOR_JIAZI) % 60 + 60) % 60;
  const dayIdxForDay = dayIdx + (h >= 23 ? 1 : 0); // 晚子时（23:00 起）进入次日
  const ganzhiDay = GAN[dayIdxForDay % 10] + ZHI[dayIdxForDay % 12];

  // ---- 时干支：五鼠遁（23-1 点子时，子时干=(日干x2)%10；晚子时用换日后的日干） ----
  const shichen = Math.floor(((h + 1) % 24) / 2); // 23/0->子(0) ... 22->亥(11)
  const dayGanForHour = dayIdxForDay % 10; // 晚子时用次日日干（dayIdxForDay 已含 +1）
  const ziGan = (dayGanForHour * 2) % 10;
  const hourGan = (ziGan + shichen) % 10;
  const ganzhiHour = GAN[hourGan] + ZHI[shichen];

  // ---- 旬空：跟随换日后的日干支（每旬 10 天，旬末两个地支落空） ----
  const xunStart = dayIdxForDay - (dayIdxForDay % 10);
  const xunkong = [ZHI[(xunStart + 10) % 12], ZHI[(xunStart + 11) % 12]];

  // ---- 月建：节气月支（与月干支的月支一致） ----
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

/* ================== 日干支按日历日期/小时重算（真太阳时模块用） ================== */

/**
 * 日干支序号（0-59）：给定公历年月日 + 小时（23:00 换日规则），返回六十甲子日序号。
 * 与 toLunar 的日干支逻辑完全一致（锚点 2000-01-07 甲子日，h>=23 进入次日），
 * 供真太阳时模块计算参考日建（trueSolarDayRef）使用：城市本地日历日期 + 真太阳时小时（>=23 进入次日）。
 * @param {number} y 公历年
 * @param {number} m 公历月 1-12
 * @param {number} d 公历日
 * @param {number} hour 小时（0-23，>=23 时序号 +1 进入次日）
 * @returns {number} 0-59 的六十甲子日序号
 */
export function dayIndexAt(y, m, d, hour) {
  const idx = ((toDays(y, m, d) - ANCHOR_JIAZI) % 60 + 60) % 60;
  return (idx + (hour >= 23 ? 1 : 0)) % 60;
}

/**
 * 日干支：给定公历年月日 + 小时（23:00 换日规则），返回日干支字符串。
 * 与 toLunar 的日建口径一致（锚点法 + 晚子时换日），仅允许外部按不同日历日期重算。
 * @param {number} y 公历年
 * @param {number} m 公历月 1-12
 * @param {number} d 公历日
 * @param {number} hour 小时（0-23，>=23 时进入次日）
 * @returns {string} 日干支，如 '庚戌'
 */
export function ganzhiDayOf(y, m, d, hour) {
  const i = dayIndexAt(y, m, d, hour);
  return GAN[i % 10] + ZHI[i % 12];
}

/**
 * 农历 -> 公历年月日（toLunar 的逆运算，用于「农历起卦」时间输入）
 * @param {number} year 农历年（1900-2100）
 * @param {number} month 农历月 1-12
 * @param {number} day 农历日 1-30
 * @param {boolean} [isLeap] 是否闰月
 * @returns {{year:number, month:number, day:number}} 公历年月日
 */
export function fromLunar(year, month, day, isLeap = false) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new RangeError(`农历年超出数据范围（1900-2100）：${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`农历月须为 1-12：${month}`);
  }
  const lm = leapMonth(year);
  if (isLeap && lm !== month) {
    throw new RangeError(`农历 ${year} 年没有闰 ${month} 月`);
  }
  const maxDay = isLeap ? leapDays(year) : monthDays(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new RangeError(`农历 ${year} 年${isLeap ? '闰' : ''}${month} 月只有 ${maxDay} 天：${day}`);
  }
  let offset = 0;
  for (let y = 1900; y < year; y++) offset += yearDays(y);
  for (let m = 1; m < month; m++) {
    offset += monthDays(year, m);
    if (m === lm) offset += leapDays(year);
  }
  if (isLeap) offset += monthDays(year, month);
  offset += day - 1;
  const d = new Date((ANCHOR_CNY + offset) * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
