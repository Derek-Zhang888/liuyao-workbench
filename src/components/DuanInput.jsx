/**
 * 占断输入区（Task 9）
 *
 * 受控组件：value = {
 *   duanyu, yingqi, beizhu, fankui,   // 四个文本域
 *   jixiong: '' | '吉' | '凶',        // 吉凶勾选（v0.10 建议4 #2 必选）
 *   status: '未反馈' | '已反馈',       // 反馈状态（默认未反馈）
 *   jixiongOk / yingqiOk / fangweiOk: '' | '对' | '错'  // 建议4 #2 去掉留空；吉凶对错必选、应期方位可选
 * }                                    // 勾选已反馈后展开的对错记录
 *
 * v0.10 建议4 #6：反馈/备注 textarea 位置互换；取消已反馈自动清空三项对错 + 归入未反馈。
 */

import { useEffect, useRef } from 'react'

const textAreaCls =
  'w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold'

const pillCls = (active) =>
  `rounded-md border px-3 py-1 text-sm transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
  }`

/** 对/错 二选行（v0.10 建议4 #2 去掉留空）；不点保持未选，点同一项切换无效 */
function DuiCuoRow({ label, required, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted">
        {label}
        {required && <span className="text-red">*</span>}
      </span>
      {['对', '错'].map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={pillCls(value === o)}>
          {o}
        </button>
      ))}
      {required && !value && <span className="text-xs text-red">必选</span>}
    </div>
  )
}

export default function DuanInput({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const fed = value.status === '已反馈'

  // 取消已反馈：自动清空三项对错并归入未反馈（v0.10 建议4 #6）
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const prevStatusRef = useRef(value.status)
  useEffect(() => {
    if (prevStatusRef.current === '已反馈' && value.status === '未反馈') {
      onChangeRef.current({
        ...value,
        jixiongOk: '',
        yingqiOk: '',
        fangweiOk: '',
      })
    }
    prevStatusRef.current = value.status
  }, [value.status, value])

  return (
    <div className="space-y-4">
      {/* 断语 / 应期 / 方位（v0.10 建议5 #1：应期下加方位文本框） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">断语</div>
          <textarea
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
            rows={4}
            className={textAreaCls}
            placeholder="应期预测…"
            value={value.yingqi}
            onChange={(e) => set('yingqi', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">方位</div>
          <textarea
            rows={2}
            className={textAreaCls}
            placeholder="方位预测…（有文字时卦例库未反馈卡片显示方位标志）"
            value={value.fangwei}
            onChange={(e) => set('fangwei', e.target.value)}
          />
        </div>
      </div>

      {/* 反馈 / 备注（v0.10 建议4 #6 互换位置：反馈在前） */}
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-sm text-muted">反馈</div>
          <textarea
            rows={2}
            className={textAreaCls}
            placeholder="实际应验情况…"
            value={value.fankui}
            onChange={(e) => set('fankui', e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm text-muted">备注</div>
          <textarea
            rows={2}
            className={textAreaCls}
            placeholder="备注…"
            value={value.beizhu}
            onChange={(e) => set('beizhu', e.target.value)}
          />
        </div>
      </div>

      {/* 吉凶：v0.10 建议4 #2 改为必选项（点同一按钮不取消，只能点另一按钮切换） */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">吉凶</span>
        {['吉', '凶'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => set('jixiong', g)}
            className={pillCls(value.jixiong === g)}
          >
            {g}
          </button>
        ))}
        {!value.jixiong && <span className="text-xs text-red">必选</span>}
        {value.jixiong && (
          <span className={`text-xs ${value.jixiong === '吉' ? 'text-gold' : 'text-red'}`}>
            {value.jixiong === '吉' ? '大吉之象' : '凶象需防'}
          </span>
        )}
      </div>

      {/* 反馈状态 */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">反馈状态</span>
        <button
          type="button"
          onClick={() => set('status', fed ? '未反馈' : '已反馈')}
          className={pillCls(fed)}
        >
          {fed ? '✓ 已反馈' : '已反馈'}
        </button>
        <span className="text-xs text-muted">
          {fed ? '已登记反馈结果，可补充对错记录' : '默认未反馈，勾选后展开对错记录'}
        </span>
      </div>

      {/* 已反馈 → 对错记录 */}
      {fed && (
        <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
          <DuiCuoRow
            label="吉凶对错"
            required
            value={value.jixiongOk}
            onChange={(v) => set('jixiongOk', v)}
          />
          <DuiCuoRow
            label="应期对错"
            value={value.yingqiOk}
            onChange={(v) => set('yingqiOk', v)}
          />
          <DuiCuoRow
            label="方位对错"
            value={value.fangweiOk}
            onChange={(v) => set('fangweiOk', v)}
          />
          {!value.jixiongOk && (
            <p className="text-xs text-red">吉凶对错为必填项（对/错/留空三选一）</p>
          )}
        </div>
      )}
    </div>
  )
}
