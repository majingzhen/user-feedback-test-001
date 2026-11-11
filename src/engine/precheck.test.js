import { describe, it, expect } from 'vitest'

import { precheck } from '@/engine/precheck'

const baseProject = () => ({
  fps: 30, width: 1280, height: 720,
  tracks: [
    { id: 'v1', type: 'video', label: '视频 1', clips: [] },
    { id: 'a1', type: 'audio', label: '音频 1', clips: [] },
  ],
  transitions: [],
  sources: [{ id: 's1', name: 'a.mp4', type: 'video', duration: 10, width: 0, height: 0, hasAudio: true, blobKey: 'k' }],
})

const clip = (over = {}) => ({
  id: 'c1', trackId: 'v1', sourceId: 's1', start: 0, in: 0, duration: 5,
  locked: false, fadeIn: 0, fadeOut: 0, volumePoints: [], ...over,
})

describe('precheck 导出前预检', () => {
  it('空时间线报错', () => {
    const { errors } = precheck(baseProject())
    expect(errors.some(e => e.includes('时间线为空'))).toBe(true)
  })

  it('正常时间线无错误', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip())
    const { errors } = precheck(p)
    expect(errors).toEqual([])
  })

  it('检测同轨未登记重叠', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip({ id: 'a', start: 0, duration: 5 }))
    p.tracks[0].clips.push(clip({ id: 'b', start: 4, duration: 5 }))
    const { errors } = precheck(p)
    expect(errors.some(e => e.includes('重叠'))).toBe(true)
  })

  it('登记为转场的重叠合法', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip({ id: 'a', start: 0, duration: 5 }))
    p.tracks[0].clips.push(clip({ id: 'b', start: 4, duration: 5 }))
    p.transitions.push({ id: 't', trackId: 'v1', clipAId: 'a', clipBId: 'b', start: 4, duration: 1, locked: false })
    const { errors } = precheck(p)
    expect(errors).toEqual([])
  })

  it('检测超出素材时长', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip({ in: 8, duration: 5 }))
    const { errors } = precheck(p)
    expect(errors.some(e => e.includes('超出素材'))).toBe(true)
  })

  it('检测缺失素材与越界音量点', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip({ sourceId: 'gone' }))
    p.tracks[0].clips.push(clip({ id: 'c2', start: 20, volumePoints: [{ t: 99, v: 1 }] }))
    const { errors } = precheck(p)
    expect(errors.some(e => e.includes('缺失'))).toBe(true)
    expect(errors.some(e => e.includes('音量关键点'))).toBe(true)
  })

  it('无音频片段时给出警告', () => {
    const p = baseProject()
    p.tracks[0].clips.push(clip())
    const { warnings } = precheck(p)
    expect(warnings.some(w => w.includes('静音'))).toBe(true)
  })
})
