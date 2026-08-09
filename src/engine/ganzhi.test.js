import { describe, expect, test } from 'vitest';
import { toLunar, fromLunar, jieMs, GAN, ZHI, WUXING_GAN, WUXING_ZHI } from './ganzhi';

/**
 * 所有断言值均经过双重验证：
 * 1. 锚点法/五虎遁/五鼠遁独立推演（scripts/verify_lunar.py）
 * 2. 与 6tail/lunar-javascript（独立天文算法实现）交叉核对
 * 详见 task-3-report.md 及 scripts/verify_lunar.py
 */

describe('ganzhi 干支历法', () => {
  test('常量表：天干地支与五行', () => {
    expect(GAN).toEqual(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']);
    expect(ZHI).toEqual(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
    expect(WUXING_GAN.甲).toBe('木');
    expect(WUXING_GAN.丙).toBe('火');
    expect(WUXING_GAN.戊).toBe('土');
    expect(WUXING_GAN.庚).toBe('金');
    expect(WUXING_GAN.壬).toBe('水');
    expect(WUXING_ZHI.子).toBe('水');
    expect(WUXING_ZHI.寅).toBe('木');
    expect(WUXING_ZHI.巳).toBe('火');
    expect(WUXING_ZHI.申).toBe('金');
    expect(WUXING_ZHI.丑).toBe('土');
  });

  test('已知日期 2026-08-04 10:30：农历六月廿二 + 四柱全对', () => {
    const r = toLunar(new Date(2026, 7, 4, 10, 30));
    // 农历（数据表 + 6tail 双确认：2026-02-17 春节，8/4 为六月廿二）
    expect(r.year).toBe(2026);
    expect(r.month).toBe(6);
    expect(r.day).toBe(22);
    expect(r.isLeap).toBe(false);
    // 四柱（6tail 双确认：丙午年 / 乙未月 / 庚戌日 / 辛巳时）
    expect(r.ganzhiYear).toBe('丙午');
    expect(r.ganzhiMonth).toBe('乙未');
    expect(r.ganzhiDay).toBe('庚戌');
    expect(r.ganzhiHour).toBe('辛巳');
    // 旬空（庚戌日属甲辰旬，空亡寅卯，6tail 双确认）
    expect(r.xunkong).toEqual(['寅', '卯']);
    // 月建（农历六月=未）
    expect(r.yuejian).toBe('未');
  });

  test('2024-02-10 甲辰年春节：正月初一 甲辰日', () => {
    const r = toLunar(new Date(2024, 1, 10));
    expect(r.year).toBe(2024);
    expect(r.month).toBe(1);
    expect(r.day).toBe(1);
    expect(r.isLeap).toBe(false);
    expect(r.ganzhiYear).toBe('甲辰'); // (2024-4)%60=40 -> 甲辰
    expect(r.ganzhiMonth).toBe('丙寅'); // 甲己之年丙作首
    expect(r.ganzhiDay).toBe('甲辰'); // 6tail 双确认
    expect(r.xunkong).toEqual(['寅', '卯']); // 甲辰旬空亡寅卯
    expect(r.yuejian).toBe('寅');
  });

  test('2025-01-29 春节：正月初一 戊戌日（立春前，年干支仍为甲辰）', () => {
    const r = toLunar(new Date(2025, 0, 29));
    expect(r.year).toBe(2025);
    expect(r.month).toBe(1);
    expect(r.day).toBe(1);
    expect(r.ganzhiYear).toBe('甲辰'); // 立春(2025-02-03)前，用上年 2024 甲辰
    expect(r.ganzhiMonth).toBe('丁丑'); // 甲年五虎遁: 丙寅起, 丑月=丁丑
    expect(r.ganzhiDay).toBe('戊戌'); // 6tail 双确认
    expect(r.xunkong).toEqual(['辰', '巳']); // 戊戌日属甲午旬，空亡辰巳
    expect(r.yuejian).toBe('丑'); // 小寒→立春 = 丑月
  });

  test('锚点 2000-01-07 甲子日：农历己卯年腊月初一（立春前，仍属己卯年）', () => {
    const r = toLunar(new Date(2000, 0, 7));
    expect(r.year).toBe(1999);
    expect(r.month).toBe(12);
    expect(r.day).toBe(1);
    expect(r.isLeap).toBe(false);
    expect(r.ganzhiYear).toBe('己卯'); // 立春(2000-02-04)前，用上年 1999 己卯
    expect(r.ganzhiMonth).toBe('丁丑'); // 己年五虎遁: 丙寅起, 丑月=丁丑
    expect(r.ganzhiDay).toBe('甲子'); // 锚点日
    expect(r.xunkong).toEqual(['戌', '亥']); // 甲子旬空亡戌亥
    expect(r.yuejian).toBe('丑'); // 小寒→立春 = 丑月
  });

  test('闰月：2023-03-22 为癸卯年闰二月初一', () => {
    const r = toLunar(new Date(2023, 2, 22));
    expect(r.year).toBe(2023);
    expect(r.month).toBe(2);
    expect(r.day).toBe(1);
    expect(r.isLeap).toBe(true);
    expect(r.ganzhiYear).toBe('癸卯');
    expect(r.ganzhiDay).toBe('己卯'); // 6tail 双确认
    expect(r.ganzhiMonth).toBe('乙卯'); // 闰月沿用二月干支（戊癸甲寅首）
    expect(r.xunkong).toEqual(['申', '酉']); // 己卯日属甲戌旬，空亡申酉
    expect(r.yuejian).toBe('卯');
  });

  test('历史确证：1949-10-01 开国大典为甲子日', () => {
    const r = toLunar(new Date(1949, 9, 1));
    expect(r.ganzhiDay).toBe('甲子');
    expect(r.year).toBe(1949);
    expect(r.month).toBe(8);
    expect(r.day).toBe(10);
    expect(r.isLeap).toBe(false);
  });

  test('时柱：五鼠遁 + 晚子时换日（23:00 起日建/时柱同步用次日）', () => {
    // 庚戌日（乙庚丙作初）：0-22 点子时起丙子
    expect(toLunar(new Date(2026, 7, 4, 0, 30)).ganzhiHour).toBe('丙子');
    expect(toLunar(new Date(2026, 7, 4, 1, 30)).ganzhiHour).toBe('丁丑'); // 丑时
    expect(toLunar(new Date(2026, 7, 4, 10, 30)).ganzhiHour).toBe('辛巳'); // 巳时
    expect(toLunar(new Date(2026, 7, 4, 12, 30)).ganzhiHour).toBe('壬午'); // 午时
    expect(toLunar(new Date(2026, 7, 4, 21, 30)).ganzhiHour).toBe('丁亥'); // 亥时(21-23)
    expect(toLunar(new Date(2026, 7, 4, 22, 30)).ganzhiHour).toBe('丁亥'); // 亥时(22-23)
    // 23:00 后换日：日建改为次日辛亥（不再显示当日庚戌），时柱子时用辛亥日干
    const late = toLunar(new Date(2026, 7, 4, 23, 30));
    expect(late.ganzhiDay).toBe('辛亥'); // 晚子时进入次日
    expect(late.ganzhiHour).toBe('戊子'); // 丙辛戊子起 → 戊子
  });

  test('晚子时换日边界：23:00 起日建用次日（2026-08-06 22:59 壬子 / 23:00 癸丑）', () => {
    const before = toLunar(new Date(2026, 7, 6, 22, 59));
    const after = toLunar(new Date(2026, 7, 6, 23, 0));
    const after2 = toLunar(new Date(2026, 7, 6, 23, 30));
    expect(before.ganzhiDay).toBe('壬子');
    expect(after.ganzhiDay).toBe('癸丑');
    expect(after2.ganzhiDay).toBe('癸丑');
    // 农历日期不换（23:00 后公历仍为 8/6，农历仍为当日）
    expect(after.year).toBe(before.year);
    expect(after.month).toBe(before.month);
    expect(after.day).toBe(before.day);
    expect(after.isLeap).toBe(before.isLeap);
    // 时柱用换日后的日干（癸日 戊癸壬子起 → 壬子时）
    expect(after2.ganzhiHour).toBe('壬子');
    // 月建/年建不受换日影响（仍按实际时刻定节气月/年）
    expect(after.yuejian).toBe('未');
    expect(after.ganzhiYear).toBe('丙午');
  });

  test('旬空跟随换日后的日干支（跨旬边界：癸酉日 23:30 换为甲戌日）', () => {
    // 2000-01-16 = 癸酉日（甲子旬，空亡戌亥）；23:30 起换次日甲戌（甲戌旬，空亡申酉）
    const r = toLunar(new Date(2000, 0, 16, 23, 30));
    expect(r.ganzhiDay).toBe('甲戌');
    expect(r.xunkong).toEqual(['申', '酉']);
    // 同日 22:59 仍为癸酉日，旬空戌亥
    const before = toLunar(new Date(2000, 0, 16, 22, 59));
    expect(before.ganzhiDay).toBe('癸酉');
    expect(before.xunkong).toEqual(['戌', '亥']);
  });

  test('年干支以立春为岁首：2025 立春（2/3 夜）前后换年', () => {
    const before = toLunar(new Date(2025, 1, 3, 12, 0)); // 立春 2025-02-03 22:08 之前
    const after = toLunar(new Date(2025, 1, 4, 12, 0)); // 立春之后
    expect(before.ganzhiYear).toBe('甲辰'); // 上年干支
    expect(before.yuejian).toBe('丑'); // 小寒→立春 = 丑月
    expect(before.ganzhiMonth).toBe('丁丑');
    expect(after.ganzhiYear).toBe('乙巳'); // 新年干支
    expect(after.yuejian).toBe('寅'); // 立春起 = 寅月
    expect(after.ganzhiMonth).toBe('戊寅');
  });

  test('节气定月建：2026 立春（2/4 晨）前后 丑/寅，惊蛰（3/5 夜）后 卯', () => {
    // 2026-02-03（立春前）→ 丑月
    const yinQian = toLunar(new Date(2026, 1, 3, 12, 0));
    expect(yinQian.ganzhiYear).toBe('乙巳'); // 立春前仍用 2025 乙巳
    expect(yinQian.yuejian).toBe('丑');
    expect(yinQian.ganzhiMonth).toBe('己丑'); // 乙年五虎遁: 戊寅起, 丑月=己丑
    // 2026-02-05（立春后）→ 寅月
    const yin = toLunar(new Date(2026, 1, 5, 12, 0));
    expect(yin.ganzhiYear).toBe('丙午');
    expect(yin.yuejian).toBe('寅');
    expect(yin.ganzhiMonth).toBe('庚寅'); // 丙年五虎遁: 庚寅起
    // 2026-03-04（惊蛰前）→ 寅月；2026-03-06（惊蛰后）→ 卯月
    expect(toLunar(new Date(2026, 2, 4, 12, 0)).yuejian).toBe('寅');
    const mao = toLunar(new Date(2026, 2, 6, 12, 0));
    expect(mao.yuejian).toBe('卯');
    expect(mao.ganzhiMonth).toBe('辛卯'); // 寅月庚寅 → 卯月辛卯
    // 2026-08-04（立秋前）→ 未月；2026-08-10（立秋后）→ 申月
    expect(toLunar(new Date(2026, 7, 4)).yuejian).toBe('未');
    expect(toLunar(new Date(2026, 7, 10)).yuejian).toBe('申');
  });

  test('超出 1900-2100 数据范围抛 RangeError', () => {
    expect(() => toLunar(new Date(1899, 11, 31))).toThrow(RangeError);
    expect(() => toLunar(new Date(1899, 0, 1))).toThrow(RangeError);
    // 2100 农历年(庚申年)止于 2101-01-28(腊月廿九):
    // 香港天文台官方口径 2100-12-31 = 腊月初一, 腊月 29 天
    const last = toLunar(new Date(2101, 0, 28));
    expect(last.year).toBe(2100);
    expect(last.month).toBe(12);
    expect(last.day).toBe(29);
    // 2101-01-29 起超界
    expect(() => toLunar(new Date(2101, 0, 29))).toThrow(RangeError);
    expect(() => toLunar(new Date(2102, 0, 1))).toThrow(RangeError);
  });

  test('六十甲子日干支循环正确（跨月/跨年边界）', () => {
    // 2000-01-07 甲子起，每日顺延 mod 60
    expect(toLunar(new Date(2000, 0, 7)).ganzhiDay).toBe('甲子'); // 锚点
    expect(toLunar(new Date(2000, 1, 8)).ganzhiDay).toBe('丙申'); // +32 天
    expect(toLunar(new Date(2000, 2, 8)).ganzhiDay).toBe('乙丑'); // +61 天(60 天循环后余 1)
  });
});

describe('节气交节时刻（高精度 VSOP87D，紫金山天文台/bmcx 官方口径）', () => {
  // 节令下标：0=小寒 1=立春 2=惊蛰 3=清明 4=立夏 5=芒种 6=小暑 7=立秋 8=白露 9=寒露 10=立冬 11=大雪
  // 北京时间（东八区）墙钟 -> UTC 毫秒（bmcx 官方值均为北京时间）
  const bj = (y, m, d, hh, mm, ss) => Date.UTC(y, m - 1, d, hh, mm, ss) - 8 * 3600000;
  const fmtBJ = (ms) => {
    const d = new Date(ms + 8 * 3600000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };

  test('立春序列 2022-2031（bmcx 官方值，北京时间）：全部 ±60 秒内', () => {
    // 便民查询网（紫金山天文台官方口径）立春精确时刻
    const cases = [
      [2022, 2, 4, 4, 50, 36], [2023, 2, 4, 10, 42, 21], [2024, 2, 4, 16, 26, 53],
      [2025, 2, 3, 22, 10, 13], [2026, 2, 4, 4, 1, 51], [2027, 2, 4, 9, 46, 0],
      [2028, 2, 4, 15, 30, 53], [2029, 2, 3, 21, 20, 25], [2030, 2, 4, 3, 8, 4],
      [2031, 2, 4, 8, 57, 55],
    ];
    for (const [y, m, d, hh, mm, ss] of cases) {
      const got = jieMs(y, 1); // 立春
      const official = bj(y, m, d, hh, mm, ss);
      expect(Math.abs(got - official)).toBeLessThanOrEqual(60000);
    }
  });

  test('立春关键年份 2024/2025/2026：±30 秒内（验收标准）', () => {
    const cases = [
      [2024, 2, 4, 16, 26, 53], [2025, 2, 3, 22, 10, 13], [2026, 2, 4, 4, 1, 51],
    ];
    for (const [y, m, d, hh, mm, ss] of cases) {
      const got = jieMs(y, 1);
      const official = bj(y, m, d, hh, mm, ss);
      expect(Math.abs(got - official)).toBeLessThanOrEqual(30000);
      expect(fmtBJ(got).slice(0, 10)).toBe(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  });

  test('2026 惊蛰/清明/大雪（bmcx 官方值，北京时间）：±60 秒内', () => {
    const cases = [
      [2, 2026, 3, 5, 21, 58, 43], // 惊蛰
      [3, 2026, 4, 5, 2, 39, 43], // 清明
      [11, 2026, 12, 7, 10, 52, 14], // 大雪
    ];
    for (const [idx, y, m, d, hh, mm, ss] of cases) {
      const got = jieMs(y, idx);
      const official = bj(y, m, d, hh, mm, ss);
      expect(Math.abs(got - official)).toBeLessThanOrEqual(60000);
      expect(fmtBJ(got).slice(0, 10)).toBe(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  });

  test('节气时刻为确定性结果且随缓存复用（同值稳定）', () => {
    const a = jieMs(2026, 1);
    const b = jieMs(2026, 1);
    expect(b).toBe(a);
    // 立春 -> 惊蛰 间隔约 30 天（14 天 22 小时量级内不校验，仅验证顺序）
    expect(jieMs(2026, 2)).toBeGreaterThan(jieMs(2026, 1));
  });
});

describe('fromLunar 农历 → 公历（农历起卦输入）', () => {
  test('已知日期换算：含闰月与春节', () => {
    expect(fromLunar(2026, 6, 22)).toEqual({ year: 2026, month: 8, day: 4 }); // 六月廿二
    expect(fromLunar(2024, 1, 1)).toEqual({ year: 2024, month: 2, day: 10 }); // 甲辰年春节
    expect(fromLunar(2023, 2, 1, true)).toEqual({ year: 2023, month: 3, day: 22 }); // 癸卯年闰二月初一
  });

  test('与 toLunar 往返一致（2000-2030 逐周抽样）', () => {
    for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2030, 0, 1); t += 7 * 86400000) {
      const u = new Date(t);
      const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
      const l = toLunar(d);
      expect(fromLunar(l.year, l.month, l.day, l.isLeap)).toEqual({
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
      });
    }
  });

  test('非法输入抛 RangeError', () => {
    expect(() => fromLunar(1899, 1, 1)).toThrow(RangeError); // 年超界
    expect(() => fromLunar(2026, 13, 1)).toThrow(RangeError); // 月越界
    expect(() => fromLunar(2026, 1, 31)).toThrow(RangeError); // 日超过该月天数
    expect(() => fromLunar(2026, 7, 1, true)).toThrow(RangeError); // 该年无闰七月
  });
});
