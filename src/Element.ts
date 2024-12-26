export interface Element {
  props: Record<string, string | undefined>
  type: string
  children: Element[]
  text?: string
}
