import type { Pt } from '@/lib/geometry'

export type ToolMode = 'select' | 'pan' | 'wall' | 'door' | 'window' | 'dimension' | 'measure'

export interface DocSettings {
  wallColor: string
  wallThickness: number // mm
  dimColor: string
  dimStrokeWidth: number // px（屏幕分辨率下的标注线宽）
  bgColor: string
  gridColor: string
  showGrid: boolean
  showRulers: boolean
  ortho: boolean
  snapEnabled: boolean
  snapTol: number // px
}

export interface WallElement {
  id: string
  kind: 'wall'
  points: Pt[]
  closed: boolean
  thickness: number
  color: string
}

export interface DoorElement {
  id: string
  kind: 'door'
  wallId: string
  /** 沿墙中心线距起点的距离 mm */
  offset: number
  /** 门洞宽度 mm */
  width: number
  /** 合页位于洞口的起点端还是终点端 */
  hinge: 'start' | 'end'
  /** 门扇开启方向（相对左法向量的一侧） */
  swingSide: 1 | -1
  color: string
}

export interface WindowElement {
  id: string
  kind: 'window'
  wallId: string
  offset: number
  width: number
  color: string
}

export interface DimensionElement {
  id: string
  kind: 'dimension'
  p1: Pt
  p2: Pt
  /** 标注线相对被测线段的偏移距离 mm（正负决定方向） */
  offsetDistance: number
  color: string
  strokeWidth: number
}

export interface FurnitureElement {
  id: string
  kind: 'furniture'
  defId: string
  x: number
  y: number
  width: number
  height: number
  /** 旋转角（弧度，屏幕坐标系） */
  rotation: number
  label?: string
}

export type FloorElement =
  | WallElement
  | DoorElement
  | WindowElement
  | DimensionElement
  | FurnitureElement

export type ElementKind = FloorElement['kind']

export interface DocModel {
  version: number
  settings: DocSettings
  elements: FloorElement[]
}

/** 从墙体中心线推导的闭合房间 */
export interface RoomFace {
  id: string
  points: Pt[]
  area: number
  perimeter: number
  wallIds: string[]
}

export interface SelectionBox {
  id: string
}
