import { describe, it, expect } from 'vitest'

import { volumeAt, opacityAt, fadeOpacityAt, clipEnd, timelineDuration } from '@/engine/timeline_math'

const clip = (over = {}) => ({
  id: 'c1', start: 10, in: 0, duration: 5,
  fadeIn: 0, fadeOut: 0, volumePoints: [], ...over,
})

describe('volumeAt 音量包络', () => {
  it('无关键点时恒为 1', () => {
    expect(volumeAt(clip(), 12)).toBe(1)
  })

  it('关键点之间线性插值', () => {
    const c = clip({ volumePoints: [{ t: 1, v: 0 }, { t: 3, v: 1 }] })
    expect(volumeAt(c, 12)).toBeCloseTo(0.5) // 片段本地 t=2，中点
  })

  it('首末点之外取端点值', () => {
    const c = clip({ volumePoints: [{ t: 1, v: 0.2 }, { t: 3, v: 0.8 }] })
    expect(volumeAt(c, 10.5)).toBeCloseTo(0.2)
    expect(volumeAt(c, 14.5)).toBeCloseTo(0.8)
  })

  it('淡入淡出与包络叠乘', () => {
    const c = clip({ fadeIn: 2, volumePoints: [{ t: 0, v: 0.5 }] })
    expect(volumeAt(c, 11)).toBeCloseTo(0.25) // 本地 t=1，淡入一半 × 0.5
  })
})

describe('opacityAt 不透明度', () => {
  it('淡入线性上升', () => {
    const c = clip({ fadeIn: 2 })
    expect(fadeOpacityAt(c, 11)).toBeCloseTo(0.5)
  })

  it('淡出线性下降', () => {
    const c = clip({ fadeOut: 2 })
    expect(fadeOpacityAt(c, 14)).toBeCloseTo(0.5)
  })

  it('交叉溶解：A 渐出 B 渐入且互补', () => {
    const a = clip({ id: 'a', start: 0, duration: 5 })
    const b = clip({ id: 'b', start: 4, duration: 5 })
    const tr = { id: 't', clipAId: 'a', clipBId: 'b', start: 4, duration: 1 }
    const t = 4.5
    expect(opacityAt(a, [tr], t)).toBeCloseTo(0.5)
    expect(opacityAt(b, [tr], t)).toBeCloseTo(0.5)
    expect(opacityAt(a, [tr], t) + opacityAt(b, [tr], t)).toBeCloseTo(1)
  })

  it('转场区外不受影响', () => {
    const b = clip({ id: 'b', start: 4, duration: 5 })
    const tr = { id: 't', clipAId: 'a', clipBId: 'b', start: 4, duration: 1 }
    expect(opacityAt(b, [tr], 6)).toBe(1)
  })
})

describe('timelineDuration', () => {
  it('取所有轨道最大片段末尾', () => {
    const tracks = [
      { clips: [clip({ start: 0, duration: 8 })] },
      { clips: [clip({ start: 5, duration: 10 })] },
    ]
    expect(timelineDuration(tracks)).toBe(15)
    expect(clipEnd(clip({ start: 3, duration: 4 }))).toBe(7)
  })
})
