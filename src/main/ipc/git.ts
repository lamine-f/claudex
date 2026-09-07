import { ipcMain } from 'electron'
import type { EtatGit } from '@shared/types'
import { depots, diff, etat, type DiffLu } from '../services/git'
import * as store from '../services/store'

export function registerGitIpc(): void {
  ipcMain.handle('git:etat', (_evenement, workspaceId: string): Promise<EtatGit | null> => {
    const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return Promise.resolve(null)
    return etat(workspace.path)
  })

  ipcMain.handle(
    'git:diff',
    async (
      _evenement,
      workspaceId: string,
      depot: string,
      fichier: string,
      options: { indexe?: boolean; nonSuivi?: boolean }
    ): Promise<DiffLu> => {
      const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
      if (!workspace) return { sortie: '' }

      // Le dépôt vient du renderer : il doit être l'un de ceux que le projet
      // porte, et non un chemin quelconque qu'une page aurait pu inventer.
      const connus = await depots(workspace.path)
      if (!connus.includes(depot)) return { sortie: '' }

      return diff(depot, fichier, options)
    }
  )
}
