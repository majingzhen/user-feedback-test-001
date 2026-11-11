// 导出前时间线预检：返回 { errors, warnings }，errors 非空则阻断导出
import { clipEnd, timelineDuration } from '@/engine/timeline_math'

const overlap = (a, b) => Math.min(clipEnd(a), clipEnd(b)) - Math.max(a.start, b.start)

export const precheck = (project) => {
  const errors = []
  const warnings = []
  const sourceOf = (id) => project.sources.find(s => s.id === id)

  if (timelineDuration(project.tracks) <= 0) errors.push('时间线为空，没有可导出的内容')

  for (const track of project.tracks) {
    const clips = [...track.clips].sort((a, b) => a.start - b.start)
    for (const clip of clips) {
      const src = sourceOf(clip.sourceId)
      const tag = `[${track.label}] 片段 ${clip.id.slice(0, 6)}`
      if (!src) { errors.push(`${tag} 的素材已缺失`); continue }
      if (clip.duration <= 0) errors.push(`${tag} 时长为零`)
      if (clip.in < 0) errors.push(`${tag} 入点越界`)
      if (clip.in + clip.duration > src.duration + 0.01) {
        errors.push(`${tag} 超出素材「${src.name}」的实际时长`)
      }
      for (const p of clip.volumePoints) {
        if (p.t < 0 || p.t > clip.duration) errors.push(`${tag} 存在越界的音量关键点`)
        if (p.v < 0 || p.v > 1.5) errors.push(`${tag} 存在非法音量值`)
      }
    }
    // 同轨重叠：只有登记过的转场重叠才合法
    for (let i = 0; i < clips.length - 1; i++) {
      const ov = overlap(clips[i], clips[i + 1])
      if (ov <= 0.001) continue
      const tr = project.transitions.find(t =>
        t.clipAId === clips[i].id && t.clipBId === clips[i + 1].id
      )
      const legal = tr && Math.abs(tr.start - clips[i + 1].start) < 0.01 && Math.abs(tr.duration - ov) < 0.05
      if (!legal) errors.push(`[${track.label}] 存在未登记为转场的片段重叠（${ov.toFixed(2)}s）`)
    }
  }

  for (const tr of project.transitions) {
    const a = project.tracks.flatMap(t => t.clips).find(c => c.id === tr.clipAId)
    const b = project.tracks.flatMap(t => t.clips).find(c => c.id === tr.clipBId)
    if (!a || !b) errors.push('存在引用了已删除片段的转场')
    else if (tr.duration <= 0) errors.push('存在时长为零的转场')
  }

  const videoClips = project.tracks.filter(t => t.type === 'video').flatMap(t => t.clips)
  if (videoClips.length === 0) warnings.push('没有任何视频片段，导出将为黑屏')
  const audioClips = project.tracks.filter(t => t.type === 'audio').flatMap(t => t.clips)
  if (audioClips.length === 0) warnings.push('没有任何音频片段，导出将为静音')

  return { errors, warnings }
}
