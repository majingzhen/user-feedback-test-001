<script setup>
import { computed } from 'vue'

import { useProjectStore } from '@/stores/project'
import TimelineClip from '@/components/timeline_clip.vue'
import TransitionBlock from '@/components/transition_block.vue'

const props = defineProps({
  track: { type: Object, required: true },
  height: { type: Number, required: true },
  width: { type: Number, required: true },
})

const store = useProjectStore()
const transitions = computed(() =>
  store.project.transitions.filter(t => t.trackId === props.track.id)
)
</script>

<template>
  <div
    class="lane"
    :data-track-id="track.id"
    :style="{ height: height + 'px', width: width + 'px' }"
  >
    <TimelineClip
      v-for="clip in track.clips"
      :key="clip.id"
      :clip="clip"
      :track="track"
    />
    <TransitionBlock
      v-for="tr in transitions"
      :key="tr.id"
      :transition="tr"
    />
  </div>
</template>

<style scoped>
.lane {
  position: relative;
  border-bottom: 1px solid var(--border);
  background:
    repeating-linear-gradient(90deg, transparent 0, transparent 59px, rgb(255 255 255 / 0.02) 60px);
}
</style>
