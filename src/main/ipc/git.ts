import { ipcMain } from 'electron'
import type { EtatGit } from '@shared/types'
import {
  commiter,
  depots,
  diff,
  etat,
  pousser,
  redigerMessage,
  type Compte,
  type DiffLu
} from '../services/git'
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
      options: { indexe?: boolean; nonSuivi?: boolean; contexte?: number }
    ): Promise<DiffLu> => {
      const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
      if (!workspace) return { sortie: '' }

      // Le dépôt vient du renderer : il doit être l'un de ceux que le projet
      // porte, et non un chemin quelconque qu'une page aurait pu inventer.
      const { racines } = await depots(workspace.path)
      if (!racines.includes(depot)) return { sortie: '' }

      return diff(depot, fichier, options)
    }
  )

  /**
   * Fait rédiger le message du commit à venir.
   *
   * L'agent ne touche pas au dépôt : il rend un texte que l'on relit. C'est ce
   * qui rend le geste sûr là où « l'agent commite » ne l'aurait pas été.
   */
  ipcMain.handle(
    'git:rediger',
    async (
      _evenement,
      workspaceId: string,
      lots: { depot: string; fichiers: string[] }[]
    ): Promise<{ message?: string; erreur?: string }> => {
      const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
      if (!workspace) return { erreur: 'Projet inconnu.' }

      const { racines } = await depots(workspace.path)
      const retenus = lots.filter((l) => racines.includes(l.depot))
      if (retenus.length === 0) return { erreur: 'Aucun fichier choisi.' }

      return redigerMessage(retenus)
    }
  )

  /**
   * Commite dans plusieurs dépôts à la fois, avec le même message.
   *
   * C'est le geste réel : cocher des fichiers dans trois dépôts et commiter
   * écrit trois commits. L'échec y est partiel par nature, un dépôt pouvant
   * refuser quand les autres passent. Chaque dépôt rend donc son compte, et
   * aucun n'interrompt les suivants.
   *
   * Les dépôts sont traités l'un après l'autre. En parallèle, les sorties de
   * hooks se mêleraient, et un `pre-commit` qui construit le projet chargerait
   * la machine autant de fois qu'il y a de dépôts.
   */
  ipcMain.handle(
    'git:commiter',
    async (
      _evenement,
      workspaceId: string,
      lots: { depot: string; fichiers: string[] }[],
      message: string,
      pousserAussi: boolean
    ): Promise<Compte[]> => {
      const workspace = store.get().workspaces.find((w) => w.id === workspaceId)
      if (!workspace) return []
      if (!message.trim()) return []

      const { racines } = await depots(workspace.path)
      const comptes: Compte[] = []

      for (const lot of lots) {
        if (!racines.includes(lot.depot)) continue
        const compte = await commiter(lot.depot, lot.fichiers, message.trim())
        // On ne pousse que ce qui vient d'être commité : pousser un dépôt dont
        // le commit a échoué enverrait un travail que l'on croit parti.
        comptes.push(compte.fait && pousserAussi ? await pousser(lot.depot) : compte)
      }

      return comptes
    }
  )
}
