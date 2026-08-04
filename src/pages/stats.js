/**
 * 统计纯函数（Task 11）
 *
 * computeStats(guashiList) → 总览 + 三维度对错计数与正确率
 *   - total/fed/unfed：总数 / 已反馈 / 未反馈
 *   - 仅统计 status='已反馈' 的卦例；各维度按 '对'/'错' 计数，
 *     ''（未记录）与 '留空' 均不计入（不摊薄正确率）
 *   - rate = ok / (ok + bad)；该维度无对错数据时为 null（UI 显示"暂无数据"）
 *
 * wrongDims(guashi) → 各维度是否"错"（错题本筛选用）
 */
export const DIM_FIELDS = [
  { key: 'jixiong', label: '吉凶', field: 'jixiongOk' },
  { key: 'yingqi', label: '应期', field: 'yingqiOk' },
  { key: 'fangwei', label: '方位', field: 'fangweiOk' },
]

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
 * @returns {{total:number, fed:number, unfed:number,
 *   jxOk:number, jxBad:number, jxRate:(number|null),
 *   yqOk:number, yqBad:number, yqRate:(number|null),
 *   fwOk:number, fwBad:number, fwRate:(number|null)}}
 */
export function computeStats(guashiList = []) {
  const list = Array.isArray(guashiList) ? guashiList : []
  const total = list.length
  const fedList = list.filter((g) => g?.status === '已反馈')
  const fed = fedList.length

  const jx = dimCount(fedList, 'jixiongOk')
  const yq = dimCount(fedList, 'yingqiOk')
  const fw = dimCount(fedList, 'fangweiOk')

  return {
    total,
    fed,
    unfed: total - fed,
    jxOk: jx.ok,
    jxBad: jx.bad,
    jxRate: jx.rate,
    yqOk: yq.ok,
    yqBad: yq.bad,
    yqRate: yq.rate,
    fwOk: fw.ok,
    fwBad: fw.bad,
    fwRate: fw.rate,
  }
}

/**
 * 卦例各维度错误情况（错题本判定用）
 * @param {object} g 卦例记录
 * @returns {{jixiong:boolean, yingqi:boolean, fangwei:boolean}}
 */
export function wrongDims(g) {
  return {
    jixiong: g?.jixiongOk === '错',
    yingqi: g?.yingqiOk === '错',
    fangwei: g?.fangweiOk === '错',
  }
}
