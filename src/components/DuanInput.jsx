/**
 * 占断输入区（Task 9）
 *
 * 受控组件：value = {
 *   duanyu, yingqi, beizhu, fankui,   // 四个文本域
 *   jixiong: '' | '吉' | '凶',        // 吉凶勾选
 *   status: '未反馈' | '已反馈',       // 反馈状态（默认未反馈）
 *   jixiongOk / yingqiOk / fangweiOk: '' | '对' | '错' | '留空'
 * }                                    // 勾选已反馈后展开的对错记录
 *
 * 吉凶对错为「已反馈」状态下的必填项（对/错/留空 三选），保存时由页面校验。
 */

const textAreaCls =
  'w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold'

const pillCls = (active) =>
  `rounded-md border px-3 py-1 text-sm transition-colors ${
    active ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
  }`

/** 对/错/留空 三选行 */
function DuiCuoRow({ label, required, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted">
        {label}
        {required && <span className="text-red">*</span>}
      </span>
      {['对', '错', '留空'].map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={pillCls(value === o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

export default function DuanInput({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const fed = value.status === '已反馈'

  return (
    <div className="space-y-4">
      {/* 断语 / 应期 */}
      <div className="grid gap-3 md:grid-cols-2">
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
      </div>

      {/* 备注 / 反馈 */}
      <div className="grid gap-3 md:grid-cols-2">
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
      </div>

      {/* 吉凶 */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">吉凶</span>
        {['吉', '凶'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => set('jixiong', value.jixiong === g ? '' : g)}
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
