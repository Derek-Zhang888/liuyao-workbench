/**
 * 占断输入区（Task 9 / v0.2 功能 D / v1.3.0 取数反馈改版）
 *
 * 受控组件：value = {
 *   background,                        // v0.2 新增：占问背景（卦题→背景→断语 顺序）
 *   duanyu, yingqi, fangwei, quShu,   // 断语 / 应期 / 方位 / 取数（v1.3.0 新增，方位下方）
 *   beizhu, fankui,                   // 笔记（UI 标签为「笔记」）/ 反馈
 *   jixiong: '' | '吉' | '凶',        // 吉凶勾选（v0.2 功能 H 非必选，未选保存为「待占断」）
 *   status: '未反馈' | '已反馈',       // v1.3.0：由 fankui 文本框双向自动联动
 *   jixiongOk / yingqiOk / fangweiOk: '' | '对' | '错',   // 对错记录（按对应文本框启用）
 *   quShuFb: '' | '神准' | '相近' | '错',                  // v1.3.0：取数反馈三档（原「甚远」改「错」）
 * }
 *
 * v1.3.0 三态口径（拍板 2026-08-13）：
 *   已反馈 = fankui 文本框非空（⇔ status='已反馈'，双向自动联动：有内容自动开启，清空自动回退）
 *   fankui 空 → 待反馈 = 五者（断语/应期/方位/取数/吉凶）任一非空；待占断 = 五者全空
 *
 * 反馈项启用（对应文本框非空才可用）：jixiongOk↔jixiong、yingqiOk↔yingqi、
 *   fangweiOk↔fangwei、quShuFb↔quShu；断语无反馈项。
 *
 * 联动处理点（拍板）：
 *   ① 文本框清空 → 自动清对应反馈项（防残留污染统计）
 *   ② 取消吉凶不再动 status（status 只由 fankui 管；旧 v0.10 逻辑已废弃）
 *   ③ 保存校验合并为方案 a 一道（见 validateDuanSave，PaipanPage/GuashiLibPage 复用）
 *   ④ 吉凶对错从「必选」改「可用」
 */

import { useEffect, useLayoutEffect, useRef } from 'react'

const textAreaCls =
  'w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold'

/** 占断文本框高度惰性记忆（v1.2.0 Bug1）：手动下拉扩长后切页/重挂载保持；
 *  sessionStorage 三端各自本地，行为一致（三端同步 = 惰性语义一致） */
const DUAN_H_KEY = 'liuyao-duan-h'

function readDuanHeights() {
  try {
    const raw = sessionStorage.getItem(DUAN_H_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') return v
    }
  } catch (_) { /* 解析失败按空 */ }
  return {}
}

function saveDuanHeight(field, height) {
  if (!Number.isFinite(height) || height <= 0) return
  try {
    const v = readDuanHeights()
    v[field] = Math.round(height)
    sessionStorage.setItem(DUAN_H_KEY, JSON.stringify(v))
  } catch (_) { /* 静默 */ }
}

const pillCls = (active) =>
  `rounded-md border px-3 py-1 text-sm transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
  }`

/**
 * v1.3.0 已反馈保存校验（方案 a，唯一硬校验，拍板 2026-08-13）：
 *   status=已反馈 必须四者（吉凶对错/应期对错/方位对错/取数反馈）≥1，全部拦截含存量；
 *   校验 A（五者全空拦）并入 B：五者全空 ⇒ 四者全空被本校验覆盖——防死锁：只填断语时四者全禁用。
 * @param {object} d 占断字段对象
 * @returns {string} 校验通过返回 ''，否则返回错误提示文案
 */
export function validateDuanSave(d) {
  if ((d?.status ?? '') !== '已反馈') return ''
  if (d?.jixiongOk || d?.yingqiOk || d?.fangweiOk || d?.quShuFb) return ''
  return '请至少选择一项反馈结果（吉凶对错/应期对错/方位对错/取数反馈）；若该维度未填写，请先补充吉凶/应期/方位/取数'
}

/**
 * 对/错（或三档）单选行（v0.10 建议4 #2 去掉留空；v1.3.0 支持禁用 + 三档选项 + 提示；
 * 拍板 2026-08-14：点击已选中的选项 → 取消选中（传 ''，可再点重新选择）；disabled 时不可点）。
 * @param {string[]} options 选项列表（默认 ['对','错']；取数三档 ['神准','相近','错']）
 */
function DuiCuoRow({ label, value, onChange, options = ['对', '错'], disabled = false, hint = '' }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === o ? '' : o)}
          title={`${label}${o}`}
          className={`${pillCls(!disabled && value === o)} ${
            disabled ? 'cursor-not-allowed opacity-40' : ''
          }`}
        >
          {o}
        </button>
      ))}
      {disabled && hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export default function DuanInput({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const fed = value.status === '已反馈'

  // ---- 文本框高度惰性（v1.2.0 Bug1）：挂载时恢复上次手动 resize 的高度；
  // 松开（pointerup）时记录当前高度；React 不管理 style.height，重渲染不覆盖。 ----
  const taRefs = useRef({})
  const taRef = (field) => (el) => { taRefs.current[field] = el }
  useLayoutEffect(() => {
    const saved = readDuanHeights()
    for (const [f, h] of Object.entries(saved)) {
      const el = taRefs.current[f]
      if (el && Number(h) > 30) el.style.height = `${Number(h)}px`
    }
  }, [])
  /** 文本框指针松开 → 记录高度（resize 手柄拖完触发） */
  const recordH = (field) => () => {
    const el = taRefs.current[field]
    if (el) saveDuanHeight(field, el.offsetHeight)
  }

  // ---- v1.3.0 口径迁移（挂载一次）：存量 status='已反馈' 但 fankui 空 → 自动纠正为未反馈
  // + 清空四个反馈项（脏数据编辑即修正，避免误拦保存校验；含存量迁移） ----
  const mountedRef = useRef(false)
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    if (value.status === '已反馈' && !(value.fankui ?? '').trim()) {
      onChange({
        ...value,
        status: '未反馈',
        jixiongOk: '',
        yingqiOk: '',
        fangweiOk: '',
        quShuFb: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 反馈文本框（v1.3.0 三态联动）：非空 → status 自动已反馈；清空 → status 回未反馈 + 清四个反馈项 */
  const onFankuiChange = (v) => {
    if ((v ?? '').trim() === '') {
      onChange({
        ...value,
        fankui: v,
        status: '未反馈',
        jixiongOk: '',
        yingqiOk: '',
        fangweiOk: '',
        quShuFb: '',
      })
    } else {
      onChange({ ...value, fankui: v, status: '已反馈' })
    }
  }

  /** 普通文本框（应期/方位/取数）：清空 → 自动清对应反馈项（联动① 防残留污染统计） */
  const onFieldChange = (field, fbField) => (e) => {
    const v = e.target.value
    if (v.trim() === '' && value[fbField]) onChange({ ...value, [field]: v, [fbField]: '' })
    else onChange({ ...value, [field]: v })
  }

  /** 吉凶勾选（联动②：取消吉凶不再动 status，只清 jixiongOk；status 只由 fankui 管） */
  const onJixiong = (g) => {
    const next = value.jixiong === g ? '' : g
    if (next === '' && value.jixiongOk) onChange({ ...value, jixiong: '', jixiongOk: '' })
    else set('jixiong', next)
  }

  // 反馈项可用性（对应文本框非空才可用；断语无反馈项）
  const canJixiong = !!value.jixiong
  const canYingqi = !!(value.yingqi ?? '').trim()
  const canFangwei = !!(value.fangwei ?? '').trim()
  const canQuShu = !!(value.quShu ?? '').trim()

  return (
    <div className="space-y-4">
      {/* 背景（v0.2 功能 D）：卦题→背景→断语 顺序；旧卦例无 background 字段时默认空 */}
      <div>
        <div className="mb-1.5 text-sm text-muted">背景</div>
        <textarea
          ref={taRef('background')}
          onPointerUp={recordH('background')}
          rows={2}
          className={textAreaCls}
          placeholder="占问背景（事由、双方关系、环境等）…"
          value={value.background}
          onChange={(e) => set('background', e.target.value)}
        />
      </div>

      {/* 断语 / 应期 / 方位 / 取数（v0.10 建议5 #1 应期下加方位；v1.3.0 方位下加取数） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">断语</div>
          <textarea
            ref={taRef('duanyu')}
            onPointerUp={recordH('duanyu')}
            rows={4}
            className={textAreaCls}
            placeholder="占断结论…"
            value={value.duanyu}
            onChange={(e) => set('duanyu', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">应期</div>
          <textarea
            ref={taRef('yingqi')}
            onPointerUp={recordH('yingqi')}
            rows={2}
            className={textAreaCls}
            placeholder="应期预测…"
            value={value.yingqi}
            onChange={onFieldChange('yingqi', 'yingqiOk')}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">方位</div>
          <textarea
            ref={taRef('fangwei')}
            onPointerUp={recordH('fangwei')}
            rows={2}
            className={textAreaCls}
            placeholder="方位预测…（有文字时卦例库未反馈卡片显示方位标志）"
            value={value.fangwei}
            onChange={onFieldChange('fangwei', 'fangweiOk')}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">取数</div>
          <textarea
            ref={taRef('quShu')}
            onPointerUp={recordH('quShu')}
            rows={2}
            className={textAreaCls}
            placeholder="数量占应 / 射覆取数…（有文字时卦例库卡片显示「数」标志）"
            value={value.quShu}
            onChange={onFieldChange('quShu', 'quShuFb')}
          />
        </div>
      </div>

      {/* 反馈 / 备注（v0.10 建议4 #6 互换位置：反馈在前） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">反馈</div>
          <textarea
            ref={taRef('fankui')}
            onPointerUp={recordH('fankui')}
            rows={3}
            className={textAreaCls}
            placeholder="实际应验情况…（填写后自动标记为已反馈）"
            value={value.fankui}
            onChange={(e) => onFankuiChange(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">笔记</div>
          <textarea
            ref={taRef('beizhu')}
            onPointerUp={recordH('beizhu')}
            rows={3}
            className={textAreaCls}
            placeholder="笔记…"
            value={value.beizhu}
            onChange={(e) => set('beizhu', e.target.value)}
          />
        </div>
      </div>

      {/* 吉凶：v0.2 功能 H 改为非必选（未选保存为「待占断」）；v0.10 点击已选中项再次点击取消选中
          v1.3.0 联动②：取消吉凶只清 jixiongOk，不再动 status（status 只由 fankui 管） */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">吉凶</span>
        {['吉', '凶'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onJixiong(g)}
            className={pillCls(value.jixiong === g)}
          >
            {g}
          </button>
        ))}
        {value.jixiong && (
          <span className={`text-xs ${value.jixiong === '吉' ? 'text-gold' : 'text-red'}`}>
            {value.jixiong === '吉' ? '大吉之象' : '凶象需防'}
          </span>
        )}
      </div>

      {/* 反馈状态（v1.3.0：status 由 fankui 文本框双向自动联动，无需手动切换按钮） */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">反馈状态</span>
        <span className={`${pillCls(fed)} ${fed ? 'cursor-default' : 'cursor-default'}`}>{fed ? '✓ 已反馈' : '未反馈'}</span>
        <span className="text-xs text-muted">
          {fed ? '已登记反馈结果，可勾选下方对错记录' : '填写「反馈」内容后自动标记为已反馈'}
        </span>
      </div>

      {/* 已反馈 → 对错记录（v1.3.0：各反馈项按对应文本框非空启用；吉凶对错由「必选」改「可用」） */}
      {fed && (
        <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
          <DuiCuoRow
            label="吉凶对错"
            value={value.jixiongOk}
            onChange={(v) => set('jixiongOk', v)}
            disabled={!canJixiong}
            hint={canJixiong ? '' : '需先填写吉凶'}
          />
          <DuiCuoRow
            label="应期对错"
            value={value.yingqiOk}
            onChange={(v) => set('yingqiOk', v)}
            disabled={!canYingqi}
            hint={canYingqi ? '' : '需先填写应期'}
          />
          <DuiCuoRow
            label="方位对错"
            value={value.fangweiOk}
            onChange={(v) => set('fangweiOk', v)}
            disabled={!canFangwei}
            hint={canFangwei ? '' : '需先填写方位'}
          />
          {/* v1.3.0 取数反馈三档（原「甚远」改「错」）：取数文本框非空才可用 */}
          <DuiCuoRow
            label="取数反馈"
            options={['神准', '相近', '错']}
            value={value.quShuFb}
            onChange={(v) => set('quShuFb', v)}
            disabled={!canQuShu}
            hint={canQuShu ? '' : '需先填写取数'}
          />
        </div>
      )}
    </div>
  )
}
