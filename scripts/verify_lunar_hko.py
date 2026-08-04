# -*- coding: utf-8 -*-
"""以香港天文台(HKO)官方农历数据为准, 重建并核验 lunarInfo 数据表

用法: python scripts/verify_lunar_hko.py <hko_dir>
  hko_dir 为 T{year}c.txt 文件目录 (https://www.hko.gov.hk/tc/gts/time/calendar/text/files/)

输出: 每个农历年的 (闰月, 各月天数, 闰月天数), 并与 lunarData.js 表逐项对比,
      列出全部差异及修正值。
"""
import re
import sys
from datetime import date, timedelta

CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
MONTH_TOKENS = {'正月': 1}
MONTH_TOKENS.update({f'{k}月': v for k, v in CN.items() if 2 <= v <= 10})
MONTH_TOKENS['十一月'] = 11
MONTH_TOKENS['十二月'] = 12
DAY_TOKENS = {}
DAY_TOKENS.update({f'初{k}': v for k, v in CN.items() if v < 10})
DAY_TOKENS['初十'] = 10
DAY_TOKENS.update({f'十{k}': 10 + v for k, v in CN.items() if v < 10})
DAY_TOKENS['二十'] = 20
DAY_TOKENS.update({f'廿{k}': 20 + v for k, v in CN.items() if v < 10})
DAY_TOKENS['三十'] = 30


def parse_year(hko_dir, year):
    """解析 T{year}c.txt -> {公历日期(date): (农历月, 日, 闰标志)}; 无月份标记的跨年段为 None"""
    out = {}
    cur_month, cur_leap = None, False
    with open(f'{hko_dir}/T{year}c.txt', encoding='utf-8-sig') as f:
        for line in f:
            m = re.match(r'(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\S+)\s', line)
            if not m:
                continue
            gy, gm, gd = int(m.group(1)), int(m.group(2)), int(m.group(3))
            tok = m.group(4)
            if tok.endswith('月'):
                if tok.startswith('閏'):
                    cur_month, cur_leap = MONTH_TOKENS[tok[1:]], True
                else:
                    cur_month, cur_leap = MONTH_TOKENS[tok], False
                day = 1
            else:
                day = DAY_TOKENS.get(tok)
                if day is None:
                    raise ValueError(f'unknown token {tok} in T{year}c.txt')
            out[date(gy, gm, gd)] = (cur_month, day, cur_leap)
    return out


def build_lunar_year(hko_dir, lunar_year):
    """由 HKO 数据重建一个农历年的条目: (闰月, [1-12月天数], 闰月天数)"""
    # 收集该农历年涉及的公历年份文件
    month_dates = {}   # (农历月, 闰?) -> 初一的公历日期列表
    for gy in (lunar_year, lunar_year + 1):
        data = parse_year(hko_dir, gy)
        for d, (m, day, leap) in data.items():
            if day == 1 and m is not None:
                month_dates.setdefault((m, leap), []).append(d)
    if (1, False) not in month_dates:
        raise ValueError(f'cannot find 正月 of 农历{lunar_year}')
    cny_dates = sorted(month_dates[(1, False)])
    cny = cny_dates[0]                     # 本农历年春节
    next_cny = cny_dates[1]                # 下一农历年春节 (本农历年终点)
    # 仅收集 [cny, next_cny) 内的月初一 (该农历年的 12/13 个月), 含正月
    items = [((1, False), cny)]
    for (m, leap), dates in month_dates.items():
        if m == 1 and not leap:
            continue
        for d in sorted(dates):
            if cny <= d < next_cny:
                items.append(((m, leap), d))
                break
    items = sorted(items, key=lambda kv: kv[1])
    days = [0] * 13
    leap_m = 0
    leap_days = 0
    for i, ((m, leap), d) in enumerate(items):
        nxt = items[i + 1][1] if i + 1 < len(items) else next_cny
        if leap:
            leap_m = m
            leap_days = (nxt - d).days
        else:
            days[m] = (nxt - d).days
    return leap_m, days, leap_days


def encode(leap_m, days, leap_days):
    """条目编码: 低4位闰月, bit16 闰月大小, bit15-bit4 月1-12大小"""
    v = leap_m & 0xF
    if leap_m:
        if leap_days == 30:
            v |= 0x10000
    for m in range(1, 13):
        if days[m] == 30:
            v |= 0x10000 >> m
    return v


# ---- 当前 lunarData.js 表 ----
TABLE = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x16a95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0,
    0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520,
]
assert len(TABLE) == 201


def main(hko_dir):
    diffs = []
    # 2100 农历年终止需 2101 年数据(HKO 未提供), 且 2100 条目已由 6tail 交叉验证一致
    for y in range(1901, 2100):
        lm, days, ld = build_lunar_year(hko_dir, y)
        new = encode(lm, days, ld)
        old = TABLE[y - 1900]
        if new != old:
            diffs.append((y, old, new, lm, days, ld))
    print(f'HKO 重建对比 1901-2099: 共 199 项, 差异 {len(diffs)} 项:')
    for y, old, new, lm, days, ld in diffs:
        print(f'  {y}: 表=0x{old:05x}  HKO=0x{new:05x}  闰月={lm}({ld}天) 月天数={days[1:]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\18462\AppData\Local\Temp\hko')
