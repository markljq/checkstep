export interface SaveResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface OpenResult extends SaveResult {
  content?: string
}

export interface Api {
  load(): Promise<unknown>
  save(db: unknown): Promise<boolean>
  getDataPath(): Promise<string>
  saveText(payload: {
    title?: string
    defaultName?: string
    filters?: { name: string; extensions: string[] }[]
    content: string
  }): Promise<SaveResult>
  openText(payload: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<OpenResult>
  saveImage(payload: {
    title?: string
    defaultName?: string
    base64: string
  }): Promise<SaveResult>
}

declare global {
  interface Window {
    api: Api
  }
}
