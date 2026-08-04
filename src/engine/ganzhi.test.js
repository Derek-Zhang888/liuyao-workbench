import { describe, expect, test } from 'vitest';
import { toLunar, GAN, ZHI, WUXING_GAN, WUXING_ZHI } from './ganzhi';

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

  test('2025-01-29 乙巳年春节：正月初一 戊戌日', () => {
    const r = toLunar(new Date(2025, 0, 29));
    expect(r.year).toBe(2025);
    expect(r.month).toBe(1);
    expect(r.day).toBe(1);
    expect(r.ganzhiYear).toBe('乙巳');
    expect(r.ganzhiMonth).toBe('戊寅'); // 乙庚之岁戊为头
    expect(r.ganzhiDay).toBe('戊戌'); // 6tail 双确认
    expect(r.xunkong).toEqual(['辰', '巳']); // 戊戌日属甲午旬，空亡辰巳
    expect(r.yuejian).toBe('寅');
  });

  test('锚点 2000-01-07 甲子日：农历己卯年腊月初一', () => {
    const r = toLunar(new Date(2000, 0, 7));
    expect(r.year).toBe(1999);
    expect(r.month).toBe(12);
    expect(r.day).toBe(1);
    expect(r.isLeap).toBe(false);
    expect(r.ganzhiYear).toBe('庚辰'); // 测试版按公历年 2000
    expect(r.ganzhiDay).toBe('甲子'); // 锚点日
    expect(r.xunkong).toEqual(['戌', '亥']); // 甲子旬空亡戌亥
    expect(r.yuejian).toBe('丑'); // 腊月=丑
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

  test('时柱：五鼠遁 + 子时换日边界', () => {
    // 庚戌日（乙庚丙作初）：0-22 点子时起丙子
    expect(toLunar(new Date(2026, 7, 4, 0, 30)).ganzhiHour).toBe('丙子');
    expect(toLunar(new Date(2026, 7, 4, 1, 30)).ganzhiHour).toBe('丁丑'); // 丑时
    expect(toLunar(new Date(2026, 7, 4, 10, 30)).ganzhiHour).toBe('辛巳'); // 巳时
    expect(toLunar(new Date(2026, 7, 4, 12, 30)).ganzhiHour).toBe('壬午'); // 午时
    expect(toLunar(new Date(2026, 7, 4, 21, 30)).ganzhiHour).toBe('丁亥'); // 亥时(21-23)
    expect(toLunar(new Date(2026, 7, 4, 22, 30)).ganzhiHour).toBe('丁亥'); // 亥时(22-23)
    // 23:00 后子时换日，用次日(辛亥日)日干：丙辛戊子起 -> 戊子（6tail 双确认）
    expect(toLunar(new Date(2026, 7, 4, 23, 30)).ganzhiHour).toBe('戊子');
  });

  test('超出 1900-2100 数据范围抛 RangeError', () => {
    expect(() => toLunar(new Date(1899, 11, 31))).toThrow(RangeError);
    expect(() => toLunar(new Date(1899, 0, 1))).toThrow(RangeError);
  });

  test('六十甲子日干支循环正确（跨月/跨年边界）', () => {
    // 2000-01-07 甲子起，每日顺延 mod 60
    expect(toLunar(new Date(2000, 0, 7)).ganzhiDay).toBe('甲子'); // 锚点
    expect(toLunar(new Date(2000, 1, 8)).ganzhiDay).toBe('丙申'); // +32 天
    expect(toLunar(new Date(2000, 2, 8)).ganzhiDay).toBe('乙丑'); // +61 天(60 天循环后余 1)
  });
});
