import { ipcMain } from 'electron'
import type { EtatGit } from '@shared/types'
import { etat } from '../services/git'
import * as store from '../services/store'

export function registerGitIpc(): void {
  ipcMain.handle('git:etat', (_evenement, workspaceId: string): Promise<EtatGit | null> => {
    const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return Promise.resolve(null)
    return etat(workspace.path)
  })
}
