import { normalizeAppState, toShareableState } from './appState.js'
import { parseShareHashFragment } from './shareState.js'

const STATE_FENCE_PATTERN = /```ispec-state\s*\n([\s\S]*?)```/gi
const SHARE_HASH_PATTERN = /#s=([A-Za-z0-9\-._~!$&'()*+,;=:@%/]+)/gi

export function extractStateBlocks(text) {
  const blocks = []
  let displayText = text

  displayText = displayText.replace(STATE_FENCE_PATTERN, (match, jsonText) => {
    try {
      const parsed = JSON.parse(jsonText.trim())
      blocks.push({ source: 'fence', parsed, raw: jsonText.trim() })
      return ''
    } catch {
      return match
    }
  })

  const urlMatches = [...displayText.matchAll(SHARE_HASH_PATTERN)]
  for (const match of urlMatches) {
    const parsed = parseShareHashFragment(match[0])
    if (parsed) {
      blocks.push({ source: 'url', parsed, raw: match[0] })
      displayText = displayText.replace(match[0], '').trim()
    }
  }

  return {
    displayText: displayText.replace(/\n{3,}/g, '\n\n').trim(),
    blocks,
  }
}

export function mergeStateProposal(currentState, proposal) {
  return normalizeAppState({
    ...toShareableState(currentState),
    ...proposal,
  })
}

export function formatStateProposalPreview(state) {
  const lines = []
  if (state.query) {
    lines.push(`Search: ${state.query}`)
  }
  if (state.selection?.length) {
    lines.push(`Selection: ${state.selection.length} spectrum/spectra`)
  }
  if (state.libraries?.length) {
    lines.push(`Libraries: ${state.libraries.join(', ')}`)
  }
  if (state.viewMode) {
    lines.push(`Layout: ${state.viewMode}`)
  }
  const biplotPane = state.panes?.find((pane) => pane.type === 'biplot')
  if (biplotPane?.state?.xExpr || biplotPane?.state?.yExpr) {
    lines.push(
      `Biplot: x=${biplotPane.state.xExpr ?? 'default'}, y=${biplotPane.state.yExpr ?? 'default'}`,
    )
  }
  const mixCount = Object.keys(state.virtualMixRecipes ?? {}).length
  if (mixCount > 0) {
    lines.push(`Virtual mixes: ${mixCount}`)
  }
  if (lines.length === 0) {
    lines.push('App configuration update')
  }
  return lines
}
