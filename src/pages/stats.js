/**
 * 统计纯函数（Task 11 / v0.2 功能 H / v1.3.0 取数反馈改版）
 *
 * computeStats(guashiList) → 总览 + 三维度对错计数与正确率 + 取数三档
 *   - total/fed/unfed/pending：总数 / 已反馈 / 待反馈 / 待占断
 *   - v1.3.0 三态口径（拍板 2026-08-13，与卦例库筛选/卡片/编辑页一致）：
 *       已反馈 fed  = fankui 文本框非空（⇔ status='已反馈'）
 *       待反馈 unfed = 五者（断语/应期/方位/取数/吉凶）任一非空 且 fankui 空
 *       待占断 pending = 五者全空
 *       （旧口径：pending=jixiong 未选、unfed=jixiong 非空且 status 未反馈，已废弃）
 *   - 仅统计已反馈卦例的对错；各维度按 '对'/'错' 计数（取数按三档 神准/相近/错），
 *     ''（未记录）不计入（不摊薄正确率）
 *   - rate = ok / (ok + bad)；该维度无数据时 null（UI 显示"暂无数据"）
 *   - 取数双口径：qsRate = 神准÷(神准+相近+错)；qsRate2 = (神准+相近)÷(神准+相近+错)
 *
 * wrongDims(guashi) → 各维度是否"错"（含取数 qushu，兼容旧调用方）
 */
export const DIM_FIELDS = [
  { key: 'jixiong', label: '吉凶', field: 'jixiongOk' },
  { key: 'yingqi', label: '应期', field: 'yingqiOk' },
  { key: 'fangwei', label: '方位', field: 'fangweiOk' },
]

/** v1.3.0 取数三档（顺序固定：神准/相近/错） */
export const QSHU_LEVELS = ['神准', '相近', '错']

/** v1.3.0 五者（断语/应期/方位/取数/吉凶）任一非空 = 已有占断内容（与卦例库/卡片同口径） */
export function hasDuanContent(g) {
  return !!(
    (g?.duanyu ?? '').trim() ||
    (g?.yingqi ?? '').trim() ||
    (g?.fangwei ?? '').trim() ||
    (g?.quShu ?? '').trim() ||
    (g?.jixiong ?? '')
  )
}

/** 单个维度的对/错计数 + 正确率（无数据时 rate=null） */
function dimCount(list, field) {
  let ok = 0
  let bad = 0
  for (const g of list) {
    if (g?.[field] === '对') ok++
    else if (g?.[field] === '错') bad++
  }
  return { ok, bad, rate: ok + bad > 0 ? ok / (ok + bad) : null }
}

/**
 * 统计卦例列表（纯函数，不改动入参）
 * @param {Array<object>} guashiList 卦例记录列表
 * @returns {{total:number, fed:number, unfed:number, pending:number,
 *   jxOk:number, jxBad:number, jxRate:(number|null),
 *   yqOk:number, yqBad:number, yqRate:(number|null),
 *   fwOk:number, fwBad:number, fwRate:(number|null),
 *   qsSz:number, qsXj:number, qsCuo:number, qsRate:(number|null), qsRate2:(number|null)}}
 */
export function computeStats(guashiList = []) {
  const list = Array.isArray(guashiList) ? guashiList : []
  const total = list.length
  // v1.3.0 三态口径：已反馈 = fankui 非空（status 为 fankui 的派生）；
  // 待反馈/待占断须 fankui 也为空（已反馈不落入两者，三态互斥）
  const fedList = list.filter((g) => !!((g?.fankui ?? '').trim()))
  const fed = fedList.length
  const pending = list.filter((g) => !hasDuanContent(g) && !((g?.fankui ?? '').trim())).length
  const unfed = list.filter((g) => hasDuanContent(g) && !((g?.fankui ?? '').trim())).length

  const jx = dimCount(fedList, 'jixiongOk')
  const yq = dimCount(fedList, 'yingqiOk')
  const fw = dimCount(fedList, 'fangweiOk')

  // 取数三档计数 + 双口径（神准率 / 神准+相近率）；分母 = 三档已勾选总数
  let qsSz = 0
  let qsXj = 0
  let qsCuo = 0
  for (const g of fedList) {
    if (g?.quShuFb === '神准') qsSz++
    else if (g?.quShuFb === '相近') qsXj++
    else if (g?.quShuFb === '错') qsCuo++
  }
  const qsDenom = qsSz + qsXj + qsCuo
  const qsRate = qsDenom > 0 ? qsSz / qsDenom : null
  const qsRate2 = qsDenom > 0 ? (qsSz + qsXj) / qsDenom : null

  return {
    total,
    fed,
    unfed,
    pending, // v1.3.0：待占断（五者全空）
    jxOk: jx.ok,
    jxBad: jx.bad,
    jxRate: jx.rate,
    yqOk: yq.ok,
    yqBad: yq.bad,
    yqRate: yq.rate,
    fwOk: fw.ok,
    fwBad: fw.bad,
    fwRate: fw.rate,
    qsSz, // 神准
    qsXj, // 相近
    qsCuo, // 错
    qsRate, // 神准率（神准÷三档总数）
    qsRate2, // 神准+相近率（(神准+相近)÷三档总数）
  }
}

/**
 * 卦例各维度错误情况（错题本判定用；v1.3.0 追加取数 qushu）
 * @param {object} g 卦例记录
 * @returns {{jixiong:boolean, yingqi:boolean, fangwei:boolean, qushu:boolean}}
 */
export function wrongDims(g) {
  return {
    jixiong: g?.jixiongOk === '错',
    yingqi: g?.yingqiOk === '错',
    fangwei: g?.fangweiOk === '错',
    qushu: g?.quShuFb === '错', // v1.3.0 取数反馈「错」
  }
}
