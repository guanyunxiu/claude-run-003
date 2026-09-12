/**
 * 编辑器全局状态：文档模型、历史栈、视图、模式、选中集
 */
import { computed, reactive, shallowRef } from 'vue'
import type {
  DimensionElement,
  DocModel,
  DocSettings,
  FloorElement,
  FurnitureElement,
  RoomFace,
  ToolMode
} from '@/types'
import { uid } from '@/lib/uid'
import { extractRooms } from '@/lib/walls'
import type { WallElement } from '@/types'
import type { Pt } from '@/lib/geometry'

const DEFAULT_SETTINGS: DocSettings = {
  wallColor: '#303133',
  wallThickness: 120,
  dimColor: '#f56c6c',
  dimStrokeWidth: 1,
  bgColor: '#ffffff',
  gridColor: '#dfe4ea',
  showGrid: true,
  showRulers: true,
  ortho: true,
  snapEnabled: true,
  snapTol: 12
}

function createDoc(): DocModel {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    elements: []
  }
}

interface Viewport {
  scale: number
  /** 世界原点在屏幕坐标系中的位置（考虑标尺边距） */
  tx: number
  ty: number
}

interface EditorState {
  doc: DocModel
  mode: ToolMode
  selection: Set<string>
  viewport: Viewport
  /** 标尺占用边距 */
  rulerSize: number
  /** 鼠标在世界坐标的位置（状态条/吸附提示用） */
  cursorWorld: Pt | null
  /** 临时测距结果（不落库） */
  measure: { p1: Pt; p2: Pt } | null
  /** 画墙进行中的临时点 */
  wallDraft: Pt[]
  /** 画墙时的吸附点（屏幕层高亮） */
  snapMarker: Pt | null
}

const state = reactive<EditorState>({
  doc: createDoc(),
  mode: 'select',
  selection: new Set(),
  viewport: { scale: 0.5, tx: 400, ty: 300 },
  rulerSize: 24,
  cursorWorld: null,
  measure: null,
  wallDraft: [],
  snapMarker: null
})

// ---------------------------------------------------------------------------
// 历史栈：对 doc 做深拷贝快照
// ---------------------------------------------------------------------------
const undoStack: DocModel[] = []
const redoStack: DocModel[] = []
const HISTORY_LIMIT = 80

function cloneDoc(doc: DocModel): DocModel {
  return JSON.parse(JSON.stringify(doc)) as DocModel
}

function pushHistory() {
  undoStack.push(cloneDoc(state.doc))
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
}

const canUndo = shallowRef(false)
const canRedo = shallowRef(false)

function refreshHistoryFlags() {
  canUndo.value = undoStack.length > 0
  canRedo.value = redoStack.length > 0
}

function undo() {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(cloneDoc(state.doc))
  state.doc = prev
  pruneSelection()
  refreshHistoryFlags()
}

function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(cloneDoc(state.doc))
  state.doc = next
  pruneSelection()
  refreshHistoryFlags()
}

function pruneSelection() {
  const ids = new Set(state.doc.elements.map((e) => e.id))
  for (const id of [...state.selection]) {
    if (!ids.has(id)) state.selection.delete(id)
  }
}

// ---------------------------------------------------------------------------
// 元素操作
// ---------------------------------------------------------------------------
function addElement<T extends FloorElement>(el: T, record = true): T {
  if (record) pushHistory()
  state.doc.elements.push(el)
  return el
}

function updateElement(id: string, patch: Partial<FloorElement>, record = false) {
  const el = state.doc.elements.find((e) => e.id === id)
  if (!el) return
  if (record) pushHistory()
  Object.assign(el, patch)
}

function removeElements(ids: Set<string> | string[], record = true) {
  const idset = ids instanceof Set ? ids : new Set(ids)
  if (record) pushHistory()
  state.doc.elements = state.doc.elements.filter((e) => {
    if (idset.has(e.id)) return false
    // 依附墙体被删除时，门窗一并删除
    if ((e.kind === 'door' || e.kind === 'window') && idset.has(e.wallId)) return false
    return true
  })
  for (const id of idset) state.selection.delete(id)
  pruneSelection()
}

function getElement(id: string): FloorElement | undefined {
  return state.doc.elements.find((e) => e.id === id)
}

// ---------------------------------------------------------------------------
// 选择
// ---------------------------------------------------------------------------
function selectOnly(ids: string[] = []) {
  state.selection = new Set(ids)
}

function toggleSelect(id: string) {
  if (state.selection.has(id)) state.selection.delete(id)
  else state.selection.add(id)
}

const selectedElements = computed<FloorElement[]>(() =>
  state.doc.elements.filter((e) => state.selection.has(e.id))
)

// ---------------------------------------------------------------------------
// 房间（由墙体自动推导）
// ---------------------------------------------------------------------------
const walls = computed<WallElement[]>(() =>
  state.doc.elements.filter((e): e is WallElement => e.kind === 'wall')
)

const rooms = computed<RoomFace[]>(() => {
  try {
    return extractRooms(walls.value).map((r, i) => ({
      id: `room_${i}`,
      points: r.points,
      area: r.area,
      perimeter: r.perimeter,
      wallIds: r.wallIds
    }))
  } catch {
    return []
  }
})

// ---------------------------------------------------------------------------
// 便捷工厂
// ---------------------------------------------------------------------------
function makeWall(points: Pt[], closed = false): WallElement {
  return {
    id: uid('wall'),
    kind: 'wall',
    points: points.map((p) => ({ ...p })),
    closed,
    thickness: state.doc.settings.wallThickness,
    color: state.doc.settings.wallColor
  }
}

function makeFurniture(defId: string, x: number, y: number, width: number, height: number): FurnitureElement {
  return { id: uid('fur'), kind: 'furniture', defId, x, y, width, height, rotation: 0 }
}

function makeDimension(p1: Pt, p2: Pt, offsetDistance = 400): DimensionElement {
  return {
    id: uid('dim'),
    kind: 'dimension',
    p1: { ...p1 },
    p2: { ...p2 },
    offsetDistance,
    color: state.doc.settings.dimColor,
    strokeWidth: state.doc.settings.dimStrokeWidth
  }
}

function setMode(mode: ToolMode) {
  state.mode = mode
  state.measure = null
  state.wallDraft = []
  state.snapMarker = null
  if (mode !== 'select') state.selection = new Set()
}

function updateSettings(patch: Partial<DocSettings>, record = false) {
  if (record) pushHistory()
  Object.assign(state.doc.settings, patch)
}

function clearAll() {
  pushHistory()
  state.doc.elements = []
  state.selection = new Set()
  state.measure = null
  state.wallDraft = []
}

function loadDoc(doc: DocModel) {
  pushHistory()
  state.doc = doc
  pruneSelection()
}

export function useEditor() {
  return {
    state,
    rawState: state,
    walls,
    rooms,
    selectedElements,
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    refreshHistoryFlags,
    addElement,
    updateElement,
    removeElements,
    getElement,
    selectOnly,
    toggleSelect,
    makeWall,
    makeFurniture,
    makeDimension,
    setMode,
    updateSettings,
    clearAll,
    loadDoc,
    cloneDoc,
    uid
  }
}
