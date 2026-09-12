<script setup lang="ts">
/**
 * 线性尺寸标注：被测点 p1-p2，标注线按法向偏移 offsetDistance；
 * 两端延伸线 + 斜端 tick + 中部长度文本。
 */
import { computed } from 'vue'
import type { DimensionElement } from '@/types'
import { Vec2 } from '@/lib/geometry'
import { formatLength } from '@/lib/format'

const props = defineProps<{
  dim: DimensionElement
  selected: boolean
  scale: number
}>()

const g = computed(() => {
  const dx = props.dim.p2.x - props.dim.p1.x
  const dy = props.dim.p2.y - props.dim.p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const off = props.dim.offsetDistance
  const q1 = { x: props.dim.p1.x + nx * off, y: props.dim.p1.y + ny * off }
  const q2 = { x: props.dim.p2.x + nx * off, y: props.dim.p2.y + ny * off }
  const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }
  const tick = 60
  const ext = 80
  const lenMm = Vec2.dist(props.dim.p1, props.dim.p2)
  return { q1, q2, mid, nx, ny, tick, ext, lenMm }
})

const fontSize = computed(() => 13 / props.scale)
const sw = computed(() => props.dim.strokeWidth / props.scale)
const tickSkew = computed(() => 40 / props.scale)
</script>

<template>
  <g class="dimension-shape">
    <!-- 延伸线 -->
    <line
      :x1="dim.p1.x - g.nx * 20"
      :y1="dim.p1.y - g.ny * 20"
      :x2="g.q1.x + g.nx * g.ext"
      :y2="g.q1.y + g.ny * g.ext"
      :stroke="dim.color"
      :stroke-width="sw"
    />
    <line
      :x1="dim.p2.x - g.nx * 20"
      :y1="dim.p2.y - g.ny * 20"
      :x2="g.q2.x + g.nx * g.ext"
      :y2="g.q2.y + g.ny * g.ext"
      :stroke="dim.color"
      :stroke-width="sw"
    />
    <!-- 标注线 -->
    <line :x1="g.q1.x" :y1="g.q1.y" :x2="g.q2.x" :y2="g.q2.y" :stroke="dim.color" :stroke-width="sw" />
    <!-- 端点斜 tick -->
    <line
      :x1="g.q1.x + g.nx * tickSkew"
      :y1="g.q1.y + g.ny * tickSkew"
      :x2="g.q1.x - g.nx * tickSkew"
      :y2="g.q1.y - g.ny * tickSkew"
      :transform="`rotate(30 ${g.q1.x} ${g.q1.y})`"
      :stroke="dim.color"
      :stroke-width="sw"
    />
    <line
      :x1="g.q2.x + g.nx * tickSkew"
      :y1="g.q2.y + g.ny * tickSkew"
      :x2="g.q2.x - g.nx * tickSkew"
      :y2="g.q2.y - g.ny * tickSkew"
      :transform="`rotate(30 ${g.q2.x} ${g.q2.y})`"
      :stroke="dim.color"
      :stroke-width="sw"
    />
    <!-- 文本底色（mask 挖白） -->
    <rect
      :x="g.mid.x - formatLength(g.lenMm).length * fontSize * 0.32"
      :y="g.mid.y - fontSize * 0.7"
      :width="formatLength(g.lenMm).length * fontSize * 0.64"
      :height="fontSize * 1.4"
      :fill="'#ffffff'"
      opacity="0.9"
    />
    <text
      :x="g.mid.x"
      :y="g.mid.y"
      :font-size="fontSize"
      :fill="dim.color"
      text-anchor="middle"
      dominant-baseline="central"
      style="font-family: ui-monospace, Menlo, Consolas, monospace"
    >{{ formatLength(g.lenMm) }}</text>

    <!-- 选中手柄 -->
    <template v-if="selected">
      <circle data-selected-ui :cx="dim.p1.x" :cy="dim.p1.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
      <circle data-selected-ui :cx="dim.p2.x" :cy="dim.p2.y" :r="5 / scale" fill="#409eff" stroke="#fff" :stroke-width="sw" />
    </template>
  </g>
</template>
