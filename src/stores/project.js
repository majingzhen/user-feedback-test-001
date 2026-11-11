import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

import { idbGet, idbSet } from '@/libs'
import { clipEnd, sortedPoints, clamp } from '@/engine/timeline_math'

const uid = () => crypto.randomUUID()
const MIN_CLIP = 0.1
const MIN_TRANSITION = 0.2
const MAX_VOLUME = 1.5

const emptyProject = () => ({
  name: '未命名工程',
  fps: 30,
  width: 1280,
  height: 720,
  tracks: [
    { id: 'v1', type: 'video', label: '视频 1', clips: [] },
    { id: 'v2', type: 'video', label: '视频 2', clips: [] },
    { id: 'a1', type: 'audio', label: '音频 1', clips: [] },
    { id: 'a2', type: 'audio', label: '音频 2', clips: [] },
  ],
  transitions: [],
  sources: [],
})

export const useProjectStore = defineStore('project', () => {
  const project = ref(emptyProject())
  const playhead = ref(0)
  const playing = ref(false)
  const pxPerSecond = ref(60)
  const selectedClipId = ref(null)
  const saveState = ref('saved') // saved | saving | restored
  const lastError = ref('')

  // ---------- 查询 ----------
  const findClip = (clipId) => {
    for (const track of project.value.tracks) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return { clip, track }
    }
    return null
  }
  const getSource = (sourceId) => project.value.sources.find(s => s.id === sourceId)
  const clipTransitions = (clipId) =>
    project.value.transitions.filter(tr => tr.clipAId === clipId || tr.clipBId === clipId)

  const duration = computed(() =>
    project.value.tracks.reduce((m, t) => t.clips.reduce((mm, c) => Math.max(mm, clipEnd(c)), 0), 0)
  )

  const fail = (msg) => { lastError.value = msg; return false }

  // ---------- 素材 ----------
  const addSource = (meta) => {
    project.value.sources.push(meta)
    return meta.id
  }

  const addClip = (sourceId, trackId, at) => {
    const source = getSource(sourceId)
    const track = project.value.tracks.find(t => t.id === trackId)
    if (!source || !track || track.type !== source.type) return fail('素材类型与轨道不匹配')
    const clip = {
      id: uid(), trackId, sourceId,
      start: Math.max(0, at), in: 0, duration: source.duration,
      locked: false, fadeIn: 0, fadeOut: 0, volumePoints: [],
    }
    track.clips.push(clip)
    track.clips.sort((a, b) => a.start - b.start)
    return clip.id
  }

  // ---------- 移动 / 裁剪 ----------
  // 转场是几何绑定的：参与转场的片段移动时整组一起动，且不允许跨轨
  const moveClip = (clipId, newStart, newTrackId) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip, track } = found
    if (clip.locked) return fail('片段已锁定')
    const linked = clipTransitions(clipId)
    if (linked.length > 0 && newTrackId && newTrackId !== track.id) return fail('转场中的片段不能跨轨移动')
    const targetTrack = newTrackId
      ? project.value.tracks.find(t => t.id === newTrackId && t.type === track.type)
      : track
    if (!targetTrack) return fail('目标轨道类型不匹配')
    const delta = Math.max(0, newStart) - clip.start
    const group = [clip]
    for (const tr of linked) {
      const otherId = tr.clipAId === clipId ? tr.clipBId : tr.clipAId
      const other = findClip(otherId)
      if (!other) continue
      if (other.clip.locked) return fail('关联片段已锁定，无法移动')
      group.push(other.clip)
    }
    for (const c of group) c.start = Math.max(0, c.start + delta)
    for (const tr of linked) tr.start = Math.max(0, tr.start + delta)
    if (targetTrack !== track) {
      track.clips = track.clips.filter(c => c.id !== clipId)
      clip.trackId = targetTrack.id
      targetTrack.clips.push(clip)
    }
    for (const t of project.value.tracks) t.clips.sort((a, b) => a.start - b.start)
    return true
  }

  const trimClip = (clipId, edge, newTime) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip } = found
    if (clip.locked) return fail('片段已锁定')
    const source = getSource(clip.sourceId)
    const linked = clipTransitions(clipId)
    if (edge === 'start') {
      let ns = clamp(newTime, clip.start - clip.in, clipEnd(clip) - MIN_CLIP)
      // 作为转场 B 方：头部不能裁过转场起点
      for (const tr of linked) if (tr.clipBId === clipId) ns = Math.min(ns, tr.start)
      const delta = ns - clip.start
      clip.start = ns
      clip.in += delta
      clip.duration -= delta
      clip.volumePoints = clip.volumePoints
        .map(p => ({ t: p.t - delta, v: p.v }))
        .filter(p => p.t >= 0)
    } else {
      let ne = clamp(newTime, clip.start + MIN_CLIP, clip.start + (source.duration - clip.in))
      // 作为转场 A 方：尾部不能裁进转场区
      for (const tr of linked) if (tr.clipAId === clipId) ne = Math.max(ne, tr.start + tr.duration)
      clip.duration = ne - clip.start
      clip.volumePoints = clip.volumePoints.filter(p => p.t <= clip.duration)
    }
    return true
  }

  // ---------- 拆分 ----------
  const splitClip = (clipId, t) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip, track } = found
    if (clip.locked) return fail('片段已锁定')
    if (t <= clip.start + MIN_CLIP || t >= clipEnd(clip) - MIN_CLIP) return fail('拆分点需在片段内部')
    const hitTransition = clipTransitions(clipId).find(tr => t > tr.start && t < tr.start + tr.duration)
    if (hitTransition) return fail('不能在转场区域内拆分')
    const offset = t - clip.start
    const second = {
      ...clip,
      id: uid(),
      start: t,
      in: clip.in + offset,
      duration: clip.duration - offset,
      fadeIn: 0,
      volumePoints: clip.volumePoints.filter(p => p.t > offset).map(p => ({ t: p.t - offset, v: p.v })),
    }
    clip.duration = offset
    clip.fadeOut = 0
    clip.volumePoints = clip.volumePoints.filter(p => p.t <= offset)
    // 转场归属：整体落在后半段的转场改挂到新片段
    for (const tr of clipTransitions(clipId)) {
      if (tr.start >= t) {
        if (tr.clipAId === clipId) tr.clipAId = second.id
        if (tr.clipBId === clipId) tr.clipBId = second.id
      }
    }
    track.clips.push(second)
    track.clips.sort((a, b) => a.start - b.start)
    return second.id
  }

  const deleteClip = (clipId) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip, track } = found
    if (clip.locked) return fail('片段已锁定')
    const linked = clipTransitions(clipId)
    if (linked.some(tr => tr.locked)) return fail('关联转场已锁定')
    for (const tr of linked) removeTransition(tr.id)
    track.clips = track.clips.filter(c => c.id !== clipId)
    if (selectedClipId.value === clipId) selectedClipId.value = null
    return true
  }

  // ---------- 锁定 ----------
  const toggleClipLock = (clipId) => {
    const found = findClip(clipId)
    if (found) found.clip.locked = !found.clip.locked
  }
  const toggleTransitionLock = (trId) => {
    const tr = project.value.transitions.find(t => t.id === trId)
    if (tr) tr.locked = !tr.locked
  }

  // ---------- 淡入淡出 ----------
  const setFade = (clipId, edge, seconds) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip } = found
    if (clip.locked) return fail('片段已锁定')
    const v = clamp(seconds, 0, clip.duration / 2)
    if (edge === 'in') clip.fadeIn = v
    else clip.fadeOut = v
    return true
  }

  // ---------- 转场（交叉溶解，不对称模型：B 方向左探出 overlap） ----------
  const addTransition = (clipAId, clipBId, want = 1) => {
    const a = findClip(clipAId)
    const b = findClip(clipBId)
    if (!a || !b || a.track.id !== b.track.id) return fail('两个片段需在同一轨道')
    if (a.clip.locked || b.clip.locked) return fail('片段已锁定')
    const gap = b.clip.start - clipEnd(a.clip)
    if (Math.abs(gap) > 0.001) return fail('两个片段需首尾相接')
    const d = Math.min(want, b.clip.in)
    if (d < MIN_TRANSITION) return fail('后一片段头部余量不足，无法添加转场')
    b.clip.start -= d
    b.clip.in -= d
    b.clip.duration += d
    project.value.transitions.push({
      id: uid(), trackId: a.track.id,
      clipAId, clipBId, start: b.clip.start, duration: d, locked: false,
    })
    a.track.clips.sort((x, y) => x.start - y.start)
    return true
  }

  const removeTransition = (trId) => {
    const tr = project.value.transitions.find(t => t.id === trId)
    if (!tr) return false
    if (tr.locked) return fail('转场已锁定')
    const b = findClip(tr.clipBId)
    if (b) {
      b.clip.start += tr.duration
      b.clip.in += tr.duration
      b.clip.duration -= tr.duration
    }
    project.value.transitions = project.value.transitions.filter(t => t.id !== trId)
    return true
  }

  const resizeTransition = (trId, newDuration) => {
    const tr = project.value.transitions.find(t => t.id === trId)
    if (!tr) return false
    if (tr.locked) return fail('转场已锁定')
    const b = findClip(tr.clipBId)
    if (!b) return false
    const d = clamp(newDuration, MIN_TRANSITION, b.clip.in + tr.duration)
    const delta = d - tr.duration
    b.clip.start -= delta
    b.clip.in -= delta
    b.clip.duration += delta
    tr.start = b.clip.start
    tr.duration = d
    return true
  }

  // ---------- 音量包络 ----------
  const addVolumePoint = (clipId, t, v) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip } = found
    if (clip.locked) return fail('片段已锁定')
    clip.volumePoints.push({ t: clamp(t, 0, clip.duration), v: clamp(v, 0, MAX_VOLUME) })
    clip.volumePoints = sortedPoints(clip.volumePoints)
    return true
  }
  // 原地修改保持对象引用，排序后返回新下标，拖拽时调用方需同步
  const moveVolumePoint = (clipId, index, t, v) => {
    const found = findClip(clipId)
    if (!found) return -1
    const { clip } = found
    const pt = clip.volumePoints[index]
    if (clip.locked || !pt) return -1
    pt.t = clamp(t, 0, clip.duration)
    pt.v = clamp(v, 0, MAX_VOLUME)
    clip.volumePoints.sort((a, b) => a.t - b.t)
    return clip.volumePoints.indexOf(pt)
  }
  const removeVolumePoint = (clipId, index) => {
    const found = findClip(clipId)
    if (!found) return false
    const { clip } = found
    if (clip.locked) return false
    clip.volumePoints.splice(index, 1)
    return true
  }

  // ---------- 播放头 ----------
  const setPlayhead = (t) => { playhead.value = Math.max(0, t) }
  const select = (clipId) => { selectedClipId.value = clipId }

  // ---------- 持久化 ----------
  let saveTimer = null
  const saveProject = async () => {
    saveState.value = 'saving'
    await idbSet('project', 'current', {
      ...JSON.parse(JSON.stringify(project.value)),
      playhead: playhead.value,
      pxPerSecond: pxPerSecond.value,
    })
    saveState.value = 'saved'
  }
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveProject, 500)
  }
  watch([project, playhead, pxPerSecond], scheduleSave, { deep: true })

  const loadProject = async () => {
    const data = await idbGet('project', 'current')
    if (!data) return false
    const { playhead: ph, pxPerSecond: pps, ...proj } = data
    project.value = proj
    playhead.value = ph ?? 0
    pxPerSecond.value = pps ?? 60
    saveState.value = 'restored'
    return true
  }

  const newProject = () => {
    project.value = emptyProject()
    playhead.value = 0
    selectedClipId.value = null
  }

  return {
    project, playhead, playing, pxPerSecond, selectedClipId, saveState, lastError, duration,
    findClip, getSource, clipTransitions,
    addSource, addClip, moveClip, trimClip, splitClip, deleteClip,
    toggleClipLock, toggleTransitionLock, setFade,
    addTransition, removeTransition, resizeTransition,
    addVolumePoint, moveVolumePoint, removeVolumePoint,
    setPlayhead, select, saveProject, loadProject, newProject,
  }
})
