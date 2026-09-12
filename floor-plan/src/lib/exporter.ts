/**
 * 高清 PNG 导出
 *
 * 直接从画布的世界内容组中挑选可见图元（墙/门窗/家具/标注/房间），
 * 深拷贝到全新的独立 SVG，按图纸包围盒设置 viewBox，
 * 绘制到 2D Canvas（支持 2x/3x 超采样）后导出 PNG。
 * 兜底：html2canvas 截取当前 DOM。
 */
import html2canvas from 'html2canvas'
import type { FloorElement } from '@/types'
import { bboxOf, type Pt } from './geometry'

/** 需要导出的图元 CSS 类（按 DOM 顺序） */
const EXPORT_SELECTOR = [
  '.room-face',
  '.wall-shape',
  '.door-shape',
  '.window-shape',
  '.furniture-shape',
  '.dimension-shape'
].join(',')

/** 计算所有图元覆盖的世界坐标包围盒 */
export function contentBBox(elements: FloorElement[], pad = 400) {
  const pts: Pt[] = []
  for (const el of elements) {
    if (el.kind === 'wall') pts.push(...el.points)
    else if (el.kind === 'furniture')
      pts.push(
        { x: el.x - el.width / 2, y: el.y - el.height / 2 },
        { x: el.x + el.width / 2, y: el.y + el.height / 2 }
      )
    else if (el.kind === 'dimension') pts.push(el.p1, el.p2)
  }
  if (pts.length === 0) return { x: -3000, y: -3000, width: 6000, height: 6000 }
  return bboxOf(pts, pad)
}

export interface ExportOptions {
  /** 超采样倍数 */
  pixelRatio?: number
  background?: string
  /** 世界坐标包围盒 */
  bbox: { x: number; y: number; width: number; height: number }
  /** 输出基准像素/毫米（导出分辨率，与当前视口缩放无关） */
  ppm?: number
  /** 宽高上限（像素），避免超大图纸爆内存 */
  maxPixels?: number
}

export async function exportPng(svgEl: SVGSVGElement, opts: ExportOptions): Promise<void> {
  const ratio = opts.pixelRatio ?? 2
  let ppm = opts.ppm ?? 0.5

  const NS = 'http://www.w3.org/2000/svg'
  let wPx = Math.round(opts.bbox.width * ppm)
  let hPx = Math.round(opts.bbox.height * ppm)

  // 按最长边限制基准分辨率（超采样前）
  const maxSide = (opts.maxPixels ?? 6000)
  const m = Math.max(wPx, hPx)
  if (m > maxSide) {
    ppm *= maxSide / m
    wPx = Math.round(opts.bbox.width * ppm)
    hPx = Math.round(opts.bbox.height * ppm)
  }

  const worldContent = svgEl.querySelector('.world-content')
  if (!worldContent) throw new Error('未找到画布内容')

  const outSvg = document.createElementNS(NS, 'svg')
  outSvg.setAttribute('xmlns', NS)
  outSvg.setAttribute('width', String(wPx))
  outSvg.setAttribute('height', String(hPx))
  outSvg.setAttribute('viewBox', `0 0 ${wPx} ${hPx}`)

  // 背景（viewBox 像素坐标）
  const bg = document.createElementNS(NS, 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', String(wPx))
  bg.setAttribute('height', String(hPx))
  bg.setAttribute('fill', opts.background ?? '#ffffff')
  outSvg.appendChild(bg)

  // 世界 -> 输出像素：平移包围盒左上 + ppm 缩放
  const group = document.createElementNS(NS, 'g')
  group.setAttribute(
    'transform',
    `translate(${-opts.bbox.x * ppm} ${-opts.bbox.y * ppm}) scale(${ppm})`
  )

  // 逐图元深拷贝（已包含全部世界坐标几何）
  const maskNode = worldContent.querySelector('#wall-openings-mask')
  if (maskNode) {
    const defs = document.createElementNS(NS, 'defs')
    const clonedMask = maskNode.cloneNode(true)
    defs.appendChild(clonedMask)
    outSvg.appendChild(defs)
  }
  worldContent.querySelectorAll(EXPORT_SELECTOR).forEach((node) => {
    const clone = node.cloneNode(true) as Element
    // 移除选中态装饰（虚线中心线、手柄、旋转/缩放把手、选中框）
    clone
      .querySelectorAll('[data-selected-ui]')
      .forEach((ui) => ui.parentNode?.removeChild(ui))
    group.appendChild(clone)
  })
  outSvg.appendChild(group)

  const xml = new XMLSerializer().serializeToString(outSvg)
  const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
  const img = await svgStringToImage(svgText)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(wPx * ratio)
  canvas.height = Math.round(hPx * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 上下文')
  ctx.fillStyle = opts.background ?? '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(ratio, ratio)
  ctx.drawImage(img, 0, 0, wPx, hPx)

  const url = canvas.toDataURL('image/png')
  triggerDownload(url, `floorplan_${Date.now()}.png`)
}

function svgStringToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** 兜底：html2canvas 截取容器 DOM */
export async function exportPngByDom(el: HTMLElement, pixelRatio = 2): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: pixelRatio,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false
  })
  triggerDownload(canvas.toDataURL('image/png'), `floorplan_${Date.now()}.png`)
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
