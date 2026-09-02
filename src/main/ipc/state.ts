import { ipcMain } from 'electron'
import type { AppState } from '@shared/types'
import * as store from '../services/store'

export function registerStateIpc(): void {
  ipcMain.handle('state:get', () => store.get())

  ipcMain.handle('state:setLayout', (_evenement, layout: Partial<AppState['layout']>) => {
    store.update((etat) => {
      etat.layout = { ...etat.layout, ...layout }
    })
    return store.get().layout
  })

  ipcMain.handle('state:setActiveWorkspace', (_evenement, id: string | undefined) => {
    store.update((etat) => {
      etat.activeWorkspaceId = id
    })
  })
}
