import { describe, expect, test } from 'vitest';
import {
  qiguaFromQian, qiguaFromCoin, qiguaFromGuaName, qiguaFromNumber,
  qiguaFromBaoshu, qiguaFromTime, qiguaFromRandom, qiguaFromMinuteSecond,
  qiguaFromShike, QIGUA_METHODS,
} from './qigua';

/**
 * 起卦算法统一约定（与传统六爻一致，歧义处详见 task-4-report.md）：
 * - 统一输出 { lines: 6 位爻画(初爻→上爻, 1=阳 2=阴), dong: 动爻索引数组(0=初爻) }
 * - 卦数映射：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤；三爻画（初→上）：
 *   乾111 兑112 离121 震122 巽211 坎212 艮221 坤222
 * - 上下卦位置：下卦=前 3 位（初二三爻），上卦=后 3 位（四五上爻）
 *   例：天风姤(巽下乾上) = '211111'，与 64 卦表 guaTable.js 一致
 *   注：简报中「数字卦算法2」「报数卦」两处期望 '111211' 为镜像笔误，
 *       按传统口径应为 '112111'（详见 task-4-report.md）
 * - 钱币卦 randomFn 每次返回 0-3（3 枚钱币中正面向上的枚数）：
 *   3正=老阳(9,阳动) 2正1反=少阳(7,阳静) 1正2反=少阴(8,阴静) 3反=老阴(6,阴动)
 */

describe('QIGUA_METHODS 配置', () => {
  test('9 项配置，id/name 与简报一致', () => {
    expect(QIGUA_METHODS).toHaveLength(9);
    expect(QIGUA_METHODS.map((m) => m.id)).toEqual([
      'qian', 'yaoming', 'guaname', 'number', 'baoshu',
      'time', 'computer', 'fenmiao', 'shike',
    ]);
    expect(QIGUA_METHODS.map((m) => m.name)).toEqual([
      '钱币卦', '爻名卦', '卦名卦', '数字卦', '报数卦',
      '时间卦', '电脑卦', '分秒卦', '时刻卦',
    ]);
    for (const m of QIGUA_METHODS) {
      expect(typeof m.desc).toBe('string');
      expect(m.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('爻名卦 qiguaFromQian', () => {
  test('输入含老阳(3)/老阴(4) 标记动爻', () => {
    const r = qiguaFromQian('123412');
    expect(r.lines).toBe('121212'); // 3→1(阳动) 4→2(阴动)
    expect(r.dong).toEqual([2, 3]);
  });
  test('纯静爻输入无动爻', () => {
    expect(qiguaFromQian('111111')).toEqual({ lines: '111111', dong: [] });
    expect(qiguaFromQian('222222')).toEqual({ lines: '222222', dong: [] });
  });
  test('非法输入抛 RangeError', () => {
    expect(() => qiguaFromQian('123456')).toThrow(RangeError); // 5/6 越界
    expect(() => qiguaFromQian('12345')).toThrow(RangeError);  // 长度不足
    expect(() => qiguaFromQian(123412)).toThrow(RangeError);    // 非字符串
  });
});

describe('卦名卦 qiguaFromGuaName', () => {
  test('按 64 卦名/简称查卦，无动爻', () => {
    expect(qiguaFromGuaName('乾为天')).toEqual({ lines: '111111', dong: [] });
    expect(qiguaFromGuaName('天风姤')).toEqual({ lines: '211111', dong: [] });
    expect(qiguaFromGuaName('水火既济')).toEqual({ lines: '121212', dong: [] });
  });
  test('八纯卦单字名与爻画输入', () => {
    expect(qiguaFromGuaName('坎')).toEqual({ lines: '212212', dong: [] });
    expect(qiguaFromGuaName('坤')).toEqual({ lines: '222222', dong: [] });
    expect(qiguaFromGuaName('121121')).toEqual({ lines: '121121', dong: [] }); // 直接给爻画
  });
  test('查无此卦抛 RangeError', () => {
    expect(() => qiguaFromGuaName('不存在卦')).toThrow(RangeError);
    expect(() => qiguaFromGuaName('123')).toThrow(RangeError);
  });
});

describe('数字卦 qiguaFromNumber', () => {
  test('数字卦算法1（简报用例）：1÷8上乾，(2+3)÷8下巽，(1+2+3)÷6 余0→6爻动', () => {
    const r = qiguaFromNumber(1, 2, 3, 1);
    expect(r.lines.slice(3)).toBe('111'); // 上卦乾在后 3 位
    expect(r.lines).toBe('211111');       // 天风姤(巽下乾上)
    expect(r.dong).toEqual([5]);          // 余0→第6爻动→索引5
  });
  test('数字卦算法2：1÷8上乾，2÷8下兑，3÷6 第3爻动', () => {
    const r = qiguaFromNumber(1, 2, 3, 2);
    expect(r.lines).toBe('112111'); // 天泽履(兑下乾上)；简报原文 '111211' 为镜像笔误，见报告
    expect(r.dong).toEqual([2]);
  });
  test('余0 → 上卦坤(8)、下卦坤(8)、第6爻动', () => {
    expect(qiguaFromNumber(8, 8, 8, 1)).toEqual({ lines: '222222', dong: [5] });
    expect(qiguaFromNumber(8, 8, 8, 2)).toEqual({ lines: '222222', dong: [1] }); // 8÷6 余2
  });
  test('非法参数抛 RangeError', () => {
    expect(() => qiguaFromNumber(1, 2, 3, 3)).toThrow(RangeError);  // method 非法
    expect(() => qiguaFromNumber(-1, 2, 3, 1)).toThrow(RangeError); // 非正整数
    expect(() => qiguaFromNumber(1.5, 2, 3, 1)).toThrow(RangeError);
  });
});

describe('报数卦 qiguaFromBaoshu', () => {
  test('1234：1上乾 2下兑，3、4爻动', () => {
    const r = qiguaFromBaoshu('1234');
    expect(r.lines).toBe('112111'); // 简报原文 '111211' 为镜像笔误，见报告
    expect(r.dong).toEqual([2, 3]);
  });
  test('仅两位数无动爻；88 坤坤', () => {
    expect(qiguaFromBaoshu('12')).toEqual({ lines: '112111', dong: [] });
    expect(qiguaFromBaoshu('88')).toEqual({ lines: '222222', dong: [] });
  });
  test('多个动爻去重排序', () => {
    expect(qiguaFromBaoshu('123322').dong).toEqual([1, 2]); // 动爻 3,3,2,2
    expect(qiguaFromBaoshu('154321').dong).toEqual([0, 1, 2, 3]); // 1-4 爻动
  });
  test('非法输入抛 RangeError', () => {
    expect(() => qiguaFromBaoshu('1')).toThrow(RangeError);    // 长度不足
    expect(() => qiguaFromBaoshu('0123')).toThrow(RangeError); // 卦数 0
    expect(() => qiguaFromBaoshu('127')).toThrow(RangeError);  // 动爻编号 7 越界
    expect(() => qiguaFromBaoshu('12a')).toThrow(RangeError);  // 非数字
    expect(() => qiguaFromBaoshu(1234)).toThrow(RangeError);   // 非字符串
  });
});

describe('分秒卦 qiguaFromMinuteSecond', () => {
  test('简报用例 23/45：2+3=5巽上，4+5=9余1乾下，四数和 14÷6 余2', () => {
    const r = qiguaFromMinuteSecond(23, 45);
    expect(r.lines).toBe('111211'); // 风天小畜(乾下巽上)
    expect(r.dong).toEqual([1]);
  });
  test('和数整除：余0 按 8/6 计', () => {
    expect(qiguaFromMinuteSecond(0, 0)).toEqual({ lines: '222222', dong: [5] }); // 0÷8余0→坤，0÷6→第6爻
    expect(qiguaFromMinuteSecond(8, 16)).toEqual({ lines: '221222', dong: [2] }); // 8→坤上，1+6=7艮下，15÷6余3
  });
  test('单数位按 0+digit 求和：5→5 巽上，3→3 离下，(5+3)÷6 余2 → 风火家人 二爻动', () => {
    expect(qiguaFromMinuteSecond(5, 3)).toEqual({ lines: '121211', dong: [1] });
  });
  test('非法输入抛 RangeError', () => {
    expect(() => qiguaFromMinuteSecond(-1, 30)).toThrow(RangeError);
    expect(() => qiguaFromMinuteSecond(1.5, 30)).toThrow(RangeError);
  });
});

describe('时间卦 qiguaFromTime（年月日时起卦）', () => {
  test('2026-08-04 10:30：年支午=7、六月廿二、巳时=6 → 火天大有 五爻动', () => {
    const r = qiguaFromTime(new Date(2026, 7, 4, 10, 30));
    expect(r.lines).toBe('111121'); // 火天大有(乾下离上)，与 64 卦表一致
    expect(r.dong).toEqual([4]);
  });
  test('2024-02-10 甲辰年春节 子时：年支辰=5、正月初一 → 山地剥 二爻动', () => {
    const r = qiguaFromTime(new Date(2024, 1, 10));
    expect(r.lines).toBe('222221'); // 山地剥(坤下艮上)
    expect(r.dong).toEqual([1]);
  });
  test('23 点后按子时（时辰序 1），与 0 点子时同卦', () => {
    // 午=7 六月廿二 子=1：上=(7+6+22)÷8余3离，下=(7+6+22+1)÷8余4震，动爻 36÷6 余0→上爻动
    const late = qiguaFromTime(new Date(2026, 7, 4, 23, 30));
    const early = qiguaFromTime(new Date(2026, 7, 4, 0, 30));
    expect(late).toEqual(early);
    expect(late.lines).toBe('122121'); // 火雷噬嗑（震下离上）
    expect(late.dong).toEqual([5]);
  });
});

describe('时刻卦 qiguaFromShike（农历月日时辰刻）', () => {
  test('2026-08-04 10:30：六月廿二、巳时=6、刻序7 → 泽天夬 五爻动', () => {
    const r = qiguaFromShike(new Date(2026, 7, 4, 10, 30));
    expect(r.lines).toBe('111112'); // 泽天夬(乾下兑上)
    expect(r.dong).toEqual([4]);
  });
  test('00:00 子时第一刻段：2026-08-04 六月廿二 子=1 刻=5 → 风泽中孚 四爻动', () => {
    const r = qiguaFromShike(new Date(2026, 7, 4, 0, 0));
    expect(r.lines).toBe('112211'); // 风泽中孚(兑下巽上)
    expect(r.dong).toEqual([3]);
  });
  test('刻序按 15 分钟递进：10:00→5 刻, 10:14→5 刻, 10:15→6 刻', () => {
    const lines1 = qiguaFromShike(new Date(2026, 7, 4, 10, 0)).lines;
    const lines2 = qiguaFromShike(new Date(2026, 7, 4, 10, 14)).lines;
    const lines3 = qiguaFromShike(new Date(2026, 7, 4, 10, 15)).lines;
    expect(lines1).toBe(lines2);
    expect(lines2).not.toBe(lines3);
  });
});

describe('电脑卦 qiguaFromRandom', () => {
  test('可控 randomFn：[0,0.25)=静阳 1，[0.25,0.5)=静阴 2，[0.5,0.75)=老阳 3(动)，[0.75,1)=老阴 4(动)', () => {
    const seq = [0.1, 0.3, 0.6, 0.9, 0.05, 0.8];
    const r = qiguaFromRandom(() => seq.shift());
    expect(r.lines).toBe('121212'); // 水火既济，三处动爻
    expect(r.dong).toEqual([2, 3, 5]);
  });
  test('默认 Math.random 生成合法卦', () => {
    const r = qiguaFromRandom();
    expect(r.lines).toMatch(/^[12]{6}$/);
    expect(r.dong.length).toBeLessThanOrEqual(6);
    expect(r.dong.every((i) => Number.isInteger(i) && i >= 0 && i < 6)).toBe(true);
  });
  test('randomFn 非法抛错', () => {
    expect(() => qiguaFromRandom('x')).toThrow(TypeError);
    expect(() => qiguaFromRandom(() => -0.1)).toThrow(RangeError);
  });
});

describe('钱币卦 qiguaFromCoin', () => {
  test('简报用例：randomFn 返回 3（3正=老阳9）→ 六爻皆动', () => {
    const r = qiguaFromCoin(() => 3);
    expect(r.lines).toBe('111111');
    expect(r.dong).toEqual([0, 1, 2, 3, 4, 5]);
  });
  test('4 种钱币结果映射：0→老阴(动) 1→少阴(静) 2→少阳(静) 3→老阳(动)', () => {
    expect(qiguaFromCoin(() => 0)).toEqual({ lines: '222222', dong: [0, 1, 2, 3, 4, 5] });
    expect(qiguaFromCoin(() => 1)).toEqual({ lines: '222222', dong: [] });
    expect(qiguaFromCoin(() => 2)).toEqual({ lines: '111111', dong: [] });
    expect(qiguaFromCoin(() => 3)).toEqual({ lines: '111111', dong: [0, 1, 2, 3, 4, 5] });
  });
  test('混合序列：老阳 少阳 少阴 老阴 少阳 老阳 → 风泽中孚', () => {
    const seq = [3, 2, 1, 0, 2, 3]; // 每次摇的正面个数
    const r = qiguaFromCoin(() => seq.shift());
    expect(r.lines).toBe('112211');
    expect(r.dong).toEqual([0, 3, 5]);
  });
  test('无参调用：默认 randomFn 生成随机正面数 0-3，不抛错且输出合法', () => {
    for (let k = 0; k < 20; k++) {
      const r = qiguaFromCoin(); // 默认 () => Math.floor(Math.random() * 4)
      expect(r.lines).toMatch(/^[12]{6}$/);
      expect(r.dong.every((i) => Number.isInteger(i) && i >= 0 && i < 6)).toBe(true);
    }
  });
  test('randomFn 非法返回值抛错', () => {
    expect(() => qiguaFromCoin(() => 5)).toThrow(RangeError);
    expect(() => qiguaFromCoin(() => -1)).toThrow(RangeError);
    expect(() => qiguaFromCoin('x')).toThrow(TypeError);
  });
});
