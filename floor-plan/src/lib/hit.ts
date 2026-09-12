/**
 * 命中检测：返回给定世界坐标下可选中的图元
 */
import type { FloorElement, WallElement, DoorElement, WindowElement, FurnitureElement, DimensionElement } from '@/types'
import { bboxOf, pointInRect, pointPolylineDist, type Pt } from './geometry'
import { openingPlacement, type Opening } from './openings'

export type HitKind = FloorElement['kind'] | 'door-swing' | 'dim-handle'

export interface HitResult {
  id: string
  kind: HitKind
  /** 门/窗的特殊手柄，或标注的端点序号 */
  handle?: 'start' | 'end' | 'offset'
  dist: number
}

function hitFurniture(f: FurnitureElement, p: Pt): boolean {
  // 将世界点反旋转（-rotation）到家具局部坐标系，再做轴对齐矩形判定。
  // 渲染时世界 = 局部绕中心旋转 +rotation，这里方向必须与之相反。
  const dx = p.x - f.x
  const dy = p.y - f.y
  const c = Math.cos(-f.rotation)
  const s = Math.sin(-f.rotation)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  return Math.abs(lx) <= f.width / 2 && Math.abs(ly) <= f.height / 2
}

function hitDimension(d: DimensionElement, p: Pt, tolMm: number): HitResult | null {
  // 端点手柄
  if (Math.hypot(p.x - d.p1.x, p.y - d.p1.y) <= tolMm) {
    return { id: d.id, kind: 'dim-handle', handle: 'start', dist: 0 }
  }
  if (Math.hypot(p.x - d.p2.x, p.y - d.p2.y) <= tolMm) {
    return { id: d.id, kind: 'dim-handle', handle: 'end', dist: 0 }
  }
  // 标注线（p1/p2 的平行线，偏移 offsetDistance）
  const dx = d.p2.x - d.p1.x
  const dy = d.p2.y - d.p1.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const q1 = { x: d.p1.x + nx * d.offsetDistance, y: d.p1.y + ny * d.offsetDistance }
  const q2 = { x: d.p2.x + nx * d.offsetDistance, y: d.p2.y + ny * d.offsetDistance }
  const r = pointPolylineDist(p, [q1, q2], false)
  if (r && r.dist <= tolMm) {
    return { id: d.id, kind: 'dimension', handle: 'offset', dist: r.dist }
  }
  // 引线
  const r1 = pointPolylineDist(p, [d.p1, q1], false)
  const r2 = pointPolylineDist(p, [d.p2, q2], false)
  if (r1 && r1.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r1.dist }
  if (r2 && r2.dist <= tolMm) return { id: d.id, kind: 'dimension', dist: r2.dist }
  return null
}

function hitOpening(wall: WallElement, op: Opening, p: Pt, tolMm: number): HitResult | null {
  const pl = openingPlacement(wall, op)
  if (!pl) return null
  // 洞口中心线段（沿整墙厚度方向都可点中）
  const r = pointPolylineDist(p, [pl.pStart, pl.pEnd], false)
  if (r && r.dist <= tolMm + wall.thickness / 2) {
    return { id: op.id, kind: op.kind, dist: r.dist }
  }
  return null
}

/**
 * 命中检测主入口
 * @param tolMm 容差（世界坐标 mm）
 */
export function hitTest(elements: FloorElement[], p: Pt, tolMm: number): HitResult | null {
  // 反向遍历（后绘制的在上层）
  const wallMap = new Map<string, WallElement>()
  for (const e of elements) if (e.kind === 'wall') wallMap.set(e.id, e)

  const hits: HitResult[] = []
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (el.kind === 'furniture') {
      if (hitFurniture(el, p)) hits.push({ id: el.id, kind: 'furniture', dist: 0 })
    } else if (el.kind === 'dimension') {
      const h = hitDimension(el, p, tolMm)
      if (h) hits.push(h)
    } else if (el.kind === 'wall') {
      const r = pointPolylineDist(p, el.points, el.closed)
      if (r && r.dist <= tolMm + el.thickness / 2) {
        hits.push({ id: el.id, kind: 'wall', dist: r.dist })
      }
    } else if (el.kind === 'door' || el.kind === 'window') {
      const wall = wallMap.get(el.wallId)
      if (wall) {
        const h = hitOpening(wall, el as DoorElement | WindowElement, p, tolMm)
        if (h) hits.push(h)
      }
    }
  }

  // 小图元（门窗、标注）优先于墙
  const priority: Record<HitKind, number> = {
    'dim-handle': 0,
    door: 1,
    window: 1,
    dimension: 2,
    furniture: 3,
    wall: 4,
    'door-swing': 1
  }
  hits.sort((a, b) => priority[a.kind] - priority[b.kind] || a.dist - b.dist)
  return hits[0] ?? null
}

/** 框选：返回落在矩形内（点命中）的元素 id */
export function boxSelect(elements: FloorElement[], rect: { x: number; y: number; width: number; height: number }, walls: WallElement[]): string[] {
  const ids: string[] = []
  for (const el of elements) {
    if (el.kind === 'wall') {
      if (el.points.some((p) => pointInRect(p, rect))) ids.push(el.id)
    } else if (el.kind === 'furniture') {
      const bb = bboxOf([
        { x: el.x - el.width / 2, y: el.y - el.height / 2 },
        { x: el.x + el.width / 2, y: el.y + el.height / 2 }
      ])
      if (
        pointInRect({ x: bb.x, y: bb.y }, rect) ||
        pointInRect({ x: bb.x + bb.width, y: bb.y + bb.height }, rect) ||
        pointInRect({ x: el.x, y: el.y }, rect)
      ) {
        ids.push(el.id)
      }
    } else if (el.kind === 'dimension') {
      if (pointInRect(el.p1, rect) || pointInRect(el.p2, rect)) ids.push(el.id)
    } else if (el.kind === 'door' || el.kind === 'window') {
      const wall = walls.find((x) => x.id === el.wallId)
      if (wall) {
        const pl = openingPlacement(wall, el)
        if (pl && pointInRect(pl.center, rect)) ids.push(el.id)
      }
    }
  }
  return ids
}
