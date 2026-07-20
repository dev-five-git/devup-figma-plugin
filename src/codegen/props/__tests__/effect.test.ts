import { describe, expect, it } from 'bun:test'
import { getEffectProps } from '../effect'

describe('getEffectProps', () => {
  it('contributes no CSS for an unknown/unsupported effect type', async () => {
    const node = {
      type: 'RECTANGLE',
      effects: [{ type: 'FUTURE_EFFECT', visible: true }],
    } as unknown as SceneNode

    // Unknown effect types fall through the switch to `return {}`, so the node
    // ends up with no shadow/filter props and getEffectProps returns undefined.
    expect(await getEffectProps(node)).toBeUndefined()
  })
})
