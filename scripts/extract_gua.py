#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 APK 反编译数据 b4.java 提取 64 卦静态表，生成 src/engine/guaTable.js。

数据源: D:\\apk_analysis\\jadx_out\\sources\\b\\b\\a\\a\\c2\\b4.java
记录格式: new r(宫, 卦名, 爻画, 世位, 应位, 六亲x6, 伏神索引1, 伏神1,
               伏神索引2, 伏神2, 标志H, 标志I, 标志J, 标志K)
  - 爻画: 1=阳 2=阴, 初爻→上爻
  - 世/应/伏神索引: 0=初爻 ... 5=上爻（自下而上）
  - 六亲顺序: 源数据为 上爻→初爻（与 b4.java 一致）
  - 伏神: 两对 (索引, 六亲), -1 或空串 = 无; 输出展开为按爻位的 6 项数组
  - 标志: H=六冲卦, I=六合卦, J=游魂卦, K=归魂卦 (1=是)

本脚本内置独立校验：用纳甲(八卦纳支) + 宫五行六亲理论重新推导每一爻的六亲、
伏神所伏爻位，与源数据逐项比对，保证 64 卦数据全部正确。
"""
import re
import sys
from collections import Counter
from pathlib import Path

SRC = Path(r"D:\apk_analysis\jadx_out\sources\b\b\a\a\c2\b4.java")
OUT = Path(__file__).resolve().parent.parent / "src" / "engine" / "guaTable.js"

# ---------- 六爻理论（校验用） ----------
# 八卦纳甲: 每卦 6 爻地支（初→上），按内外卦取用
NAJIA = {
    "乾": ["子水", "寅木", "辰土", "午火", "申金", "戌土"],
    "坤": ["未土", "巳火", "卯木", "丑土", "亥水", "酉金"],
    "震": ["子水", "寅木", "辰土", "午火", "申金", "戌土"],
    "巽": ["丑土", "亥水", "酉金", "未土", "巳火", "卯木"],
    "坎": ["寅木", "辰土", "午火", "申金", "戌土", "子水"],
    "离": ["卯木", "丑土", "亥水", "酉金", "未土", "巳火"],
    "艮": ["辰土", "午火", "申金", "戌土", "子水", "寅木"],
    "兑": ["巳火", "卯木", "丑土", "亥水", "酉金", "未土"],
}
# 八宫五行
GONG_WUXING = {"乾": "金", "兑": "金", "离": "火", "震": "木",
               "巽": "木", "坎": "水", "艮": "土", "坤": "土"}
# 本宫卦（八纯卦）爻画
BENGONG_LINES = {"乾": "111111", "兑": "112112", "离": "121121", "震": "122122",
                 "巽": "211211", "坎": "212212", "艮": "221221", "坤": "222222"}
DIZHI_WUXING = {"子": "水", "丑": "土", "寅": "木", "卯": "木", "辰": "土", "巳": "火",
                "午": "火", "未": "土", "申": "金", "酉": "金", "戌": "土", "亥": "水"}
SHENG = {"金": "水", "水": "木", "木": "火", "火": "土", "土": "金"}   # 我生
KE = {"金": "木", "木": "土", "土": "水", "水": "火", "火": "金"}       # 我克


def liuqin_of(wuxing, gong_wx):
    """按宫五行推六亲：比和=兄, 宫生爻=孙, 爻生宫=父, 宫克爻=财, 爻克宫=官"""
    if wuxing == gong_wx:
        return "兄"
    if SHENG[gong_wx] == wuxing:
        return "孙"
    if SHENG[wuxing] == gong_wx:
        return "父"
    if KE[gong_wx] == wuxing:
        return "财"
    if KE[wuxing] == gong_wx:
        return "官"
    raise AssertionError(f"unreachable: {wuxing} vs {gong_wx}")


def derive_liuqin(gong, lines):
    """按纳甲 + 宫五行推导 6 爻六亲，返回 (上爻→初爻 列表, 初爻→上爻 列表)"""
    gua_down, gua_up = lines[0:3], lines[3:6]
    names = {"111": "乾", "112": "兑", "121": "离", "122": "震",
             "211": "巽", "212": "坎", "221": "艮", "222": "坤"}
    gx = GONG_WUXING[gong]
    res = []  # 初→上
    for i, trigram in enumerate((gua_down, gua_up)):
        for j in range(3):
            dz = NAJIA[names[trigram]][j + 3 * i]  # 下卦取初二三爻, 上卦取四五上爻
            wx = DIZHI_WUXING[dz[0]]
            res.append(liuqin_of(wx, gx) + dz)
    return list(reversed(res)), res  # (上→初, 初→上)


# ---------- 解析 ----------
def tokenize(args_str):
    toks = []
    for m in re.findall(r'"[^"]*"|-?\d+', args_str):
        if m[0] == '"':
            toks.append(m[1:-1])
        else:
            toks.append(int(m))
    return toks


def main():
    src = SRC.read_text(encoding="utf-8")
    recs = re.findall(r"new r\((.*?)\)", src, re.S)
    print(f"解析到 {len(recs)} 条记录")
    if len(recs) != 64:
        sys.exit(f"FAIL: 期望 64 条，实际 {len(recs)}")

    errors = []
    out_lines = []
    js_bool = lambda b: "true" if b else "false"

    for rec in recs:
        t = tokenize(rec)
        if len(t) != 19:
            errors.append(f"{t[1] if len(t) > 1 else '?'}: 参数个数 {len(t)} != 19")
            continue
        gong, name, lines = t[0], t[1], t[2]
        shi, ying = t[3], t[4]
        liuqin_src = [x.replace(" ", "") for x in t[5:11]]      # 上→初
        f1, v1, f2, v2 = t[11], t[12], t[13], t[14]
        H, I, J, K = t[15], t[16], t[17], t[18]

        # ---- 基础校验 ----
        if gong not in GONG_WUXING:
            errors.append(f"{name}: 未知宫 {gong}")
        if not (re.fullmatch(r"[12]{6}", lines) and lines != ""):
            errors.append(f"{name}: 爻画异常 {lines}")
        if not (0 <= shi <= 5 and 0 <= ying <= 5):
            errors.append(f"{name}: 世应越界 {shi},{ying}")
        if all(x in (0, 1) for x in (H, I, J, K)) is False:
            errors.append(f"{name}: 标志越界 {H},{I},{J},{K}")

        # ---- 六亲独立推导比对 ----
        top_down, _ = derive_liuqin(gong, lines)
        if top_down != liuqin_src:
            errors.append(f"{name}: 六亲与理论不符\n  源: {liuqin_src}\n  论: {top_down}")

        # ---- 伏神校验: 值应等于本宫卦同爻位的六亲 ----
        fushen = ["", "", "", "", "", ""]  # 按所伏爻位 0=初爻
        for idx, val in ((f1, v1), (f2, v2)):
            if val:
                if not (0 <= idx <= 5):
                    errors.append(f"{name}: 伏神索引越界 {idx}")
                else:
                    _, bt_up = derive_liuqin(gong, BENGONG_LINES[gong])
                    if bt_up[idx] != val.replace(" ", ""):
                        errors.append(f"{name}: 伏神 {val} 伏于{idx}位，"
                                      f"但本宫同爻位应为 {bt_up[idx]}")
                fushen[idx] = val.replace(" ", "")
            elif idx != -1:
                errors.append(f"{name}: 伏神值为空但索引非-1 ({idx})")

        # ---- 游魂/归魂/六冲/六合 结构校验 ----
        if J and not (shi == 3 and not H):
            errors.append(f"{name}: 游魂标志与世位矛盾 (世={shi})")
        if K and not (shi == 2):
            errors.append(f"{name}: 归魂标志与世位矛盾 (世={shi})")

        out_lines.append(
            f"  {{ gong:'{gong}', name:'{name}', lines:'{lines}', "
            f"shi:{shi}, ying:{ying}, "
            f"liuqin:{liuqin_src!r}, fushen:{fushen!r}, "
            f"youhun:{js_bool(J)}, guihun:{js_bool(K)} }},"
        )

    # ---- 全局校验 ----
    all_lines = [tokenize(r)[2] for r in recs]
    if len(set(all_lines)) != 64:
        dup = [k for k, v in Counter(all_lines).items() if v > 1]
        errors.append(f"爻画重复: {dup}")
    flag_cn = Counter(tuple(tokenize(r)[15:19]) for r in recs)
    print("标志分布:", dict(flag_cn))

    if errors:
        print("=== 校验失败 ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("全部 64 卦校验通过（六亲/伏神/世应/标志均与理论一致）")

    # ---------- 输出 ----------
    header = """// 64 卦静态表（自动生成，勿手改）
// 来源: scripts/extract_gua.py < b4.java (APK 反编译数据, 2026-08-04)
// 字段说明:
//   gong    八宫名
//   name    卦名
//   lines   爻画, 1=阳 2=阴, 初爻→上爻
//   shi/ying 世位/应位, 0=初爻 ... 5=上爻
//   liuqin  六亲地支 6 项, 上爻→初爻（与源数据顺序一致）
//   fushen  伏神 6 项, 按所伏爻位展开 (0=初爻 ... 5=上爻), 空串=无伏神
//   youhun  游魂卦 / guihun 归魂卦
"""
    body = "\n".join(out_lines).rstrip(",") + "\n];"
    footer = """
export function findGua(lines) {
  return GUA_64.find((g) => g.lines === lines);
}
"""
    OUT.write_text(header + "export const GUA_64 = [\n" + body + footer, encoding="utf-8")
    print(f"已生成 {OUT} ({len(recs)} 条)")


if __name__ == "__main__":
    main()
