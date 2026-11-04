import { contextBridge, ipcRenderer } from 'electron'

export interface SaveResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface OpenResult extends SaveResult {
  content?: string
}

const api = {
  load: (): Promise<unknown> => ipcRenderer.invoke('store:load'),
  save: (db: unknown): Promise<boolean> => ipcRenderer.invoke('store:save', db),
  getDataPath: (): Promise<string> => ipcRenderer.invoke('store:path'),
  saveText: (payload: {
    title?: string
    defaultName?: string
    filters?: { name: string; extensions: string[] }[]
    content: string
  }): Promise<SaveResult> => ipcRenderer.invoke('file:saveText', payload),
  openText: (payload: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<OpenResult> => ipcRenderer.invoke('file:openText', payload),
  saveImage: (payload: {
    title?: string
    defaultName?: string
    /** PNG 二进制的 base64 编码（不含 data: 前缀） */
    base64: string
  }): Promise<SaveResult> => ipcRenderer.invoke('file:saveImage', payload)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
