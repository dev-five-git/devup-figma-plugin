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
}
export interface Devup {
  theme?: DevupTheme
}
