export interface DevupTypography {
  fontFamily?: string
  fontStyle?: string
  fontSize?: string
  fontWeight?: number
  lineHeight?: number | string
  letterSpacing?: string
  textDecoration?: string
  textTransform?: string
}
type Theme = string
export interface DevupTheme {
  colors?: Record<Theme, Record<string, string>>
  typography?: Record<string, DevupTypography | (null | DevupTypography)[]>
  length?: Record<Theme, Record<string, string | (null | string)[]>>
  shadow?: Record<Theme, Record<string, string | (null | string)[]>>
}
export interface Devup {
  theme?: DevupTheme
}
