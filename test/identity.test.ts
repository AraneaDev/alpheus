import { describe, expect, it } from 'bun:test'
import { makeFindingId } from '../src/engine/identity.ts'

describe('makeFindingId', () => {
  it('is stable for the same category, path, line and content', () => {
    const a = makeFindingId('LOG', 'src/app.ts', 4, ['console.log(x)'])
    const b = makeFindingId('LOG', 'src/app.ts', 4, ['console.log(x)'])
    expect(a).toBe(b)
  })

  it('differs when the content differs at the same position', () => {
    const a = makeFindingId('LOG', 'src/app.ts', 4, ['console.log(x)'])
    const b = makeFindingId('LOG', 'src/app.ts', 4, ['console.log(y)'])
    expect(a).not.toBe(b)
  })

  it('differs when the line differs for the same content', () => {
    const a = makeFindingId('LOG', 'src/app.ts', 4, ['console.log(x)'])
    const b = makeFindingId('LOG', 'src/app.ts', 7, ['console.log(x)'])
    expect(a).not.toBe(b)
  })

  it('covers every line of a multi-line span', () => {
    const a = makeFindingId('TOMBSTONE', 'a.go', 3, ['// one', '// two'])
    const b = makeFindingId('TOMBSTONE', 'a.go', 3, ['// one', '// three'])
    expect(a).not.toBe(b)
  })

  it('starts with the lowercased category for readability', () => {
    expect(makeFindingId('LOG', 'a.ts', 1, ['x'])).toStartWith('log-')
  })
})
