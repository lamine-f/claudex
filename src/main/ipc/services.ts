import { open, stat } from 'node:fs/promises'
import { ipcMain } from 'electron'
import type { ServiceVu } from '@shared/types'
import * as services from '../services/projets-services'
import * as store from '../services/store'
import { assertInsideWorkspace } from '../util/paths'
import { ouvrirFenetreJournal } from '../window'

/** Le projet désigné, ou rien s'il a disparu de la liste. */
function projet(workspaceId: string): string | null {
  return store.get().workspaces.find((w) => w.id === workspaceId)?.path ?? null
}

export function registerServicesIpc(): void {
  ipcMain.handle('services:etats', async (_evenement, workspaceId: string): Promise<ServiceVu[]> => {
    const chemin = projet(workspaceId)
    return chemin ? services.etats(workspaceId, chemin) : []
  })

  /** Démarre les services nommés, dans l'ordre de leurs dépendances. */
  ipcMain.handle('services:demarrer', async (_evenement, workspaceId: string, noms: string[]) => {
    const chemin = projet(workspaceId)
    if (!chemin) return { bloques: [] }
    return services.demarrerPlusieurs(workspaceId, chemin, noms)
  })

  ipcMain.handle('services:arreter', async (_evenement, workspaceId: string, noms: string[]) => {
    const chemin = projet(workspaceId)
    if (!chemin) return
    const { services: declares } = await services.charger(chemin)
    for (const service of declares.filter((s) => noms.includes(s.nom))) {
      await services.arreter(workspaceId, service)
    }
  })

  /** Écrit le skill qui dit aux agents où sont les journaux. Rend son chemin. */
  ipcMain.handle('services:skill', async (_evenement, workspaceId: string) => {
    const chemin = projet(workspaceId)
    return chemin ? services.ecrireSkill(chemin) : null
  })

  /** Ouvre une fenêtre qui suit le journal d'un service. */
  ipcMain.handle('services:fenetreJournal', (_evenement, chemin: string, titre: string) => {
    const cible = assertInsideWorkspace(
      chemin,
      store.get().workspaces.map((w) => w.path)
    )
    ouvrirFenetreJournal(cible, titre)
  })

  /**
   * Ce qu'un journal porte depuis un décalage donné.
   *
   * La fenêtre de suivi relit souvent : lui rendre le fichier entier à chaque
   * fois ferait passer des mégaoctets par le pont pour quelques lignes neuves.
   * Elle garde donc sa position et ne demande que la suite.
   *
   * Le chemin est vérifié comme n'importe quel accès au disque : une demande
   * fabriquée dans la page ne donne pas à lire ce qui traîne ailleurs.
   */
  ipcMain.handle(
    'services:journal',
    async (
      _evenement,
      chemin: string,
      depuis = 0
    ): Promise<{ texte: string; taille: number }> => {
      const cible = assertInsideWorkspace(
        chemin,
        store.get().workspaces.map((w) => w.path)
      )
      const infos = await stat(cible).catch(() => null)
      if (!infos) return { texte: '', taille: 0 }

      // Un fichier qui a rétréci a basculé : on repart de son début.
      const debut = depuis > infos.size ? 0 : depuis
      if (debut === infos.size) return { texte: '', taille: infos.size }

      const fichier = await open(cible, 'r')
      try {
        const tampon = Buffer.alloc(infos.size - debut)
        await fichier.read(tampon, 0, tampon.length, debut)
        return { texte: tampon.toString('utf8'), taille: infos.size }
      } finally {
        await fichier.close()
      }
    }
  )
}
