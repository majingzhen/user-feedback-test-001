<script setup>
import { computed } from 'vue'

import { useProjectStore } from '@/stores/project'

const props = defineProps({
  clip: { type: Object, required: true },
})

const store = useProjectStore()
const MAX_V = 1.5

// v -> y 百分比（v=0 在底部，v=1.5 在顶部）
const yOf = (v) => (1 - v / MAX_V) * 100

const points = computed(() =>
  props.clip.volumePoints.map((p, i) => ({
    ...p,
    index: i,
    x: (p.t / props.clip.duration) * 100,
    y: yOf(p.v),
  }))
)

const polyline = computed(() => {
  const pts = points.value
  const head = `0,${pts.length ? pts[0].y : yOf(1)}`
  const mid = pts.map(p => `${p.x},${p.y}`).join(' ')
  const tail = `100,${pts.length ? pts[pts.length - 1].y : yOf(1)}`
  return [head, mid, tail].filter(Boolean).join(' ')
})

// 双击添加关键点
const onDblClick = (e) => {
  if (props.clip.locked) return
  const rect = e.currentTarget.getBoundingClientRect()
  const t = ((e.clientX - rect.left) / rect.width) * props.clip.duration
  const v = (1 - (e.clientY - rect.top) / rect.height) * MAX_V
  store.addVolumePoint(props.clip.id, t, v)
  e.stopPropagation()
}

// 拖拽关键点（可单独编辑）；排序后下标会变，用返回值同步
const onPointDown = (e, index) => {
  if (props.clip.locked) return
  e.stopPropagation()
  e.preventDefault()
  let current = index
  const svg = e.target.ownerSVGElement
  const rect = svg.getBoundingClientRect()
  const move = (ev) => {
    const t = ((ev.clientX - rect.left) / rect.width) * props.clip.duration
    const v = (1 - (ev.clientY - rect.top) / rect.height) * MAX_V
    const next = store.moveVolumePoint(props.clip.id, current, t, v)
    if (next >= 0) current = next
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// 右键删除关键点
const onPointRightClick = (e, index) => {
  e.preventDefault()
  e.stopPropagation()
  if (!props.clip.locked) store.removeVolumePoint(props.clip.id, index)
}
</script>

<template>
  <svg
    class="envelope"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    @dblclick="onDblClick"
  >
    <line x1="0" :y1="yOf(1)" x2="100" :y2="yOf(1)" class="baseline" />
    <polyline :points="polyline" class="line" />
    <circle
      v-for="p in points"
      :key="p.index"
      :cx="p.x"
      :cy="p.y"
      r="2.2"
      class="point"
      @pointerdown="onPointDown($event, p.index)"
      @contextmenu="onPointRightClick($event, p.index)"
    />
  </svg>
</template>

<style scoped>
.envelope {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.baseline {
  stroke: rgb(255 255 255 / 0.15);
  stroke-width: 0.5;
  stroke-dasharray: 2 2;
  vector-effect: non-scaling-stroke;
}
.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
.point {
  fill: #fff;
  stroke: var(--accent);
  stroke-width: 1;
  cursor: grab;
  vector-effect: non-scaling-stroke;
}
</style>
