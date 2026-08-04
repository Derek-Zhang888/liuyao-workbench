// 64 卦静态表（自动生成，勿手改）
// 纳甲数据依据传统术数八宫纳甲规则整理（2026-08-04）
// 字段说明:
//   gong    八宫名
//   name    卦名
//   lines   爻画, 1=阳 2=阴, 初爻→上爻
//   shi/ying 世位/应位, 0=初爻 ... 5=上爻
//   liuqin  六亲地支 6 项, 上爻→初爻（与源数据顺序一致）
//   fushen  伏神 6 项, 按所伏爻位展开 (0=初爻 ... 5=上爻), 空串=无伏神
//   youhun  游魂卦 / guihun 归魂卦
export const GUA_64 = [
  { gong:'乾', name:'乾为天', lines:'111111', shi:5, ying:2, liuqin:['父戌土', '兄申金', '官午火', '父辰土', '财寅木', '孙子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'乾', name:'天风姤', lines:'211111', shi:0, ying:3, liuqin:['父戌土', '兄申金', '官午火', '兄酉金', '孙亥水', '父丑土'], fushen:['', '财寅木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'乾', name:'天山遁', lines:'221111', shi:1, ying:4, liuqin:['父戌土', '兄申金', '官午火', '兄申金', '官午火', '父辰土'], fushen:['孙子水', '财寅木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'乾', name:'天地否', lines:'222111', shi:2, ying:5, liuqin:['父戌土', '兄申金', '官午火', '财卯木', '官巳火', '父未土'], fushen:['孙子水', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'乾', name:'风地观', lines:'222211', shi:3, ying:0, liuqin:['财卯木', '官巳火', '父未土', '财卯木', '官巳火', '父未土'], fushen:['孙子水', '', '', '', '兄申金', ''], youhun:false, guihun:false },
  { gong:'乾', name:'山地剥', lines:'222221', shi:4, ying:1, liuqin:['财寅木', '孙子水', '父戌土', '财卯木', '官巳火', '父未土'], fushen:['', '', '', '', '兄申金', ''], youhun:false, guihun:false },
  { gong:'乾', name:'火地晋', lines:'222121', shi:3, ying:0, liuqin:['官巳火', '父未土', '兄酉金', '财卯木', '官巳火', '父未土'], fushen:['孙子水', '', '', '', '', ''], youhun:true, guihun:false },
  { gong:'乾', name:'火天大有', lines:'111121', shi:2, ying:5, liuqin:['官巳火', '父未土', '兄酉金', '父辰土', '财寅木', '孙子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:true },
  { gong:'兑', name:'兑为泽', lines:'112112', shi:5, ying:2, liuqin:['父未土', '兄酉金', '孙亥水', '父丑土', '财卯木', '官巳火'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'泽水困', lines:'212112', shi:0, ying:3, liuqin:['父未土', '兄酉金', '孙亥水', '官午火', '父辰土', '财寅木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'泽地萃', lines:'222112', shi:1, ying:4, liuqin:['父未土', '兄酉金', '孙亥水', '财卯木', '官巳火', '父未土'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'泽山咸', lines:'221112', shi:2, ying:5, liuqin:['父未土', '兄酉金', '孙亥水', '兄申金', '官午火', '父辰土'], fushen:['', '财卯木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'水山蹇', lines:'221212', shi:3, ying:0, liuqin:['孙子水', '父戌土', '兄申金', '兄申金', '官午火', '父辰土'], fushen:['', '财卯木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'地山谦', lines:'221222', shi:4, ying:1, liuqin:['兄酉金', '孙亥水', '父丑土', '兄申金', '官午火', '父辰土'], fushen:['', '财卯木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'兑', name:'雷山小过', lines:'221122', shi:3, ying:0, liuqin:['父戌土', '兄申金', '官午火', '兄申金', '官午火', '父辰土'], fushen:['', '财卯木', '', '孙亥水', '', ''], youhun:true, guihun:false },
  { gong:'兑', name:'雷泽归妹', lines:'112122', shi:2, ying:5, liuqin:['父戌土', '兄申金', '官午火', '父丑土', '财卯木', '官巳火'], fushen:['', '', '', '孙亥水', '', ''], youhun:false, guihun:true },
  { gong:'离', name:'离为火', lines:'121121', shi:5, ying:2, liuqin:['兄巳火', '孙未土', '财酉金', '官亥水', '孙丑土', '父卯木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'火山旅', lines:'221121', shi:0, ying:3, liuqin:['兄巳火', '孙未土', '财酉金', '财申金', '兄午火', '孙辰土'], fushen:['父卯木', '', '官亥水', '', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'火风鼎', lines:'211121', shi:1, ying:4, liuqin:['兄巳火', '孙未土', '财酉金', '财酉金', '官亥水', '孙丑土'], fushen:['父卯木', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'火水未济', lines:'212121', shi:2, ying:5, liuqin:['兄巳火', '孙未土', '财酉金', '兄午火', '孙辰土', '父寅木'], fushen:['', '', '官亥水', '', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'山水蒙', lines:'212221', shi:3, ying:0, liuqin:['父寅木', '官子水', '孙戌土', '兄午火', '孙辰土', '父寅木'], fushen:['', '', '', '财酉金', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'风水涣', lines:'212211', shi:4, ying:1, liuqin:['父卯木', '兄巳火', '孙未土', '兄午火', '孙辰土', '父寅木'], fushen:['', '', '官亥水', '财酉金', '', ''], youhun:false, guihun:false },
  { gong:'离', name:'天水讼', lines:'212111', shi:3, ying:0, liuqin:['孙戌土', '财申金', '兄午火', '兄午火', '孙辰土', '父寅木'], fushen:['', '', '官亥水', '', '', ''], youhun:true, guihun:false },
  { gong:'离', name:'天火同人', lines:'121111', shi:2, ying:5, liuqin:['孙戌土', '财申金', '兄午火', '官亥水', '孙丑土', '父卯木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:true },
  { gong:'震', name:'震为雷', lines:'122122', shi:5, ying:2, liuqin:['财戌土', '官申金', '孙午火', '财辰土', '兄寅木', '父子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'雷地豫', lines:'222122', shi:0, ying:3, liuqin:['财戌土', '官申金', '孙午火', '兄卯木', '孙巳火', '财未土'], fushen:['父子水', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'雷水解', lines:'212122', shi:1, ying:4, liuqin:['财戌土', '官申金', '孙午火', '孙午火', '财辰土', '兄寅木'], fushen:['父子水', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'雷风恒', lines:'211122', shi:2, ying:5, liuqin:['财戌土', '官申金', '孙午火', '官酉金', '父亥水', '财丑土'], fushen:['', '兄寅木', '', '', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'地风升', lines:'211222', shi:3, ying:0, liuqin:['官酉金', '父亥水', '财丑土', '官酉金', '父亥水', '财丑土'], fushen:['', '兄寅木', '', '孙午火', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'水风井', lines:'211212', shi:4, ying:1, liuqin:['父子水', '财戌土', '官申金', '官酉金', '父亥水', '财丑土'], fushen:['', '兄寅木', '', '孙午火', '', ''], youhun:false, guihun:false },
  { gong:'震', name:'泽风大过', lines:'211112', shi:3, ying:0, liuqin:['财未土', '官酉金', '父亥水', '官酉金', '父亥水', '财丑土'], fushen:['', '兄寅木', '', '孙午火', '', ''], youhun:true, guihun:false },
  { gong:'震', name:'泽雷随', lines:'122112', shi:2, ying:5, liuqin:['财未土', '官酉金', '父亥水', '财辰土', '兄寅木', '父子水'], fushen:['', '', '', '孙午火', '', ''], youhun:false, guihun:true },
  { gong:'巽', name:'巽为风', lines:'211211', shi:5, ying:2, liuqin:['兄卯木', '孙巳火', '财未土', '官酉金', '父亥水', '财丑土'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'风天小畜', lines:'111211', shi:0, ying:3, liuqin:['兄卯木', '孙巳火', '财未土', '财辰土', '兄寅木', '父子水'], fushen:['', '', '官酉金', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'风火家人', lines:'121211', shi:1, ying:4, liuqin:['兄卯木', '孙巳火', '财未土', '父亥水', '财丑土', '兄卯木'], fushen:['', '', '官酉金', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'风雷益', lines:'122211', shi:2, ying:5, liuqin:['兄卯木', '孙巳火', '财未土', '财辰土', '兄寅木', '父子水'], fushen:['', '', '官酉金', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'天雷无妄', lines:'122111', shi:3, ying:0, liuqin:['财戌土', '官申金', '孙午火', '财辰土', '兄寅木', '父子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'火雷噬嗑', lines:'122121', shi:4, ying:1, liuqin:['孙巳火', '财未土', '官酉金', '财辰土', '兄寅木', '父子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'巽', name:'山雷颐', lines:'122221', shi:3, ying:0, liuqin:['兄寅木', '父子水', '财戌土', '财辰土', '兄寅木', '父子水'], fushen:['', '', '官酉金', '', '孙巳火', ''], youhun:true, guihun:false },
  { gong:'巽', name:'山风蛊', lines:'211221', shi:2, ying:5, liuqin:['兄寅木', '父子水', '财戌土', '官酉金', '父亥水', '财丑土'], fushen:['', '', '', '', '孙巳火', ''], youhun:false, guihun:true },
  { gong:'坎', name:'坎为水', lines:'212212', shi:5, ying:2, liuqin:['兄子水', '官戌土', '父申金', '财午火', '官辰土', '孙寅木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'水泽节', lines:'112212', shi:0, ying:3, liuqin:['兄子水', '官戌土', '父申金', '官丑土', '孙卯木', '财巳火'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'水雷屯', lines:'122212', shi:1, ying:4, liuqin:['兄子水', '官戌土', '父申金', '官辰土', '孙寅木', '兄子水'], fushen:['', '', '财午火', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'水火既济', lines:'121212', shi:2, ying:5, liuqin:['兄子水', '官戌土', '父申金', '兄亥水', '官丑土', '孙卯木'], fushen:['', '', '财午火', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'泽火革', lines:'121112', shi:3, ying:0, liuqin:['官未土', '父酉金', '兄亥水', '兄亥水', '官丑土', '孙卯木'], fushen:['', '', '财午火', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'雷火丰', lines:'121122', shi:4, ying:1, liuqin:['官戌土', '父申金', '财午火', '兄亥水', '官丑土', '孙卯木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坎', name:'地火明夷', lines:'121222', shi:3, ying:0, liuqin:['父酉金', '兄亥水', '官丑土', '兄亥水', '官丑土', '孙卯木'], fushen:['', '', '财午火', '', '', ''], youhun:true, guihun:false },
  { gong:'坎', name:'地水师', lines:'212222', shi:2, ying:5, liuqin:['父酉金', '兄亥水', '官丑土', '财午火', '官辰土', '孙寅木'], fushen:['', '', '', '', '', ''], youhun:false, guihun:true },
  { gong:'艮', name:'艮为山', lines:'221221', shi:5, ying:2, liuqin:['官寅木', '财子水', '兄戌土', '孙申金', '父午火', '兄辰土'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'艮', name:'山火贲', lines:'121221', shi:0, ying:3, liuqin:['官寅木', '财子水', '兄戌土', '财亥水', '兄丑土', '官卯木'], fushen:['', '父午火', '孙申金', '', '', ''], youhun:false, guihun:false },
  { gong:'艮', name:'山天大畜', lines:'111221', shi:1, ying:4, liuqin:['官寅木', '财子水', '兄戌土', '兄辰土', '官寅木', '财子水'], fushen:['', '父午火', '孙申金', '', '', ''], youhun:false, guihun:false },
  { gong:'艮', name:'山泽损', lines:'112221', shi:2, ying:5, liuqin:['官寅木', '财子水', '兄戌土', '兄丑土', '官卯木', '父巳火'], fushen:['', '', '孙申金', '', '', ''], youhun:false, guihun:false },
  { gong:'艮', name:'火泽睽', lines:'112121', shi:3, ying:0, liuqin:['父巳火', '兄未土', '孙酉金', '兄丑土', '官卯木', '父巳火'], fushen:['', '', '', '', '财子水', ''], youhun:false, guihun:false },
  { gong:'艮', name:'天泽履', lines:'112111', shi:4, ying:1, liuqin:['兄戌土', '孙申金', '父午火', '兄丑土', '官卯木', '父巳火'], fushen:['', '', '', '', '财子水', ''], youhun:false, guihun:false },
  { gong:'艮', name:'风泽中孚', lines:'112211', shi:3, ying:0, liuqin:['官卯木', '父巳火', '兄未土', '兄丑土', '官卯木', '父巳火'], fushen:['', '', '孙申金', '', '财子水', ''], youhun:true, guihun:false },
  { gong:'艮', name:'风山渐', lines:'221211', shi:2, ying:5, liuqin:['官卯木', '父巳火', '兄未土', '孙申金', '父午火', '兄辰土'], fushen:['', '', '', '', '财子水', ''], youhun:false, guihun:true },
  { gong:'坤', name:'坤为地', lines:'222222', shi:5, ying:2, liuqin:['孙酉金', '财亥水', '兄丑土', '官卯木', '父巳火', '兄未土'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'地雷复', lines:'122222', shi:0, ying:3, liuqin:['孙酉金', '财亥水', '兄丑土', '兄辰土', '官寅木', '财子水'], fushen:['', '父巳火', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'地泽临', lines:'112222', shi:1, ying:4, liuqin:['孙酉金', '财亥水', '兄丑土', '兄丑土', '官卯木', '父巳火'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'地天泰', lines:'111222', shi:2, ying:5, liuqin:['孙酉金', '财亥水', '兄丑土', '兄辰土', '官寅木', '财子水'], fushen:['', '父巳火', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'雷天大壮', lines:'111122', shi:3, ying:0, liuqin:['兄戌土', '孙申金', '父午火', '兄辰土', '官寅木', '财子水'], fushen:['', '', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'泽天夬', lines:'111112', shi:4, ying:1, liuqin:['兄未土', '孙酉金', '财亥水', '兄辰土', '官寅木', '财子水'], fushen:['', '父巳火', '', '', '', ''], youhun:false, guihun:false },
  { gong:'坤', name:'水天需', lines:'111212', shi:3, ying:0, liuqin:['财子水', '兄戌土', '孙申金', '兄辰土', '官寅木', '财子水'], fushen:['', '父巳火', '', '', '', ''], youhun:true, guihun:false },
  { gong:'坤', name:'水地比', lines:'222212', shi:2, ying:5, liuqin:['财子水', '兄戌土', '孙申金', '官卯木', '父巳火', '兄未土'], fushen:['', '', '', '', '', ''], youhun:false, guihun:true }
];
export function findGua(lines) {
  return GUA_64.find((g) => g.lines === lines);
}
