import { describe, it, expect } from 'vitest'

import { buildGraph } from '@/engine/ffmpeg_export'

const project = (over = {}) => ({
  fps: 30, width: 1280, height: 720,
  tracks: [
    { id: 'v1', type: 'video', label: 'V1', clips: [] },
    { id: 'a1', type: 'audio', label: 'A1', clips: [] },
  ],
  transitions: [],
  sources: [
    { id: 's1', name: 'v.mp4', type: 'video', duration: 10, width: 0, height: 0, hasAudio: true, blobKey: 'k1' },
    { id: 's2', name: 'a.mp3', type: 'audio', duration: 10, width: 0, height: 0, hasAudio: true, blobKey: 'k2' },
  ],
  ...over,
})

const clip = (over = {}) => ({
  id: 'c1', trackId: 'v1', sourceId: 's1', start: 0, in: 0, duration: 5,
  locked: false, fadeIn: 0, fadeOut: 0, volumePoints: [], ...over,
})

describe('buildGraph 滤镜图构建', () => {
  it('视频片段生成 trim/scale/pad/overlay 链', () => {
    const p = project()
    p.tracks[0].clips.push(clip())
    const { filterComplex, vout } = buildGraph(p)
    expect(filterComplex).toContain('trim=start=0:duration=5')
    expect(filterComplex).toContain('scale=1280:720')
    expect(filterComplex).toContain('overlay=0:0')
    expect(vout).toBe('vout')
  })

  it('淡入淡出生成 alpha fade', () => {
    const p = project()
    p.tracks[0].clips.push(clip({ fadeIn: 1, fadeOut: 2 }))
    const { filterComplex } = buildGraph(p)
    expect(filterComplex).toContain('fade=t=in:st=0:d=1:alpha=1')
    expect(filterComplex).toContain('fade=t=out:st=3:d=2:alpha=1')
  })

  it('转场生成互补的 alpha 斜坡', () => {
    const p = project()
    p.tracks[0].clips.push(clip({ id: 'a', start: 0, duration: 5 }))
    p.tracks[0].clips.push(clip({ id: 'b', start: 4, duration: 5 }))
    p.transitions.push({ id: 't', trackId: 'v1', clipAId: 'a', clipBId: 'b', start: 4, duration: 1, locked: false })
    const { filterComplex } = buildGraph(p)
    expect(filterComplex).toContain('fade=t=out:st=4:d=1:alpha=1')
    expect(filterComplex).toContain('fade=t=in:st=0:d=1:alpha=1')
  })

  it('音量包络生成分段线性表达式并转义逗号', () => {
    const p = project()
    p.tracks[1].clips.push(clip({
      id: 'au', trackId: 'a1', sourceId: 's2',
      volumePoints: [{ t: 0, v: 0 }, { t: 2, v: 1 }],
    }))
    const { filterComplex, aout } = buildGraph(p)
    expect(filterComplex).toContain('volume=')
    expect(filterComplex).toContain('if(lt(t\\,'))
    expect(filterComplex).toContain('apad')
    expect(aout).toBe('aout')
  })

  it('多个音频片段走 amix 混音', () => {
    const p = project()
    p.tracks[1].clips.push(clip({ id: 'au1', trackId: 'a1', sourceId: 's2' }))
    p.tracks[1].clips.push(clip({ id: 'au2', trackId: 'a1', sourceId: 's2', start: 6 }))
    const { filterComplex } = buildGraph(p)
    expect(filterComplex).toContain('amix=inputs=2')
  })

  it('无音频流素材不参与混音', () => {
    const p = project()
    p.sources[0].hasAudio = false
    p.tracks[0].clips.push(clip())
    const { aout } = buildGraph(p)
    expect(aout).toBeNull()
  })
})
