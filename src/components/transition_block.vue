<script setup>
import { computed, ref } from 'vue'

import { useProjectStore } from '@/stores/project'

const props = defineProps({
  transition: { type: Object, required: true },
})

const store = useProjectStore()
const hover = ref(false)

const style = computed(() => ({
  left: props.transition.start * store.pxPerSecond + 'px',
  width: Math.max(6, props.transition.duration * store.pxPerSecond) + 'px',
}))

// 左缘拖拽调整转场时长（右缘锚定不变）
const onResizeDown = (e) => {
  if (props.transition.locked) return
  e.stopPropagation()
  const startX = e.clientX
  const orig = props.transition.duration
  const move = (ev) => {
    store.resizeTransition(props.transition.id, orig - (ev.clientX - startX) / store.pxPerSecond)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <div
    class="transition"
    :class="{ locked: transition.locked }"
    :style="style"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M4 6l7 6-7 6M13 6l7 6-7 6" />
    </svg>

    <div v-if="!transition.locked" class="resize" @pointerdown="onResizeDown" />

    <div class="tools" v-if="hover">
      <button class="tool" :title="transition.locked ? '解锁' : '锁定'" @pointerdown.stop @click="store.toggleTransitionLock(transition.id)">
        <svg v-if="transition.locked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.8-1.3" /></svg>
      </button>
      <button v-if="!transition.locked" class="tool" title="移除转场" @pointerdown.stop @click="store.removeTransition(transition.id)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.transition {
  position: absolute;
  top: 4px;
  bottom: 4px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  border: 1px solid var(--accent);
  color: #fff;
  pointer-events: auto;
}
.transition.locked {
  background-image: repeating-linear-gradient(45deg, transparent 0 6px, rgb(255 255 255 / 0.08) 6px 12px);
}
.icon { width: 14px; height: 14px; pointer-events: none; }
.resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}
.resize:hover { background: rgb(255 255 255 / 0.25); }
.tools {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
}
.tool {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--bg-raised);
  color: var(--text-2);
  box-shadow: var(--shadow-sm);
}
.tool:hover { color: var(--text-1); }
.tool svg { width: 13px; height: 13px; }
</style>
