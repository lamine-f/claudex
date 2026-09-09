import { open, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
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

  /**
   * Libère le port d'un service déclaré, et rend les processus visés.
   *
   * Réservé à un port que la déclaration du projet cite : c'est le garde-fou.
   */
  ipcMain.handle('services:liberer', async (_evenement, workspaceId: string, nom: string) => {
    const chemin = projet(workspaceId)
    return chemin ? services.liberer(chemin, nom) : []
  })

  /** Écrit le skill qui dit aux agents où sont les journaux. Rend son chemin. */
  ipcMain.handle('services:skill', async (_evenement, workspaceId: string) => {
    const chemin = projet(workspaceId)
    return chemin ? services.ecrireSkill(chemin) : null
  })

  /** Pose le serveur MCP dans le projet, pour que les agents y agissent. */
  ipcMain.handle('services:mcp', async (_evenement, workspaceId: string) => {
    const chemin = projet(workspaceId)
    if (!chemin) return null
    // `getAppPath` rend l'asar une fois empaqueté, et la racine du projet quand
    // on travaille sur les sources. Le serveur est au même endroit dans les
    // deux cas, à côté du point d'entrée de l'application.
    return services.ecrireMcp(chemin, {
      executable: process.execPath,
      serveur: join(app.getAppPath(), 'out', 'main', 'mcp.js')
    })
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
