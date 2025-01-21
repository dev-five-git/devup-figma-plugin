export interface DevupTypography {
  fontFamily?: string
  fontStyle?: string
  fontSize?: string
  fontWeight?: number
  lineHeight?: number | string
  letterSpacing?: number | string
  textDecoration?: string
  textTransform?: string
}
export interface DevupTheme {
  colors?: Record<string, Record<string, string>>
  typography?: Record<string, DevupTypography | (null | DevupTypography)[]>
}
export interface Devup {
  theme?: DevupTheme
}
