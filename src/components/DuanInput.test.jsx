/**
 * 占断输入区（DuanInput）测试：v1.2.0 Bug1 文本框高度惰性
 *  - 挂载时从 sessionStorage 恢复上次手动 resize 的高度（style.height）
 *  - pointerup（resize 手柄松开）记录当前高度
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DuanInput, { validateDuanSave } from './DuanInput.jsx'

const baseValue = {
  background: '', duanyu: '', yingqi: '', fangwei: '', quShu: '', beizhu: '', fankui: '',
  jixiong: '', status: '未反馈', jixiongOk: '', yingqiOk: '', fangweiOk: '', quShuFb: '',
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('DuanInput 文本框高度惰性（v1.2.0 Bug1）', () => {
  test('挂载时恢复 sessionStorage 预置高度（手动下拉扩长后切页保持）', () => {
    sessionStorage.setItem('liuyao-duan-h', JSON.stringify({ duanyu: 150, background: 96 }))
    render(<DuanInput value={baseValue} onChange={() => {}} />)
    expect(screen.getByPlaceholderText('占断结论…').style.height).toBe('150px')
    expect(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…').style.height).toBe('96px')
    // 未记忆的字段不设高度（保持 rows 默认）
    expect(screen.getByPlaceholderText('应期预测…').style.height).toBe('')
  })

  test('resize 手柄松开（pointerup）记录当前高度到 sessionStorage', () => {
    render(<DuanInput value={baseValue} onChange={() => {}} />)
    const ta = screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…')
    Object.defineProperty(ta, 'offsetHeight', { value: 200, configurable: true })
    fireEvent.pointerUp(ta)
    const saved = JSON.parse(sessionStorage.getItem('liuyao-duan-h'))
    expect(saved.background).toBe(200)
  })

  test('非法高度不落库（jsdom 无布局 offsetHeight=0 时静默跳过）', () => {
    render(<DuanInput value={baseValue} onChange={() => {}} />)
    const ta = screen.getByPlaceholderText('占断结论…')
    Object.defineProperty(ta, 'offsetHeight', { value: 0, configurable: true })
    fireEvent.pointerUp(ta)
    expect(sessionStorage.getItem('liuyao-duan-h')).toBeNull()
  })
})

describe('validateDuanSave 保存校验（v1.3.0 方案 a 唯一硬校验）', () => {
  test('非已反馈（未反馈/空/缺省）一律放行', () => {
    expect(validateDuanSave({ status: '未反馈' })).toBe('')
    expect(validateDuanSave({})).toBe('')
    expect(validateDuanSave(null)).toBe('')
    expect(validateDuanSave(undefined)).toBe('')
  })

  test('已反馈必须四者（吉凶/应期/方位/取数反馈）≥1，全空拦截', () => {
    expect(validateDuanSave({ status: '已反馈' })).toContain('请至少选择一项反馈结果')
    expect(validateDuanSave({ status: '已反馈', jixiongOk: '对' })).toBe('')
    expect(validateDuanSave({ status: '已反馈', yingqiOk: '错' })).toBe('')
    expect(validateDuanSave({ status: '已反馈', fangweiOk: '对' })).toBe('')
    expect(validateDuanSave({ status: '已反馈', quShuFb: '神准' })).toBe('')
    expect(validateDuanSave({ status: '已反馈', quShuFb: '相近' })).toBe('')
    expect(validateDuanSave({ status: '已反馈', quShuFb: '错' })).toBe('')
  })

  test('断语不算反馈项（只填断语时四者全空 → 拦截，防死锁文案提示先补充维度）', () => {
    const err = validateDuanSave({ status: '已反馈', duanyu: '吉' })
    expect(err).toContain('请至少选择一项反馈结果')
    expect(err).toContain('请先补充吉凶/应期/方位/取数')
  })
})

describe('DuanInput v1.3.0 取数反馈', () => {
  /** 已反馈态基础值（fankui 非空 ⇔ status 已反馈） */
  const fed = (over = {}) => ({ ...baseValue, fankui: 'x', status: '已反馈', ...over })

  test('取数文本框渲染（方位下方）；填写取数后三档 神准/相近/错 可选', () => {
    const onChange = vi.fn()
    render(<DuanInput value={fed({ quShu: '三' })} onChange={onChange} />)
    expect(screen.getByPlaceholderText(/数量占应|射覆取数/)).toBeTruthy()
    fireEvent.click(screen.getByText('神准'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quShuFb: '神准' }))
    fireEvent.click(screen.getByText('相近'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quShuFb: '相近' }))
    // 「错」在四个反馈行都有 → 用取数反馈行专属 title 定位
    fireEvent.click(screen.getByTitle('取数反馈错'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quShuFb: '错' }))
  })

  test('fankui 填写 → status 自动已反馈；清空 → 回未反馈 + 清四个反馈项（联动②③）', () => {
    const onChange = vi.fn()
    render(<DuanInput value={fed({ jixiongOk: '对', yingqiOk: '错', fangweiOk: '对', quShuFb: '神准' })} onChange={onChange} />)
    const ta = screen.getByPlaceholderText(/实际应验情况/)
    fireEvent.change(ta, { target: { value: '应验了' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fankui: '应验了', status: '已反馈' }))
    // 清空 → 回未反馈 + 清四反馈项
    fireEvent.change(ta, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      fankui: '', status: '未反馈', jixiongOk: '', yingqiOk: '', fangweiOk: '', quShuFb: '',
    }))
  })

  test('文本框清空自动清对应反馈项（联动① 防残留污染统计）', () => {
    const onChange = vi.fn()
    render(<DuanInput value={fed({ yingqi: '明日', yingqiOk: '对', fangwei: '东', fangweiOk: '错', quShu: '三', quShuFb: '相近' })} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText(/应期预测/), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ yingqi: '', yingqiOk: '' }))
    fireEvent.change(screen.getByPlaceholderText(/方位预测/), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fangwei: '', fangweiOk: '' }))
    fireEvent.change(screen.getByPlaceholderText(/数量占应|射覆取数/), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quShu: '', quShuFb: '' }))
  })

  test('反馈项按对应文本框启用：文本框空 → 禁用 + 提示（吉凶对错由必选改可用）', () => {
    render(<DuanInput value={fed()} onChange={() => {}} />) // 无吉凶/应期/方位/取数
    expect(screen.getByText('需先填写吉凶')).toBeTruthy()
    expect(screen.getByText('需先填写应期')).toBeTruthy()
    expect(screen.getByText('需先填写方位')).toBeTruthy()
    expect(screen.getByText('需先填写取数')).toBeTruthy()
    expect(screen.getByTitle('取数反馈神准').disabled).toBe(true) // 取数反馈三档禁用
    expect(screen.getByTitle('取数反馈相近').disabled).toBe(true)
    expect(screen.getByTitle('取数反馈错').disabled).toBe(true)
    expect(screen.getByTitle('吉凶对错对').disabled).toBe(true) // 吉凶对错同样禁用
  })

  test('存量 status=已反馈 但 fankui 空 → 挂载自动修正为未反馈 + 清反馈项（含存量迁移）', () => {
    const onChange = vi.fn()
    render(<DuanInput value={{ ...baseValue, status: '已反馈', jixiongOk: '对' }} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      status: '未反馈', jixiongOk: '', yingqiOk: '', fangweiOk: '', quShuFb: '',
    }))
  })

  test('取消吉凶只清 jixiongOk，不再动 status（联动②：status 只由 fankui 管）', () => {
    const onChange = vi.fn()
    render(<DuanInput value={fed({ jixiong: '吉', jixiongOk: '对' })} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jixiong: '', jixiongOk: '' }))
    // status 保持已反馈（fankui 非空）
    expect(onChange.mock.lastCall[0].status).toBe('已反馈')
  })
})

describe('DuanInput 对错点击取消选中（拍板 2026-08-14）', () => {
  /** 已反馈态基础值（fankui 非空 ⇔ status 已反馈） */
  const fed = (over = {}) => ({ ...baseValue, fankui: 'x', status: '已反馈', ...over })
  test('对错四行点击已选中的选项 → 取消选中（可再点重新选）', () => {
    const onChange = vi.fn()
    render(<DuanInput value={fed({ jixiong: '吉', jixiongOk: '对', yingqi: '明', yingqiOk: '错', fangwei: '东', fangweiOk: '对', quShu: '三', quShuFb: '神准' })} onChange={onChange} />)
    // 吉凶对错：点已选中的「对」→ 取消
    fireEvent.click(screen.getByTitle('吉凶对错对'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jixiongOk: '' }))
    // 应期对错：点已选中的「错」→ 取消
    fireEvent.click(screen.getByTitle('应期对错错'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ yingqiOk: '' }))
    // 方位对错：点已选中的「对」→ 取消
    fireEvent.click(screen.getByTitle('方位对错对'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fangweiOk: '' }))
    // 取数反馈：点已选中的「神准」→ 取消
    fireEvent.click(screen.getByTitle('取数反馈神准'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ quShuFb: '' }))
    // 取消后不影响 status（fankui 非空仍已反馈）与对应文本框
    expect(onChange.mock.lastCall[0].status).toBe('已反馈')
    expect(onChange.mock.lastCall[0].yingqi).toBe('明')
  })

  test('拍板 08-14：取消后再次点击可重新选中（非 sticky）', () => {
    const onChange = vi.fn()
    const { rerender } = render(<DuanInput value={fed({ jixiong: '吉', jixiongOk: '' })} onChange={onChange} />)
    // 第一次点「对」→ 选中（受控回流）
    fireEvent.click(screen.getByTitle('吉凶对错对'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jixiongOk: '对' }))
    rerender(<DuanInput value={fed({ jixiong: '吉', jixiongOk: '对' })} onChange={onChange} />)
    // 已选中状态下再点「对」→ 取消
    fireEvent.click(screen.getByTitle('吉凶对错对'))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ jixiongOk: '' }))
  })
})
