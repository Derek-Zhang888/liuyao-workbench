import { describe, expect, test } from 'vitest';
import { toLunar } from './ganzhi';
import { paipan } from './paipan';
import {
  eqOfTime,
  trueSolarMinutes,
  cityLocalClock,
  solarHourGZ,
  shichenName,
  trueSolarDayRef,
  trueSolarLunar,
} from './solarTime';

/**
 * 真太阳时校准测试。
 *
 * 独立验证口径：
 * 1. EoT 均时差：Meeus《Astronomical Algorithms》第 28 章公式，抽样常识值
 *    （2026-08-07 ≈ -5.8 分钟 / 2026-02-11 ≈ -14.2 分钟 / 2026-11-03 ≈ +16.5 分钟）
 * 2. 乌鲁木齐（东经 87.617°）：北京时间 23:00 真太阳时 ≈ 20:44（未到子时 → 时柱戌时而非子时）
 * 3. 纽约（西经 74.006°，UTC-5 固定偏移）：北京 11:30 = 纽约本地 08-04 22:30，
 *    日柱按北京时间日期（08-05）→ 辛亥（与默认 trueSolar=null 完全一致）；
 *    真太阳时 ≈ 22:28 → 亥时，时柱 = 己亥（辛亥日亥时，丙辛戊子起）
 * 4. 东京（东经 139.692°，UTC+9）：北京 08-05 23:30 = 东京本地 08-06 00:30，
 *    日柱仍按北京时间日期 + 北京 23:00 换日 → 壬子（而非东京本地日期重算的癸丑）
 * 5. 真太阳时换日参考：北京 08-04 23:30（纽约本地 10:30）实际日建已换（辛亥），
 *    而按当地真太阳时 23:00 换日则仍未换（庚戌）→ 参考标注差异
 */

describe('eqOfTime 均时差（Meeus 第 28 章）', () => {
  test('抽样常识值：8 月初 ≈ -5.8 / 2 月中 ≈ -14.2 / 11 月初 ≈ +16.5（分钟）', () => {
    const aug = eqOfTime(new Date(2026, 7, 7, 12, 0));
    expect(aug).toBeGreaterThan(-7.5);
    expect(aug).toBeLessThan(-4); // 用户口径：2026-08-07 附近 EoT ≈ -5~-6
    expect(aug).toBeCloseTo(-5.84, 0);

    const feb = eqOfTime(new Date(2026, 1, 11, 12, 0));
    expect(feb).toBeGreaterThan(-15.5);
    expect(feb).toBeLessThan(-13); // 用户口径：2 月中 ≈ -14
    expect(feb).toBeCloseTo(-14.22, 0);

    const nov = eqOfTime(new Date(2026, 10, 3, 12, 0));
    expect(nov).toBeGreaterThan(15);
    expect(nov).toBeLessThan(17.5); // 用户口径：11 月初 ≈ +16
    expect(nov).toBeCloseTo(16.49, 0);
  });

  test('全年极值范围：min ≤ -13.5，max ≥ +16（2026 逐日采样）', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const v = eqOfTime(new Date(2026, m, d, 12, 0));
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    expect(min).toBeLessThanOrEqual(-13.5);
    expect(max).toBeGreaterThanOrEqual(16);
  });

  test('输入校验：非法 Date 抛 TypeError', () => {
    expect(() => eqOfTime('2026-08-07')).toThrow(TypeError);
    expect(() => eqOfTime(new Date('bad'))).toThrow(TypeError);
  });
});

describe('trueSolarMinutes 真太阳时（北京时间 + 经度修正 + EoT）', () => {
  const d = new Date(2026, 7, 7, 12, 0); // 北京时间 12:00

  test('东经 120°（北京时间基准）：真太阳时 = 720 + EoT', () => {
    const ts = trueSolarMinutes(d, 120);
    expect(ts).toBeCloseTo(720 + eqOfTime(d), 6);
  });

  test('经度修正：每 1° = 4 分钟（东经 116.4 比 120° 慢 14.4 分钟）', () => {
    const ts120 = trueSolarMinutes(d, 120);
    const ts116 = trueSolarMinutes(d, 116.4);
    expect(ts120 - ts116).toBeCloseTo((120 - 116.4) * 4, 6);
  });

  test('跨午夜回卷：东京（东经 139.69°）北京 23:30 → 真太阳时 ≈ 次日 00:43', () => {
    const ts = trueSolarMinutes(new Date(2026, 7, 7, 23, 30), 139.692);
    expect(ts).toBeGreaterThan(30); // 0:30 之后
    expect(ts).toBeLessThan(60); // 1:00 之前（已回卷到次日）
  });

  test('输入校验：非法经度抛 RangeError', () => {
    expect(() => trueSolarMinutes(d, 200)).toThrow(RangeError);
    expect(() => trueSolarMinutes(d, -181)).toThrow(RangeError);
    expect(() => trueSolarMinutes(d, '116')).toThrow(RangeError);
  });
});

describe('cityLocalClock 城市本地时钟（时区决定当地几号）', () => {
  test('北京（UTC+8）：本地日期与北京一致', () => {
    const c = cityLocalClock(new Date(2026, 7, 7, 23, 0), 480);
    expect(c).toEqual({ y: 2026, m: 8, d: 7, hour: 23, min: 0 });
  });

  test('纽约（UTC-5）：北京 2026-08-05 11:30 = 纽约 08-04 22:30（日期回退一天）', () => {
    const c = cityLocalClock(new Date(2026, 7, 5, 11, 30), -300);
    expect(c).toEqual({ y: 2026, m: 8, d: 4, hour: 22, min: 30 });
  });

  test('纽约（UTC-5）：北京 2026-08-04 23:30 = 纽约 08-04 10:30（同日早间）', () => {
    const c = cityLocalClock(new Date(2026, 7, 4, 23, 30), -300);
    expect(c).toEqual({ y: 2026, m: 8, d: 4, hour: 10, min: 30 });
  });

  test('东京（UTC+9）：北京 2026-08-05 23:30 = 东京 08-06 00:30（日期前进一天）', () => {
    const c = cityLocalClock(new Date(2026, 7, 5, 23, 30), 540);
    expect(c).toEqual({ y: 2026, m: 8, d: 6, hour: 0, min: 30 });
  });

  test('跨月回卷：北京 2026-08-01 00:30（纽约）= 07-31 11:30', () => {
    const c = cityLocalClock(new Date(2026, 7, 1, 0, 30), -300);
    expect(c).toEqual({ y: 2026, m: 7, d: 31, hour: 11, min: 30 });
  });
});

describe('solarHourGZ 真太阳时时柱（五鼠遁，基于日干不变）', () => {
  test('与 toLunar 五鼠遁口径一致：庚日巳时 = 辛巳 / 甲日戌时 = 甲戌 / 辛日亥时（晚子时前）', () => {
    // 庚戌日 10:30 → 巳时（toLunar 双确认）
    expect(solarHourGZ('庚戌', 10 * 60 + 30)).toBe(toLunar(new Date(2026, 7, 4, 10, 30)).ganzhiHour);
    expect(solarHourGZ('庚戌', 10 * 60 + 30)).toBe('辛巳');
    // 甲寅日 20:00 → 戌时（甲己还加甲 → 甲戌）
    expect(solarHourGZ('甲寅', 20 * 60)).toBe('甲戌');
    // 辛亥日 22:30 → 亥时（丙辛戊子起 → 己亥）
    expect(solarHourGZ('辛亥', 22 * 60 + 30)).toBe('己亥');
  });

  test('子时：辛亥日 23:30（晚子时换日后的日干）→ 戊子（与 toLunar 一致）', () => {
    expect(solarHourGZ('辛亥', 23 * 60 + 30)).toBe('戊子');
    expect(solarHourGZ('辛亥', 23 * 60 + 30)).toBe(toLunar(new Date(2026, 7, 4, 23, 30)).ganzhiHour);
  });

  test('跨午夜回卷：0:20 归一化后为子时', () => {
    expect(solarHourGZ('甲寅', 24 * 60 + 20)).toBe(solarHourGZ('甲寅', 0 * 60 + 20));
    expect(solarHourGZ('甲寅', 24 * 60 + 20)).toBe('甲子');
  });

  test('输入校验：非法日干支 / 非法时辰抛错', () => {
    expect(() => solarHourGZ('甲乙', 120)).toThrow(RangeError);
    expect(() => solarHourGZ('庚', 120)).toThrow(RangeError);
    expect(() => solarHourGZ('庚戌', '120')).toThrow(RangeError);
  });
});

describe('乌鲁木齐用例（东经 87.617°，UTC+8）', () => {
  const date = new Date(2026, 7, 7, 23, 0); // 北京时间 23:00 = 子时

  test('北京时间 23:00 真太阳时 ≈ 20:44（未到子时 → 时柱戌时而非子时）', () => {
    const ts = trueSolarMinutes(date, 87.617);
    // 用户口径：真太阳时 ≈ 20:5x 量级（实际 20:44）；重点：未到 21:00 之前的戌时/未到 23:00 子时
    expect(ts).toBeGreaterThan(20 * 60 + 38);
    expect(ts).toBeLessThan(20 * 60 + 50);
    expect(shichenName(ts)).toBe('戌时');
  });

  test('本地日历日期 = 北京日期（同 UTC+8），日柱按北京时间 23:00 换日为甲寅', () => {
    const local = cityLocalClock(date, 480);
    expect(local).toEqual({ y: 2026, m: 8, d: 7, hour: 23, min: 0 });
    // 换日点仍按北京时间 23:00（官方口径）：2026-08-07 23:00 → 次日甲寅
    expect(toLunar(date).ganzhiDay).toBe('甲寅');
  });

  test('时柱：北京子时(甲子) → 真太阳时戌时(甲戌)；参考日建=癸丑（未按真太阳时换日）', () => {
    const r = trueSolarLunar(toLunar(date), date, { lng: 87.617, tzOffsetMin: 480, cityName: '乌鲁木齐' });
    expect(r.lunar.ganzhiDay).toBe('甲寅'); // 日柱不变（复用默认北京时间日期 + 23:00 换日）
    expect(r.lunar.ganzhiHour).toBe('甲戌'); // 时柱由甲子 → 甲戌
    expect(r.info.refDayGZ).toBe('癸丑'); // 若按当地真太阳时 23:00 换日，则仍为当日癸丑
    expect(r.info.trueSolarShichen).toBe('戌时');
    expect(r.info.trueSolarTime).toBe('20:44');
    // 月建/年建不变（节气是绝对时刻）
    expect(r.lunar.ganzhiMonth).toBe(toLunar(date).ganzhiMonth);
    expect(r.lunar.ganzhiYear).toBe(toLunar(date).ganzhiYear);
  });
});

describe('纽约用例（西经 74.006°，UTC-5 固定偏移）', () => {
  test('北京 2026-08-05 11:30：纽约本地为 08-04，日柱按北京时间日期 = 辛亥（与默认一致，而非本地 08-04 的庚戌）', () => {
    const date = new Date(2026, 7, 5, 11, 30);
    const local = cityLocalClock(date, -300);
    expect(local.y).toBe(2026);
    expect(local.m).toBe(8);
    expect(local.d).toBe(4);
    // 换日点按北京时间 23:00：北京 11:30 未过 23:00 → 不换日
    expect(toLunar(date).ganzhiDay).toBe('辛亥'); // 纯北京口径
    const r = trueSolarLunar(toLunar(date), date, { lng: -74.006, tzOffsetMin: -300, cityName: '纽约' });
    expect(r.lunar.ganzhiDay).toBe('辛亥'); // 日柱按北京时间日期 08-05（与默认一致）
    expect(r.lunar.ganzhiDay).toBe(toLunar(date).ganzhiDay); // 开启前后日柱完全一致
    expect(r.info.localDate).toBe('2026-08-04'); // 本地日期仅作参考展示
  });

  test('北京 11:30 → 纽约真太阳时 ≈ 22:28（亥时），时柱 = 己亥（辛亥日亥时，丙辛戊子起）', () => {
    const date = new Date(2026, 7, 5, 11, 30);
    const ts = trueSolarMinutes(date, -74.006);
    expect(ts).toBeGreaterThan(22 * 60 + 20);
    expect(ts).toBeLessThan(22 * 60 + 36);
    expect(shichenName(ts)).toBe('亥时');
    const r = trueSolarLunar(toLunar(date), date, { lng: -74.006, tzOffsetMin: -300, cityName: '纽约' });
    expect(r.lunar.ganzhiHour).toBe('己亥'); // 辛亥日 亥时（丙辛戊子起 → 己亥）
    expect(r.info.trueSolarShichen).toBe('亥时');
  });

  test('真太阳时换日参考：北京 08-04 23:30（纽约 10:30）实际已换日(辛亥)，真太阳时换日则未换(庚戌)', () => {
    const date = new Date(2026, 7, 4, 23, 30);
    const r = trueSolarLunar(toLunar(date), date, { lng: -74.006, tzOffsetMin: -300, cityName: '纽约' });
    expect(r.lunar.ganzhiDay).toBe('辛亥'); // 实际：北京时间 23:00 已过 → 换日
    expect(r.info.refDayGZ).toBe('庚戌'); // 参考：纽约真太阳时 10:28，未到 23:00 → 未换日
    expect(r.info.refDayGZ).not.toBe(r.lunar.ganzhiDay); // 展示「（真太阳时换日则为 庚戌）」
  });
});

describe('东京用例（东经 139.692°，UTC+9）', () => {
  test('北京 2026-08-05 23:30 = 东京 08-06 00:30：日柱按北京时间日期（壬子），而非东京本地重算（癸丑）', () => {
    const date = new Date(2026, 7, 5, 23, 30);
    const local = cityLocalClock(date, 540);
    expect(local).toEqual({ y: 2026, m: 8, d: 6, hour: 0, min: 30 });
    // 日柱 = 北京时间日期 + 北京 23:00 换日：08-05 23:30 已过 23:00 → 壬子（08-06 的干支）
    expect(toLunar(date).ganzhiDay).toBe('壬子');
    const r = trueSolarLunar(toLunar(date), date, { lng: 139.692, tzOffsetMin: 540, cityName: '东京' });
    expect(r.lunar.ganzhiDay).toBe('壬子'); // 与默认一致
    expect(r.lunar.ganzhiDay).not.toBe('癸丑'); // 旧实现（东京本地 08-06 + 北京 23:00）会是癸丑
    expect(r.lunar.xunkong).toEqual(toLunar(date).xunkong); // 旬空与默认一致
    // 真太阳时：23:30 + (139.692-120)×4 ≈ 78.8 分钟 + EoT ≈ 次日 00:43 → 子时
    const ts = trueSolarMinutes(date, 139.692);
    expect(ts).toBeGreaterThan(35);
    expect(ts).toBeLessThan(50);
    expect(shichenName(ts)).toBe('子时');
    expect(r.lunar.ganzhiHour).toBe('庚子'); // 壬日 子时（壬癸戊子头 → 庚子）
    expect(r.info.localDate).toBe('2026-08-06'); // 本地日期仅作参考展示
  });
});

describe('trueSolarDayRef 真太阳时换日参考日建', () => {
  test('本地日期 08-07，真太阳时 20:44 → 未过 23:00 → 当日癸丑', () => {
    expect(trueSolarDayRef(2026, 8, 7, 20 * 60 + 44)).toBe('癸丑');
  });
  test('本地日期 08-07，真太阳时 23:10 → 已过 23:00 → 次日甲寅', () => {
    expect(trueSolarDayRef(2026, 8, 7, 23 * 60 + 10)).toBe('甲寅');
  });
  test('本地日期 08-04，真太阳时 10:28 → 未过 23:00 → 当日庚戌', () => {
    expect(trueSolarDayRef(2026, 8, 4, 10 * 60 + 28)).toBe('庚戌');
  });
});

describe('paipan 集成：trueSolar 参数', () => {
  test('默认（不传 trueSolar）行为不变：无 trueSolarInfo，时柱按北京时间', () => {
    const p = paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 7, 23, 0) });
    expect(p.trueSolarInfo).toBeNull();
    expect(p.dayGZ).toBe('甲寅');
    expect(p.hourGZ).toBe('甲子');
  });

  test('乌鲁木齐：时柱按真太阳时（戌时甲戌），日柱不变，旬空/六神/神煞跟随最终日柱', () => {
    const date = new Date(2026, 7, 7, 23, 0);
    const p = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date,
      trueSolar: { lng: 87.617, tzOffsetMin: 480, cityName: '乌鲁木齐' },
    });
    expect(p.dayGZ).toBe('甲寅'); // 与默认一致（北京时间日期 + 北京时间 23:00）
    expect(p.hourGZ).toBe('甲戌'); // 真太阳时戌时（北京子时甲子 → 甲戌）
    expect(p.xunkong).toEqual(['子', '丑']); // 甲寅日属甲寅旬，空亡子丑
    expect(p.liushen[0]).toBe('青龙'); // 甲日六神起青龙（跟随最终日柱）
    expect(p.shenshaList.find((s) => s.name === '天乙贵人').zhi).toBe('丑未'); // 甲日贵人丑未
    // 月建/年建不变
    expect(p.monthGZ).toBe(toLunar(date).ganzhiMonth);
    expect(p.yearGZ).toBe(toLunar(date).ganzhiYear);
    // 展示信息
    expect(p.trueSolarInfo.cityName).toBe('乌鲁木齐');
    expect(p.trueSolarInfo.trueSolarShichen).toBe('戌时');
    expect(p.trueSolarInfo.refDayGZ).toBe('癸丑');
  });

  test('纽约：日柱按北京时间日期（辛亥）与默认完全一致，时柱按真太阳时（己亥）', () => {
    const date = new Date(2026, 7, 5, 11, 30);
    const base = paipan({ method: 'qian', params: { lines: '111111' }, date });
    const p = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date,
      trueSolar: { lng: -74.006, tzOffsetMin: -300, cityName: '纽约' },
    });
    expect(p.dayGZ).toBe('辛亥'); // 北京时间日期 08-05（与默认一致，而非本地 08-04 的庚戌）
    expect(p.dayGZ).toBe(base.dayGZ); // 开启前后日柱完全一致
    expect(p.hourGZ).toBe('己亥'); // 真太阳时亥时（辛亥日亥时，丙辛戊子起）
    expect(p.hourGZ).not.toBe(base.hourGZ); // 时柱按真太阳时重算
    expect(p.xunkong).toEqual(base.xunkong); // 旬空与默认一致（辛亥日属甲辰旬 → 寅卯）
    expect(p.xunkong).toEqual(['寅', '卯']);
    expect(p.trueSolarInfo.localDate).toBe('2026-08-04'); // 本地日期仅作参考展示
    expect(p.trueSolarInfo.trueSolarShichen).toBe('亥时');
  });

  test('纽约参考日建差异场景：北京 08-04 23:30 → 日建辛亥（与默认一致）、参考庚戌', () => {
    const date = new Date(2026, 7, 4, 23, 30);
    const base = paipan({ method: 'qian', params: { lines: '111111' }, date });
    const p = paipan({
      method: 'qian',
      params: { lines: '111111' },
      date,
      trueSolar: { lng: -74.006, tzOffsetMin: -300, cityName: '纽约' },
    });
    expect(p.dayGZ).toBe('辛亥');
    expect(p.dayGZ).toBe(base.dayGZ); // 日柱与默认一致（北京时间 23:00 已过 → 换日）
    expect(p.trueSolarInfo.refDayGZ).toBe('庚戌');
    expect(p.trueSolarInfo.refDayGZ).not.toBe(p.dayGZ); // 触发「真太阳时换日则为」标注
  });

  test('trueSolar 参数缺失字段抛 RangeError（防御）', () => {
    expect(() =>
      paipan({ method: 'qian', params: { lines: '111111' }, date: new Date(2026, 7, 7, 23, 0), trueSolar: { lng: 87.617 } }),
    ).toThrow(RangeError);
  });
});
