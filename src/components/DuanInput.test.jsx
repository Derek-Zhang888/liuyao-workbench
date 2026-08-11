/**
 * 占断输入区（DuanInput）测试：v1.2.0 Bug1 文本框高度惰性
 *  - 挂载时从 sessionStorage 恢复上次手动 resize 的高度（style.height）
 *  - pointerup（resize 手柄松开）记录当前高度
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DuanInput from './DuanInput.jsx'

const baseValue = {
  background: '', duanyu: '', yingqi: '', fangwei: '', beizhu: '', fankui: '',
  jixiong: '', status: '未反馈', jixiongOk: '', yingqiOk: '', fangweiOk: '',
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
