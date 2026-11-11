import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useProjectStore } from '@/stores/project'

const makeSource = (store, over = {}) =>
  store.addSource({
    id: crypto.randomUUID(), name: 's.mp4', type: 'video',
    duration: 10, width: 1280, height: 720, hasAudio: true, blobKey: 'k', ...over,
  })

let store
beforeEach(() => {
  setActivePinia(createPinia())
  store = useProjectStore()
})

describe('片段基础编辑', () => {
  it('添加片段到轨道', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 2)
    const { clip } = store.findClip(cid)
    expect(clip.start).toBe(2)
    expect(clip.duration).toBe(10)
  })

  it('素材类型与轨道不匹配时拒绝', () => {
    const sid = makeSource(store)
    expect(store.addClip(sid, 'a1', 0)).toBe(false)
  })

  it('移动片段不为负数', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 5)
    store.moveClip(cid, -3)
    expect(store.findClip(cid).clip.start).toBe(0)
  })

  it('裁剪受素材边界约束', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 0)
    store.trimClip(cid, 'end', 99)
    expect(store.findClip(cid).clip.duration).toBe(10)
  })
})

describe('拆分', () => {
  it('拆分后入点与包络正确迁移', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 0)
    store.trimClip(cid, 'end', 8) // 时长 8
    store.addVolumePoint(cid, 6, 0.5)
    const nid = store.splitClip(cid, 5)
    const first = store.findClip(cid).clip
    const second = store.findClip(nid).clip
    expect(first.duration).toBe(5)
    expect(second.in).toBe(5)
    expect(second.duration).toBe(3)
    expect(second.volumePoints[0].t).toBeCloseTo(1)
  })

  it('转场区域内禁止拆分', () => {
    const sid = makeSource(store)
    const a = store.addClip(sid, 'v1', 0)
    const b = store.addClip(sid, 'v1', 10)
    store.trimClip(b, 'start', 8) // B 头部留出 2s 余量
    store.moveClip(b, 10)
    store.addTransition(a, b, 1)
    const tr = store.project.transitions[0]
    expect(store.splitClip(b, tr.start + 0.5)).toBe(false)
  })
})

describe('锁定语义', () => {
  it('锁定片段不可移动/裁剪/拆分/删除', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 1)
    store.toggleClipLock(cid)
    expect(store.moveClip(cid, 5)).toBe(false)
    expect(store.trimClip(cid, 'end', 3)).toBe(false)
    expect(store.splitClip(cid, 2)).toBe(false)
    expect(store.deleteClip(cid)).toBe(false)
    expect(store.findClip(cid).clip.start).toBe(1)
  })

  it('锁定转场不被删除，且保护关联片段不被删除', () => {
    const sid = makeSource(store)
    const a = store.addClip(sid, 'v1', 0)
    const b = store.addClip(sid, 'v1', 10)
    store.trimClip(b, 'start', 8)
    store.moveClip(b, 10)
    store.addTransition(a, b, 1)
    const tr = store.project.transitions[0]
    store.toggleTransitionLock(tr.id)
    expect(store.removeTransition(tr.id)).toBe(false)
    expect(store.deleteClip(a)).toBe(false)
    expect(store.project.transitions.length).toBe(1)
  })

  it('改其他轨道不影响锁定片段', () => {
    const sid = makeSource(store)
    const locked = store.addClip(sid, 'v1', 0)
    store.toggleClipLock(locked)
    const other = store.addClip(sid, 'v2', 3)
    store.moveClip(other, 6)
    store.deleteClip(other)
    expect(store.findClip(locked).clip.start).toBe(0)
  })
})

describe('转场', () => {
  it('添加交叉溶解后 B 向左探出且几何自洽', () => {
    const sid = makeSource(store)
    const a = store.addClip(sid, 'v1', 0)
    const b = store.addClip(sid, 'v1', 10)
    store.trimClip(b, 'start', 8) // B: start=8, in=2
    store.moveClip(b, 10) // B: start=10, in=2
    expect(store.addTransition(a, b, 1)).toBe(true)
    const tr = store.project.transitions[0]
    const clipB = store.findClip(b).clip
    expect(tr.start).toBe(9)
    expect(tr.duration).toBe(1)
    expect(clipB.start).toBe(9)
    expect(clipB.in).toBe(1)
  })

  it('头部余量不足时拒绝', () => {
    const sid = makeSource(store)
    const a = store.addClip(sid, 'v1', 0)
    const b = store.addClip(sid, 'v1', 10)
    expect(store.addTransition(a, b, 1)).toBe(false)
  })

  it('移除转场后 B 恢复原位', () => {
    const sid = makeSource(store)
    const a = store.addClip(sid, 'v1', 0)
    const b = store.addClip(sid, 'v1', 10)
    store.trimClip(b, 'start', 8)
    store.moveClip(b, 10)
    store.addTransition(a, b, 1)
    store.removeTransition(store.project.transitions[0].id)
    const clipB = store.findClip(b).clip
    expect(clipB.start).toBe(10)
    expect(clipB.in).toBe(2)
  })
})

describe('音量包络编辑', () => {
  it('关键点增改删且保持有序', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 0)
    store.addVolumePoint(cid, 5, 0.5)
    store.addVolumePoint(cid, 1, 0.8)
    const { clip } = store.findClip(cid)
    expect(clip.volumePoints.map(p => p.t)).toEqual([1, 5])
    store.moveVolumePoint(cid, 0, 2, 0.3)
    expect(clip.volumePoints[0]).toEqual({ t: 2, v: 0.3 })
    store.removeVolumePoint(cid, 0)
    expect(clip.volumePoints.length).toBe(1)
  })

  it('音量值夹在 0~1.5', () => {
    const sid = makeSource(store)
    const cid = store.addClip(sid, 'v1', 0)
    store.addVolumePoint(cid, 1, 99)
    expect(store.findClip(cid).clip.volumePoints[0].v).toBe(1.5)
  })
})
