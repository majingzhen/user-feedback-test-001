<script setup>
import { computed, inject, ref } from 'vue'

import { useProjectStore } from '@/stores/project'
import EnvelopeEditor from '@/components/envelope_editor.vue'

const props = defineProps({
  clip: { type: Object, required: true },
  track: { type: Object, required: true },
})

const store = useProjectStore()
const { snapTime, trackFromY } = inject('timeline')
const engine = inject('engine')

const pps = computed(() => store.pxPerSecond)
const selected = computed(() => store.selectedClipId === props.clip.id)
const source = computed(() => store.getSource(props.clip.sourceId))

const style = computed(() => ({
  left: props.clip.start * pps.value + 'px',
  width: Math.max(4, props.clip.duration * pps.value) + 'px',
}))

// 与后一片段相接且尚未建转场时，显示加转场按钮
const nextClip = computed(() => {
  const sorted = [...props.track.clips].sort((a, b) => a.start - b.start)
  const i = sorted.findIndex(c => c.id === props.clip.id)
  return sorted[i + 1] || null
})
const canAddTransition = computed(() => {
  if (props.track.type !== 'video' || !nextClip.value) return false
  const gap = nextClip.value.start - (props.clip.start + props.clip.duration)
  if (Math.abs(gap) > 0.001) return false
  return !store.project.transitions.some(t => t.clipAId === props.clip.id && t.clipBId === nextClip.value.id)
})

// ---------- 拖拽移动（支持跨同类型轨道） ----------
const onBodyDown = (e) => {
  if (e.button !== 0) return
  store.select(props.clip.id)
  if (props.clip.locked) return
  engine.pause()
  const startX = e.clientX
  const startY = e.clientY
  const origStart = props.clip.start
  let targetTrackId = props.track.id
  const move = (ev) => {
    const dt = (ev.clientX - startX) / pps.value
    const t = snapTime(Math.max(0, origStart + dt), props.clip.id)
    const over = trackFromY(ev.clientY, props.track.type)
    if (over) targetTrackId = over.id
    store.moveClip(props.clip.id, t, targetTrackId)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  e.preventDefault()
}

// ---------- 边缘裁剪 ----------
const onTrimDown = (e, edge) => {
  if (props.clip.locked) return
  e.stopPropagation()
  engine.pause()
  const startX = e.clientX
  const orig = edge === 'start' ? props.clip.start : props.clip.start + props.clip.duration
  const move = (ev) => {
    const t = snapTime(orig + (ev.clientX - startX) / pps.value, props.clip.id)
    store.trimClip(props.clip.id, edge, t)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ---------- 淡入淡出手柄 ----------
const onFadeDown = (e, edge) => {
  if (props.clip.locked) return
  e.stopPropagation()
  const startX = e.clientX
  const orig = edge === 'in' ? props.clip.fadeIn : props.clip.fadeOut
  const move = (ev) => {
    const d = (ev.clientX - startX) / pps.value
    store.setFade(props.clip.id, edge, edge === 'in' ? orig + d : orig - d)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const splitHere = () => store.splitClip(props.clip.id, store.playhead)
const playheadInside = computed(() =>
  store.playhead > props.clip.start && store.playhead < props.clip.start + props.clip.duration
)
const addTransition = () => store.addTransition(props.clip.id, nextClip.value.id, 1)
</script>

<template>
  <div
    class="clip"
    :class="{ locked: clip.locked, selected, audio: track.type === 'audio' }"
    :style="style"
    @pointerdown="onBodyDown"
  >
    <div class="fade-shade left" :style="{ width: clip.fadeIn * pps + 'px' }" />
    <div class="fade-shade right" :style="{ width: clip.fadeOut * pps + 'px' }" />

    <EnvelopeEditor v-if="track.type === 'audio'" :clip="clip" />

    <div class="label">{{ source?.name }}</div>

    <template v-if="!clip.locked">
      <div class="trim left" @pointerdown="onTrimDown($event, 'start')" />
      <div class="trim right" @pointerdown="onTrimDown($event, 'end')" />
      <div class="fade-handle left" :style="{ left: clip.fadeIn * pps - 4 + 'px' }" @pointerdown="onFadeDown($event, 'in')" />
      <div class="fade-handle right" :style="{ right: clip.fadeOut * pps - 4 + 'px' }" @pointerdown="onFadeDown($event, 'out')" />
    </template>

    <div class="toolbar" v-if="selected">
      <button class="tool" :title="clip.locked ? '解锁' : '锁定'" @pointerdown.stop @click="store.toggleClipLock(clip.id)">
        <svg v-if="clip.locked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.8-1.3" /></svg>
      </button>
      <button class="tool" title="在播放头拆分" :disabled="!playheadInside || clip.locked" @pointerdown.stop @click="splitHere">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" /></svg>
      </button>
      <button class="tool" title="删除" :disabled="clip.locked" @pointerdown.stop @click="store.deleteClip(clip.id)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
      </button>
      <button v-if="canAddTransition && !clip.locked" class="tool" title="与后一片段交叉溶解" @pointerdown.stop @click="addTransition">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6l7 6-7 6M13 6l7 6-7 6" /></svg>
      </button>
    </div>
    <div class="lock-badge" v-if="clip.locked">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
    </div>
  </div>
</template>

<style scoped>
.clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  overflow: hidden;
  cursor: grab;
}
.clip.audio { background: #23405a; }
.clip.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.clip.locked {
  cursor: not-allowed;
  background-image: repeating-linear-gradient(45deg, transparent 0 6px, rgb(255 255 255 / 0.04) 6px 12px);
}
.label {
  position: absolute;
  top: 2px;
  left: 6px;
  right: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
  pointer-events: none;
  z-index: 2;
}
.trim {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 3;
}
.trim.left { left: 0; }
.trim.right { right: 0; }
.trim:hover { background: var(--accent); opacity: 0.6; }
.fade-shade {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgb(0 0 0 / 0.35);
  pointer-events: none;
}
.fade-shade.left { left: 0; clip-path: polygon(0 0, 100% 0, 0 100%); }
.fade-shade.right { right: 0; clip-path: polygon(100% 0, 0 0, 100% 100%); }
.fade-handle {
  position: absolute;
  top: 2px;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--text-2);
  cursor: ew-resize;
  z-index: 3;
}
.fade-handle:hover { background: var(--accent); }
.toolbar {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 2px;
  z-index: 4;
}
.tool {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: rgb(15 23 42 / 0.8);
  color: var(--text-2);
}
.tool:hover { color: var(--text-1); background: var(--bg-hover); }
.tool:disabled { opacity: 0.35; cursor: not-allowed; }
.tool svg { width: 13px; height: 13px; }
.lock-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  width: 14px;
  height: 14px;
  color: var(--warn);
  z-index: 2;
}
.lock-badge svg { width: 100%; height: 100%; }
</style>
