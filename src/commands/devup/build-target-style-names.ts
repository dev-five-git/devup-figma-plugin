import type { DevupTypography } from './types'

type TargetTypography = [target: string, typography: DevupTypography]
const TYPO_PREFIX = ['mobile', '1', 'tablet', '3', 'desktop', '5'] as const

export function buildTargetStyleNames(
  style: string,
  value: DevupTypography | (DevupTypography | null)[],
): TargetTypography[] {
  const targets: TargetTypography[] = []
  if (Array.isArray(value)) {
    value.forEach((typo, idx) => {
      if (!typo) return
      const prefix = TYPO_PREFIX[idx] ?? `${idx}`
      targets.push([`${prefix}/${style}`, typo])
    })
    return targets
  }
  targets.push([`mobile/${style}`, value])
  return targets
}
