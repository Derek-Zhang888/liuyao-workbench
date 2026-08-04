# -*- coding: utf-8 -*-
"""Task 3 农历数据表验证脚本

数据来源: npm 包 solarlunar@3.1.0 (yize/solarlunar) 内置 lunarInfo 表
         (https://unpkg.com/solarlunar@3.1.0/dist/solarlunar.esm.js)
验证方式:
  1. 用本脚本独立实现 lunarInfo 解码 -> 推算每年春节(正月初一)公历日期,
     与已知真实春节日期(公历, 常识级事实)逐条比对
  2. 闰月月份与已知真实闰月逐条比对
  3. 日干支用锚点 2000-01-07 甲子日, 与已知日干支比对
"""
import datetime as dt

LUNAR_INFO = [
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
assert len(LUNAR_INFO) == 201, f"expect 201 (1900-2100), got {len(LUNAR_INFO)}"

def leap_month(y):
    return LUNAR_INFO[y - 1900] & 0xF

def leap_days(y):
    lm = leap_month(y)
    return 30 if (lm and (LUNAR_INFO[y - 1900] & 0x10000)) else 29

def month_days(y, m):
    return 30 if (LUNAR_INFO[y - 1900] & (0x10000 >> m)) else 29

def year_days(y):
    s = sum(month_days(y, m) for m in range(1, 13))
    if leap_month(y):
        s += leap_days(y)
    return s

# ---------- 1. 春节日期验证 ----------
ANCHOR = dt.date(1900, 1, 31)  # 1900 年正月初一(庚子年春节)
# 已知真实春节日期: {年份: (月,日)}, 公历
KNOWN_NY = {
    1900: (1,31), 1911: (1,30), 1912: (2,18), 1920: (2,20), 1937: (2,11),
    1939: (2,19), 1940: (2,8), 1941: (1,27),
    1949: (1,29), 1950: (2,17), 1955: (1,24), 1968: (1,30), 1976: (1,31),
    1980: (2,16), 1984: (2,2), 1990: (1,27), 1996: (2,19), 1997: (2,7),
    1998: (1,28), 1999: (2,16), 2000: (2,5), 2001: (1,24), 2002: (2,12),
    2003: (2,1), 2004: (1,22), 2005: (2,9), 2006: (1,29), 2007: (2,18),
    2008: (2,7), 2009: (1,26), 2010: (2,14), 2011: (2,3), 2012: (1,23),
    2013: (2,10), 2014: (1,31), 2015: (2,19), 2016: (2,8), 2017: (1,28),
    2018: (2,16), 2019: (2,5), 2020: (1,25), 2021: (2,12), 2022: (2,1),
    2023: (1,22), 2024: (2,10), 2025: (1,29), 2026: (2,17), 2027: (2,6),
    2028: (1,26), 2029: (2,13), 2030: (2,3), 2100: (2,9),
}
ny_fail = []
cur = ANCHOR
for y in range(1900, 2101):
    if y > 1900:
        cur += dt.timedelta(days=year_days(y - 1))
    if y in KNOWN_NY and (cur.month, cur.day) != KNOWN_NY[y]:
        ny_fail.append((y, (cur.month, cur.day), KNOWN_NY[y]))
print(f"[1] 春节日期比对: 抽查 {len(KNOWN_NY)} 年, 失败 {len(ny_fail)}")
for f in ny_fail:
    print("    MISMATCH", f)
# 2000-2030 全量(30 年全已知)必须全对
if not any(2000 <= f[0] <= 2030 for f in ny_fail):
    print("    2000-2030 连续 31 年春节日期全部正确")

# ---------- 2. 闰月验证 ----------
KNOWN_LEAP = {
    1900: 8, 1903: 5, 1906: 4, 1909: 2, 1911: 6, 1914: 5, 1917: 2, 1919: 7,
    1922: 5, 1925: 4, 1928: 2, 1930: 6, 1933: 5, 1936: 3, 1941: 6,
    1944: 4, 1947: 2, 1949: 7, 1952: 5, 1955: 3, 1957: 8, 1960: 6, 1963: 4,
    1966: 3, 1968: 7, 1971: 5, 1974: 4, 1976: 8, 1979: 6, 1982: 4, 1984: 10,
    1987: 6, 1990: 5, 1993: 3, 1995: 8, 1998: 5, 2001: 4, 2004: 2, 2006: 7,
    2009: 5, 2012: 4, 2014: 9, 2017: 6, 2020: 4, 2023: 2, 2025: 6,
}
leap_fail = [(y, leap_month(y), KNOWN_LEAP[y]) for y in KNOWN_LEAP if leap_month(y) != KNOWN_LEAP[y]]
print(f"[2] 闰月比对: 抽查 {len(KNOWN_LEAP)} 年, 失败 {len(leap_fail)}")
for f in leap_fail:
    print("    MISMATCH", f)

# ---------- 3. 日干支验证(锚点法) ----------
GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"
def ganzhi_of_date(d):  # 锚点: 2000-01-07 甲子日
    idx = (d - dt.date(2000, 1, 7)).days % 60
    return GAN[idx % 10] + ZHI[idx % 12]
KNOWN_GZ = {
    dt.date(1949, 10, 1): "甲子",   # 开国大典, 历史确证甲子日
    dt.date(2000, 1, 7): "甲子",   # 锚点
    dt.date(2024, 2, 10): "甲辰",  # 甲辰年春节
    dt.date(2025, 1, 29): "戊戌",
    dt.date(2026, 8, 4): "庚戌",
    dt.date(2018, 2, 16): "己卯",  # 2018 春节
}
gz_fail = [(d, ganzhi_of_date(d), KNOWN_GZ[d]) for d in KNOWN_GZ if ganzhi_of_date(d) != KNOWN_GZ[d]]
print(f"[3] 日干支比对: 抽查 {len(KNOWN_GZ)} 个日期, 失败 {len(gz_fail)}")
for f in gz_fail:
    print("    MISMATCH", f)

# ---------- 4. 2026-08-04 农历日期推算 ----------
def lunar_of_date(d):
    # 返回 (农历年, 月, 日, 闰月标志)
    if d < ANCHOR or d >= dt.date(2101, 1, 1):
        raise ValueError("out of range")
    offset = (d - ANCHOR).days
    y = 1900
    while offset >= year_days(y):
        offset -= year_days(y)
        y += 1
    lm = leap_month(y)
    for m in range(1, 13):
        md = month_days(y, m)
        if offset < md:
            return (y, m, offset + 1, False)
        offset -= md
        if m == lm:
            ld = leap_days(y)
            if offset < ld:
                return (y, m, offset + 1, True)
            offset -= ld
    raise AssertionError("should not reach")

for d in [dt.date(2026, 8, 4), dt.date(2024, 2, 10), dt.date(2025, 1, 29), dt.date(2000, 1, 7)]:
    print("    lunar", d, "->", lunar_of_date(d))
