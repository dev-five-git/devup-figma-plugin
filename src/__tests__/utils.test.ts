import { describe, expect, it } from 'bun:test'
import { space } from '../utils'

describe('space', () => {
  it('should create space', () => {
    expect(space(0)).toEqual('')
    expect(space(1)).toEqual('  ')
    expect(space(2)).toEqual('    ')
  })
})
