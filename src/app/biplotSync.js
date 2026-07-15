function toBiplotPayload(exported) {
  if (!exported) {
    return { points: [], errors: [] }
  }

  if (typeof exported.get === 'function') {
    const pointsRaw = exported.get('points')
    const errorsRaw = exported.get('errors')
    const points = []
    const errors = []

    if (pointsRaw && typeof pointsRaw.get === 'function') {
      for (let i = 0; i < pointsRaw.length; i += 1) {
        points.push(parseBiplotPoint(pointsRaw.get(i)))
      }
    } else if (Array.isArray(pointsRaw)) {
      for (const item of pointsRaw) {
        points.push(parseBiplotPoint(item))
      }
    }

    if (errorsRaw && typeof errorsRaw.get === 'function') {
      for (let i = 0; i < errorsRaw.length; i += 1) {
        const item = errorsRaw.get(i)
        errors.push({
          name: String(item.get('name')),
          error: String(item.get('error')),
        })
        item.destroy?.()
      }
    } else if (Array.isArray(errorsRaw)) {
      for (const item of errorsRaw) {
        errors.push({
          name: String(item.name),
          error: String(item.error),
        })
      }
    }

    pointsRaw?.destroy?.()
    errorsRaw?.destroy?.()
    exported.destroy?.()
    return { points, errors }
  }

  return {
    points: Array.isArray(exported.points) ? exported.points.map(parseBiplotPoint) : [],
    errors: Array.isArray(exported.errors)
      ? exported.errors.map((item) => ({ name: String(item.name), error: String(item.error) }))
      : [],
  }
}

function parseBiplotPoint(item) {
  if (item && typeof item.get === 'function') {
    const point = {
      name: String(item.get('name')),
      rank: item.get('rank') == null ? null : Number(item.get('rank')),
      score: item.get('score') == null ? null : Number(item.get('score')),
      selected: Boolean(item.get('selected')),
      x: Number(item.get('x')),
      y: Number(item.get('y')),
      color: parseOptionalNumber(item.get('color')),
      opacity: parseOptionalNumber(item.get('opacity')),
      size: parseOptionalNumber(item.get('size')),
    }
    item.destroy?.()
    return point
  }

  return {
    name: String(item.name),
    rank: item.rank == null ? null : Number(item.rank),
    score: item.score == null ? null : Number(item.score),
    selected: Boolean(item.selected),
    x: Number(item.x),
    y: Number(item.y),
    color: parseOptionalNumber(item.color),
    opacity: parseOptionalNumber(item.opacity),
    size: parseOptionalNumber(item.size),
  }
}

function parseOptionalNumber(value) {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function exportBiplotData(
  pyodide,
  {
    pageStart,
    pageEnd,
    lookupMap = {},
    xExpr,
    yExpr,
    width = 50,
    colorExpr = '',
    opacityExpr = '',
    sizeExpr = '',
  },
) {
  const exported = await pyodide.runPythonAsync(
    `export_biplot_data(${Number(pageStart)}, ${Number(pageEnd)}, ${JSON.stringify(lookupMap)}, ${JSON.stringify(xExpr)}, ${JSON.stringify(yExpr)}, width=${Number(width)}, color_expr=${JSON.stringify(colorExpr)}, opacity_expr=${JSON.stringify(opacityExpr)}, size_expr=${JSON.stringify(sizeExpr)})`,
  )
  return toBiplotPayload(exported)
}
