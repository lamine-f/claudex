import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { Workspace } from '@shared/types'
import * as store from '../services/store'

// Palette d'accents attribuée en rotation, pour distinguer les projets d'un coup d'œil.
const ACCENTS = ['#e8825a', '#5aa9e8', '#7ec96f', '#c98fe0', '#e0c15a', '#5ad0c0']

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:list', () => store.get().workspaces)

  ipcMain.handle('workspace:add', async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender)
    const resultat = fenetre
      ? await dialog.showOpenDialog(fenetre, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Choisir un dossier de projet',
          buttonLabel: 'Ajouter'
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })

    if (resultat.canceled || resultat.filePaths.length === 0) return null

    const chemin = resultat.filePaths[0]!
    const existant = store.get().workspaces.find((w) => w.path === chemin)
    if (existant) return existant

    const workspace: Workspace = {
      id: randomUUID(),
      path: chemin,
      name: basename(chemin),
      color: ACCENTS[store.get().workspaces.length % ACCENTS.length]!,
      order: store.get().workspaces.length,
      expanded: true
    }
    store.update((etat) => {
      etat.workspaces.push(workspace)
      etat.activeWorkspaceId = workspace.id
    })
    return workspace
  })

  ipcMain.handle('workspace:remove', (_evenement, id: string) => {
    store.update((etat) => {
      etat.workspaces = etat.workspaces.filter((w) => w.id !== id)
      etat.tabs = etat.tabs.filter((t) => t.workspaceId !== id)
      if (etat.activeWorkspaceId === id) etat.activeWorkspaceId = etat.workspaces[0]?.id
    })
    return store.get().workspaces
  })

  ipcMain.handle(
    'workspace:update',
    (_evenement, id: string, patch: Partial<Omit<Workspace, 'id'>>) => {
      store.update((etat) => {
        const cible = etat.workspaces.find((w) => w.id === id)
        if (cible) Object.assign(cible, patch)
      })
      return store.get().workspaces
    }
  )
}
