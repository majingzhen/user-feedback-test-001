// 时间线数学模型：预览渲染与 ffmpeg 导出共用同一套取值函数，保证效果一致

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const clamp01 = (v) => clamp(v, 0, 1)

export const clipEnd = (clip) => clip.start + clip.duration

// 时间线时刻 t 是否落在片段上
export const clipAt = (clip, t) => t >= clip.start && t < clipEnd(clip)

// 片段在 t 时刻的音量（包络线性插值 + 淡入淡出）
// volumePoints: [{ t: 相对片段起点秒数, v: 0~1.5 }]，按 t 升序
export const volumeAt = (clip, t) => {
  const local = t - clip.start
  const pts = clip.volumePoints
  let v
  if (pts.length === 0) v = 1
  else if (local <= pts[0].t) v = pts[0].v
  else if (local >= pts[pts.length - 1].t) v = pts[pts.length - 1].v
  else {
    const i = pts.findIndex((p, i) => i < pts.length - 1 && local >= p.t && local <= pts[i + 1].t)
    const a = pts[i]
    const b = pts[i + 1]
    const span = b.t - a.t
    v = span <= 0 ? b.v : a.v + (b.v - a.v) * ((local - a.t) / span)
  }
  // 淡入淡出叠乘
  if (clip.fadeIn > 0 && local < clip.fadeIn) v *= local / clip.fadeIn
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    v *= Math.max(0, (clip.duration - local) / clip.fadeOut)
  }
  return clamp(v, 0, 1.5)
}

// 片段在 t 时刻的基础不透明度（仅淡入淡出）
export const fadeOpacityAt = (clip, t) => {
  const local = t - clip.start
  let o = 1
  if (clip.fadeIn > 0 && local < clip.fadeIn) o = Math.min(o, local / clip.fadeIn)
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    o = Math.min(o, Math.max(0, (clip.duration - local) / clip.fadeOut))
  }
  return clamp01(o)
}

// 找到覆盖时刻 t、且包含该片段的转场（同轨两片段重叠区）
export const transitionAt = (transitions, clip, t) =>
  transitions.find(tr =>
    (tr.clipAId === clip.id || tr.clipBId === clip.id) &&
    t >= tr.start && t < tr.start + tr.duration
  )

// 片段在 t 时刻的最终不透明度（淡入淡出 × 转场斜坡）
export const opacityAt = (clip, transitions, t) => {
  let o = fadeOpacityAt(clip, t)
  const tr = transitionAt(transitions, clip, t)
  if (tr) {
    const p = clamp01((t - tr.start) / tr.duration)
    // clipA 渐出，clipB 渐入：线性交叉溶解，与 xfade fade 等效
    o *= tr.clipAId === clip.id ? 1 - p : p
  }
  return clamp01(o)
}

// 时间线总时长
export const timelineDuration = (tracks) =>
  tracks.reduce((m, tr) => tr.clips.reduce((mm, c) => Math.max(mm, clipEnd(c)), 0), m)

// 轨道上时刻 t 的活动片段
export const activeClipAt = (track, t) => track.clips.find(c => clipAt(c, t))

// 排序后的包络点（保证单调）
export const sortedPoints = (points) => [...points].sort((a, b) => a.t - b.t)
