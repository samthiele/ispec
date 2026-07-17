const SVG_NS = 'http://www.w3.org/2000/svg'
const PLOT_BACKGROUND = '#121316'
const PNG_EXPORT_SCALE = 2

function triggerBlobDownload(filename, blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function prepareSvgClone(svg) {
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  if (!clone.getAttribute('width') && svg.width?.baseVal?.value) {
    clone.setAttribute('width', String(svg.width.baseVal.value))
  }
  if (!clone.getAttribute('height') && svg.height?.baseVal?.value) {
    clone.setAttribute('height', String(svg.height.baseVal.value))
  }

  return clone
}

function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function inlineSvgCssVariables(svgMarkup) {
  const replacements = {
    'var(--border-color)': cssVar('--border-color', '#3c4043'),
    'var(--text-muted)': cssVar('--text-muted', '#9aa0a6'),
    'var(--text-color)': cssVar('--text-color', '#e8eaed'),
  }

  let markup = svgMarkup
  for (const [token, value] of Object.entries(replacements)) {
    markup = markup.replaceAll(token, value)
  }
  return markup
}

function serializeSvg(svg) {
  return inlineSvgCssVariables(new XMLSerializer().serializeToString(prepareSvgClone(svg)))
}

function svgDimensions(svg) {
  const rect = svg.getBoundingClientRect()
  const attrWidth = Number(svg.getAttribute('width'))
  const attrHeight = Number(svg.getAttribute('height'))
  const width = Number(svg.width?.baseVal?.value ?? attrWidth ?? rect.width)
  const height = Number(svg.height?.baseVal?.value ?? attrHeight ?? rect.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Plot SVG has invalid dimensions')
  }
  return { width, height }
}

export function downloadPlotSvg(svg, filename) {
  const blob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' })
  triggerBlobDownload(filename.endsWith('.svg') ? filename : `${filename}.svg`, blob)
}

export async function downloadPlotPng(
  svg,
  filename,
  { background = PLOT_BACKGROUND, scale = PNG_EXPORT_SCALE } = {},
) {
  const { width, height } = svgDimensions(svg)
  const exportWidth = Math.max(1, Math.round(width * scale))
  const exportHeight = Math.max(1, Math.round(height * scale))
  const url = URL.createObjectURL(
    new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' }),
  )

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to render plot PNG'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = exportWidth
    canvas.height = exportHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')

    context.fillStyle = background
    context.fillRect(0, 0, exportWidth, exportHeight)
    context.drawImage(image, 0, 0, exportWidth, exportHeight)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else reject(new Error('Failed to encode plot PNG'))
      }, 'image/png')
    })

    triggerBlobDownload(filename.endsWith('.png') ? filename : `${filename}.png`, blob)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function findPlotSvg(container) {
  if (!container) return null
  return container.querySelector('.spectra-svg, .biplot-svg')
}
