/**
 * 盘面组件测试（v0.10 改进建8 #4：香闺/床帐显示确认）
 *
 * PanView 是排盘页与卦例库编辑页共用的盘面渲染组件（两页均以 <PanView pan={...}/> 渲染），
 * 此处确认香闺/床帐在干支行正确显示（与排盘页一致：`香闺：X　床帐：X` 空格分隔），
 * 且新数组结构 [{zhi}] 与旧快照对象 {zhi,wuxing} 均向后兼容。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PanView from './PanView.jsx'
import { paipan } from '../engine/paipan.js'

/** 渲染 PanView（包 Router，供 useNavigate） */
function renderPan(pan, props = {}) {
  return render(
    <MemoryRouter>
      <PanView pan={pan} {...props} />
    </MemoryRouter>,
  )
}

/** 取「香闺/床帐」所在 span（含该字样且不以卦身开头，避开外层卦身容器） */
function textSpan(label) {
  return screen.getAllByText(new RegExp(`${label}：`)).find((el) => el.textContent.trim().startsWith(label))
}

afterEach(() => {
  cleanup()
})

describe('PanView 香闺/床帐（v0.10 改进建8 #4）', () => {
  test('新快照数组结构：香闺/床帐全地支空格分隔显示（排盘页与卦例库编辑页共用 PanView）', () => {
    // 乾为天：卦身巳，克金→香闺=金全部[申,酉]、生土→床帐=土全部[丑,辰,未,戌]（十二支序）
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) })
    expect(s.xianggui).toEqual([{ zhi: '申' }, { zhi: '酉' }])
    expect(s.chuangzhang).toEqual([{ zhi: '丑' }, { zhi: '辰' }, { zhi: '未' }, { zhi: '戌' }])
    renderPan(s)
    const xg = textSpan('香闺')
    const cz = textSpan('床帐')
    expect(xg).toBeTruthy()
    expect(cz).toBeTruthy()
    expect(xg.textContent).toBe('香闺：申 酉')
    expect(cz.textContent).toBe('床帐：丑 辰 未 戌')
  })

  test('旧快照对象结构 {zhi,wuxing} 向后兼容显示', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) })
    s.xianggui = { zhi: '申', wuxing: '金' }
    s.chuangzhang = { zhi: '辰', wuxing: '土' }
    renderPan(s)
    expect(textSpan('香闺').textContent).toBe('香闺：申金')
    expect(textSpan('床帐').textContent).toBe('床帐：辰土')
  })

  test('无香闺/床帐时省略显示（旧快照兼容，不崩）', () => {
    const s = paipan({ method: 'qian', params: { lines: '111111', dong: [] }, date: new Date(2026, 7, 4) })
    delete s.xianggui
    delete s.chuangzhang
    renderPan(s)
    expect(screen.queryByText(/香闺：/)).toBeNull()
    expect(screen.queryByText(/床帐：/)).toBeNull()
    expect(screen.getByText('卦身')).toBeTruthy() // 卦身仍显示
  })
})
