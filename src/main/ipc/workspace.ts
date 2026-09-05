import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { rangerSelon } from '@shared/ordre'
import type { Workspace } from '@shared/types'
import { multiplexeur } from '../services/multiplexeur'
import * as pty from '../services/pty'
import * as scrollback from '../services/scrollback'
import * as store from '../services/store'
import { assertInsideWorkspace } from '../util/paths'

// Palette d'accents attribuée en rotation, pour distinguer les projets d'un coup d'œil.
const ACCENTS = ['#e8825a', '#5aa9e8', '#7ec96f', '#c98fe0', '#e0c15a', '#5ad0c0']

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:list', () => store.get().workspaces)

  /**
   * Ajoute un projet, par le dialogue du système ou sur un chemin donné.
   *
   * Le chemin sert au menu de l'arbre : un sous-dossier qu'on y désigne devient
   * un projet sans repasser par le dialogue, qui demanderait de retrouver à la
   * main ce que l'on montrait déjà du doigt.
   */
  ipcMain.handle('workspace:add', async (evenement, propose?: string) => {
    let chemin = propose

    if (chemin === undefined) {
      const fenetre = BrowserWindow.fromWebContents(evenement.sender)
      const resultat = fenetre
        ? await dialog.showOpenDialog(fenetre, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Choisir un dossier de projet',
            buttonLabel: 'Ajouter'
          })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })

      if (resultat.canceled || resultat.filePaths.length === 0) return null
      chemin = resultat.filePaths[0]!
    } else {
      // Un chemin venu de l'interface ne vaut que s'il appartient à un projet
      // déjà déclaré, et qu'il mène bien à un dossier.
      chemin = assertInsideWorkspace(chemin, store.get().workspaces.map((w) => w.path))
      const infos = await stat(chemin).catch(() => null)
      if (!infos?.isDirectory()) return null
    }

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

  /**
   * Retire un projet de Claudex, et ferme ce qu'il tenait ouvert.
   *
   * Les sessions de ses onglets sont détruites : les laisser vivre sans plus
   * personne pour les rouvrir remplirait le multiplexeur de sessions orphelines
   * qu'aucun écran ne montre plus. Le dossier lui-même n'est pas touché, pas
   * plus que les conversations de Claude Code qui s'y rattachent : retirer un
   * projet le fait sortir de la liste, rien de plus.
   */
  ipcMain.handle('workspace:remove', async (_evenement, id: string) => {
    const aFermer = store.get().tabs.filter((t) => t.workspaceId === id)
    for (const tab of aFermer) {
      pty.detach(tab.id)
      await multiplexeur.detruire(tab.tmuxSession).catch(() => undefined)
      await scrollback.oublier(tab.id).catch(() => undefined)
    }

    store.update((etat) => {
      etat.workspaces = etat.workspaces.filter((w) => w.id !== id)
      etat.tabs = etat.tabs.filter((t) => t.workspaceId !== id)
      delete etat.rangements?.[id]
      if (etat.activeWorkspaceId === id) etat.activeWorkspaceId = etat.workspaces[0]?.id
    })
    return store.get().workspaces
  })

  /**
   * Range les projets dans l'ordre voulu.
   *
   * L'ordre du tableau est celui de l'affichage ; `order` le redouble pour que
   * l'état écrit se relise seul, sans dépendre de la façon dont il a été rangé.
   */
  ipcMain.handle('workspace:ranger', (_evenement, ids: string[]) => {
    store.update((etat) => {
      etat.workspaces = rangerSelon(etat.workspaces, ids)
      etat.workspaces.forEach((w, rang) => {
        w.order = rang
      })
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
