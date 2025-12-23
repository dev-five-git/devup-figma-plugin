import { describe, expect, it } from 'vitest'
import { canBeAbsolute, getPositionProps } from '../position'

describe('position', () => {
  describe('canBeAbsolute', () => {
    it('should return true for ABSOLUTE positioned node', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        parent: {
          type: 'FRAME',
        },
      } as any

      expect(canBeAbsolute(node)).toBe(true)
    })

    it('should return true for AUTO positioned node in freelayout parent with constraints', () => {
      const node = {
        layoutPositioning: 'AUTO',
        constraints: {
          horizontal: 'MIN',
          vertical: 'MIN',
        },
        parent: {
          layoutPositioning: 'AUTO',
          width: 100,
          height: 100,
          type: 'FRAME',
        },
      } as any

      expect(canBeAbsolute(node)).toBe(true)
    })

    it('should return false for AUTO positioned node in freelayout parent without constraints', () => {
      const node = {
        layoutPositioning: 'AUTO',
        parent: {
          layoutPositioning: 'AUTO',
          width: 100,
          height: 100,
          type: 'FRAME',
        },
      } as any

      expect(canBeAbsolute(node)).toBe(false)
    })

    it('should return false for node without parent', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
      } as any

      expect(canBeAbsolute(node)).toBe(false)
    })
  })

  describe('getPositionProps', () => {
    it('should return absolute position props with constraints', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'MIN',
          vertical: 'MIN',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '10px',
        right: undefined,
        top: '20px',
        bottom: undefined,
      })
    })

    it('should return absolute position props in freelayout using fallback x/y', () => {
      const node = {
        layoutPositioning: 'AUTO',
        x: 15,
        y: 25,
        width: 40,
        height: 50,
        constraints: {
          horizontal: 'MIN',
          vertical: 'MIN',
        },
        parent: {
          layoutPositioning: 'AUTO',
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '15px',
        right: undefined,
        top: '25px',
        bottom: undefined,
      })
    })

    it('should return undefined when no constraints in freelayout and canBeAbsolute is false', () => {
      const node = {
        layoutPositioning: 'AUTO',
        x: 15,
        y: 25,
        width: 40,
        height: 50,
        parent: {
          layoutPositioning: 'AUTO',
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toBeUndefined()
    })

    it('should return absolute position with x/y when ABSOLUTE node has no constraints in freelayout parent', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 15,
        y: 25,
        width: 40,
        height: 50,
        parent: {
          layoutPositioning: 'AUTO',
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '15px',
        top: '25px',
      })
    })

    it('should return undefined when no constraints and parent is not freelayout (line 43)', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        parent: {
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
          },
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toBeUndefined()
    })

    it('should return relative position for parent with absolute children', () => {
      const node = {
        type: 'COMPONENT_SET',
        parent: null,
        children: [
          {
            layoutPositioning: 'ABSOLUTE',
            visible: true,
          },
        ],
      } as any
      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'relative',
      })
    })

    it('should return relative position for freelayout parent with AUTO children', () => {
      const node = {
        type: 'COMPONENT_SET',
        layoutPositioning: 'AUTO',
        parent: null,
        children: [
          {
            layoutPositioning: 'AUTO',
            visible: true,
          },
        ],
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'relative',
      })
    })

    it('should handle MAX constraints', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'MAX',
          vertical: 'MAX',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: undefined,
        right: '140px', // 200 - 10 - 50
        top: undefined,
        bottom: '220px', // 300 - 20 - 60
      })
    })

    it('should handle CENTER constraints (default case)', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'CENTER',
          vertical: 'CENTER',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '50%',
        right: undefined,
        top: '50%',
        bottom: undefined,
        transform: 'translate(-50%, -50%)',
      })
    })

    it('should get constraints from children[0] when node has no constraints', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 5,
        y: 10,
        width: 30,
        height: 40,
        children: [
          {
            constraints: {
              horizontal: 'MIN',
              vertical: 'MIN',
            },
          },
        ],
        parent: {
          type: 'FRAME',
          width: 100,
          height: 150,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '5px',
        right: undefined,
        top: '10px',
        bottom: undefined,
      })
    })

    it('should return undefined when children[0] exists but has no constraints and parent is not freelayout', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 5,
        y: 10,
        width: 30,
        height: 40,
        children: [
          {
            // no constraints
          },
        ],
        parent: {
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
          },
          type: 'FRAME',
          width: 100,
          height: 150,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toBeUndefined()
    })

    it('should handle SCALE horizontal constraint (default case)', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'SCALE',
          vertical: 'MIN',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '0px',
        right: '0px',
        top: '20px',
        bottom: undefined,
        transform: undefined,
      })
    })

    it('should handle STRETCH vertical constraint (default case)', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'MIN',
          vertical: 'STRETCH',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '10px',
        right: undefined,
        top: '0px',
        bottom: '0px',
        transform: undefined,
      })
    })

    it('should handle both SCALE constraints (default case for both)', () => {
      const node = {
        layoutPositioning: 'ABSOLUTE',
        x: 10,
        y: 20,
        width: 50,
        height: 60,
        constraints: {
          horizontal: 'SCALE',
          vertical: 'SCALE',
        },
        parent: {
          type: 'FRAME',
          width: 200,
          height: 300,
        },
      } as any

      const result = getPositionProps(node)

      expect(result).toEqual({
        pos: 'absolute',
        left: '0px',
        right: '0px',
        top: '0px',
        bottom: '0px',
        transform: undefined,
      })
    })
  })
})
