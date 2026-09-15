/**
 * Generates high-fidelity SVG terminal cards for the Alpheus README.
 *
 * Emits vector box-drawing lines for gapless rounded/straight terminal borders,
 * parses ANSI SGR styling and colors, and renders cards on the AraneaDev dark ground palette.
 *
 * Usage:
 *   bun run scripts/generate-screenshots.ts
 *   bun run scripts/generate-screenshots.ts "<command>" <out.svg> < input.txt
 */
process.env.FORCE_COLOR = '3'

import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { MiasmaItem, PurgeSummary } from '../src/scanner/types.ts'

const CELL_W = 8.5
const CELL_H = 19
const PAD = 20
const RADIUS = 8

const GROUND = '#10151d'
const RULE = '#26303d'
const BODY = '#b8c0cb'
const DIM = '#63707f'
const BONE = '#ece5d5'

const BASE_COLORS: Record<number, string> = {
  0: '#3b4048', // Black
  1: '#cf6a63', // Red
  2: '#7fb3a3', // Green
  3: '#d8a13f', // Yellow
  4: '#61afef', // Blue
  5: '#c678dd', // Magenta
  6: '#56b6c2', // Cyan
  7: '#b8c0cb', // White / Body
  8: '#63707f', // Bright Black (Dim)
  9: '#ff7b86', // Bright Red
  10: '#98c379', // Bright Green
  11: '#e5c07b', // Bright Yellow
  12: '#7cc3ff', // Bright Blue
  13: '#dd9ce8', // Bright Magenta
  14: '#6fd3de', // Bright Cyan
  15: '#ece5d5', // Bright White (Bone)
}

const BOX_SEGMENTS: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {
  '─': [true, true, false, false, false],
  '│': [false, false, true, true, false],
  '┌': [false, true, false, true, false],
  '┐': [true, false, false, true, false],
  '└': [false, true, true, false, false],
  '┘': [true, false, true, false, false],
  '╭': [false, true, false, true, true],
  '╮': [true, false, false, true, true],
  '╰': [false, true, true, false, true],
  '╯': [true, false, true, false, true],
  '├': [false, true, true, true, false],
  '┤': [true, false, true, true, false],
  '┬': [true, true, false, true, false],
  '┴': [true, true, true, false, false],
  '┼': [true, true, true, true, false],
}

interface TextStyle {
  fg: string
  bg: string | null
  bold: boolean
  dim: boolean
}

interface TextSpan {
  text: string
  style: TextStyle
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseAnsi(line: string): TextSpan[] {
  const spans: TextSpan[] = []
  let style: TextStyle = { fg: BODY, bg: null, bold: false, dim: false }
  let text = ''

  const push = () => {
    if (text) {
      spans.push({ text, style: { ...style } })
      text = ''
    }
  }

  const pattern = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(line)) !== null) {
    text += line.slice(lastIndex, match.index)
    push()

    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number)
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) {
        style = { fg: BODY, bg: null, bold: false, dim: false }
      } else if (c === 1) {
        style.bold = true
      } else if (c === 2) {
        style.dim = true
      } else if (c === 22) {
        style.bold = false
        style.dim = false
      } else if (c >= 30 && c <= 37) {
        style.fg = BASE_COLORS[c - 30] || BODY
      } else if (c >= 90 && c <= 97) {
        style.fg = BASE_COLORS[c - 90 + 8] || DIM
      } else if (c === 39) {
        style.fg = BODY
      }
    }
    lastIndex = match.index + match[0].length
  }

  text += line.slice(lastIndex)
  push()
  return spans
}

function renderBox(char: string, cellX: number, cellTop: number, color: string): string[] {
  const reach = BOX_SEGMENTS[char]
  if (!reach) return []
  const [left, right, up, down, rounded] = reach
  const midX = cellX + CELL_W / 2
  const midY = cellTop + CELL_H / 2
  const out: string[] = []

  const l = (x1: number, y1: number, x2: number, y2: number) => {
    out.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="1.2" shape-rendering="crispEdges"/>`,
    )
  }

  if (rounded) {
    const r = 4
    if (char === '╭') {
      out.push(
        `<path d="M ${midX.toFixed(1)} ${(midY + r).toFixed(1)} A ${r} ${r} 0 0 1 ${(midX + r).toFixed(1)} ${midY.toFixed(1)}" stroke="${color}" stroke-width="1.2" fill="none"/>`,
      )
      l(midX + r, midY, cellX + CELL_W, midY)
      l(midX, midY + r, midX, cellTop + CELL_H)
    } else if (char === '╮') {
      out.push(
        `<path d="M ${(midX - r).toFixed(1)} ${midY.toFixed(1)} A ${r} ${r} 0 0 1 ${midX.toFixed(1)} ${(midY + r).toFixed(1)}" stroke="${color}" stroke-width="1.2" fill="none"/>`,
      )
      l(cellX, midY, midX - r, midY)
      l(midX, midY + r, midX, cellTop + CELL_H)
    } else if (char === '╰') {
      out.push(
        `<path d="M ${midX.toFixed(1)} ${(midY - r).toFixed(1)} A ${r} ${r} 0 0 0 ${(midX + r).toFixed(1)} ${midY.toFixed(1)}" stroke="${color}" stroke-width="1.2" fill="none"/>`,
      )
      l(midX, cellTop, midX, midY - r)
      l(midX + r, midY, cellX + CELL_W, midY)
    } else if (char === '╯') {
      out.push(
        `<path d="M ${(midX - r).toFixed(1)} ${midY.toFixed(1)} A ${r} ${r} 0 0 0 ${midX.toFixed(1)} ${(midY - r).toFixed(1)}" stroke="${color}" stroke-width="1.2" fill="none"/>`,
      )
      l(cellX, midY, midX - r, midY)
      l(midX, cellTop, midX, midY - r)
    }
    return out
  }

  if (left) l(cellX, midY, midX, midY)
  if (right) l(midX, midY, cellX + CELL_W, midY)
  if (up) l(midX, cellTop, midX, midY)
  if (down) l(midX, midY, midX, cellTop + CELL_H)

  return out
}

export function generateCard(linesWithAnsi: string[], commandPrompt?: string): string {
  const allLines = commandPrompt ? [`$ ${commandPrompt}`, '', ...linesWithAnsi] : linesWithAnsi

  const maxChars = Math.max(...allLines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length))
  const width = Math.ceil(maxChars * CELL_W + PAD * 2 + 10)
  const height = Math.ceil(allLines.length * CELL_H + PAD * 2)

  const elements: string[] = []

  allLines.forEach((line, rowIndex) => {
    const y = PAD + rowIndex * CELL_H
    let col = 0

    if (rowIndex === 0 && commandPrompt) {
      elements.push(
        `  <text x="${PAD}" y="${y + 13}" fill="${DIM}">$ </text>` +
        `<text x="${PAD + CELL_W * 2}" y="${y + 13}" fill="${BONE}" font-weight="600">${escapeXml(commandPrompt)}</text>`,
      )
      return
    }

    const spans = parseAnsi(line)
    for (const span of spans) {
      let run = ''
      let runStartCol = col

      const flush = () => {
        if (!run) return
        const lead = run.length - run.trimStart().length
        const inked = run.trim()
        if (inked) {
          const weight = span.style.bold ? ' font-weight="600"' : ''
          const opacity = span.style.dim ? ' opacity="0.65"' : ''
          const x = PAD + (runStartCol + lead) * CELL_W
          elements.push(
            `  <text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" fill="${span.style.fg}"${weight}${opacity} xml:space="preserve">${escapeXml(inked)}</text>`,
          )
        }
        run = ''
      }

      for (const char of span.text) {
        if (BOX_SEGMENTS[char]) {
          flush()
          elements.push(...renderBox(char, PAD + col * CELL_W, y, span.style.fg))
          runStartCol = col + 1
        } else {
          if (!run) runStartCol = col
          run += char
        }
        col++
      }
      flush()
    }
  })

  const ruleY = commandPrompt ? PAD + CELL_H + 5 : 0
  const ruleLine = commandPrompt
    ? `  <line x1="${PAD}" y1="${ruleY}" x2="${width - PAD}" y2="${ruleY}" stroke="${RULE}" stroke-width="1"/>\n`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">
  <rect width="${width}" height="${height}" rx="${RADIUS}" fill="${GROUND}"/>
${ruleLine}${elements.join('\n')}
</svg>
`
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length >= 2) {
    const cmd = args[0]
    const dest = args[1]
    const input = await Bun.stdin.text()
    const lines = input.replace(/\n+$/, '').split('\n')
    const svg = generateCard(lines, cmd)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, svg)
    console.log(`Saved screenshot: ${dest}`)
    return
  }

  // Preset README screenshots
  console.log('Generating Alpheus README screenshots...')

  // 1. Interactive TUI Card
  const dummyItems: MiasmaItem[] = [
    {
      id: 'item-1',
      filePath: 'src/auth.ts',
      lineNumber: 42,
      category: 'LOG',
      matchedContent: 'console.log("DEBUG token:", token);',
      explanation: 'Ephemeral JavaScript/TypeScript console statement',
      confidence: 1,
      contextLines: [
        { line: 40, content: 'const token = generateToken();', isTarget: false },
        { line: 41, content: '', isTarget: false },
        { line: 42, content: 'console.log("DEBUG token:", token);', isTarget: true },
        { line: 43, content: '', isTarget: false },
        { line: 44, content: 'return verifySession(token);', isTarget: false },
      ],
    },
    {
      id: 'item-2',
      filePath: 'src/client.ts',
      lineNumber: 15,
      category: 'SUPPRESS',
      matchedContent: '// @ts-ignore',
      explanation: 'TypeScript compiler error suppression comment',
      confidence: 1,
    },
    {
      id: 'item-3',
      filePath: 'src/config.ts',
      lineNumber: 8,
      category: 'PATH',
      matchedContent: 'const p = "/home/developer/secret.pem";',
      explanation: 'Hardcoded workstation absolute home directory path',
      confidence: 1,
    },
    {
      id: 'item-4',
      filePath: 'src/calc.py',
      lineNumber: 94,
      category: 'TOMBSTONE',
      matchedContent: '# commented out block',
      explanation: 'Commented-out dead code block (4 lines)',
      confidence: 1,
    },
    {
      id: 'item-5',
      filePath: 'temp.scratch.json',
      category: 'SCRATCH',
      matchedContent: 'temp.scratch.json',
      explanation: 'Untracked scratch or temporary file',
      confidence: 1,
    },
  ]

  const { render } = await import('ink-testing-library')
  const React = (await import('react')).default
  const { App } = await import('../src/tui/app.tsx')

  const { lastFrame } = render(
    React.createElement(App, {
      items: dummyItems,
      cwd: process.cwd(),
      columns: 88,
      rows: 18,
      onPurge: async () => ({} as PurgeSummary),
      onDone: () => {},
    }),
  )

  const tuiLines = (lastFrame() || '').split('\n')
  const tuiSvg = generateCard(tuiLines, 'alpheus')
  mkdirSync('docs/images', { recursive: true })
  writeFileSync('docs/images/tui.svg', tuiSvg)
  console.log('[ok] Wrote docs/images/tui.svg')

  // 2. Check Command Card
  const checkLines = [
    'Alpheus — 5 agent miasma items found in working tree:',
    '',
    ' \x1b[36m[LOG]\x1b[0m (1)',
    '   src/auth.ts:42                      console.log("DEBUG token:", token); — Ephemeral JavaScript/TypeScript console statement',
    '',
    ' \x1b[33m[SUPPRESS]\x1b[0m (1)',
    '   src/client.ts:15                    // @ts-ignore — TypeScript compiler error suppression comment',
    '',
    ' \x1b[31m[PATH]\x1b[0m (1)',
    '   src/config.ts:8                     const p = "/home/developer/secret.pem"; — Hardcoded workstation absolute home directory path',
    '',
    ' \x1b[90m[TOMBSTONE]\x1b[0m (1)',
    '   src/calc.py:94                      Commented-out dead code block (4 lines) — Commented-out dead code block (4 lines)',
    '',
    ' \x1b[35m[SCRATCH]\x1b[0m (1)',
    '   temp.scratch.json                   temp.scratch.json — Untracked scratch or temporary file',
    '',
    'Run `alpheus` to interactively purge, or `alpheus clean` to batch purge with automatic backup.',
  ]

  const checkSvg = generateCard(checkLines, 'alpheus check')
  writeFileSync('docs/images/check.svg', checkSvg)
  console.log('[ok] Wrote docs/images/check.svg')

  // 3. Clean Batch Card
  const cleanLines = [
    '\x1b[32mAlpheus purged 4 items across 3 files.\x1b[0m',
    'Deleted 1 scratch files: temp.scratch.json',
    'Backup saved to \x1b[36m.alpheus/backups/20260914_174539_0f78\x1b[0m. (Restore anytime via `alpheus restore`)',
  ]

  const cleanSvg = generateCard(cleanLines, 'alpheus clean')
  writeFileSync('docs/images/clean.svg', cleanSvg)
  console.log('[ok] Wrote docs/images/clean.svg')
}

if (import.meta.main) {
  await main()
}
