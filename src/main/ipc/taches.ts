import { BrowserWindow, dialog, ipcMain } from 'electron'
import { encadrer, pourEnvoi } from '@shared/taches'
import type { Tache } from '@shared/types'
import * as pty from '../services/pty'
import * as taches from '../services/taches'

/**
 * Le temps laissé au collage avant la validation.
 *
 * Le texte et le retour partent en deux écritures : envoyés d'un seul tenant,
 * le programme qui lit le terminal peut prendre le retour pour une partie du
 * collage et ne rien valider du tout.
 */
const AVANT_VALIDATION = 80

export function registerTachesIpc(): void {
  ipcMain.handle('taches:lire', (_evenement, cle: string) => taches.lire(cle))

  ipcMain.handle('taches:ajouter', (_evenement, cle: string, texte: string, images: string[]) =>
    taches.ajouter(cle, texte, images)
  )

  ipcMain.handle(
    'taches:modifier',
    (_evenement, cle: string, id: string, patch: Partial<Omit<Tache, 'id'>>) =>
      taches.modifier(cle, id, patch)
  )

  ipcMain.handle('taches:retirer', (_evenement, cle: string, id: string) =>
    taches.retirer(cle, id)
  )

  ipcMain.handle('taches:ranger', (_evenement, cle: string, id: string, vers: number) =>
    taches.ranger(cle, id, vers)
  )

  ipcMain.handle('taches:joindre', (_evenement, donnees: Uint8Array, type: string) =>
    taches.joindre(donnees, type)
  )

  /** Ouvre le dialogue du système et copie ce qui en sort. */
  ipcMain.handle('taches:choisirImages', async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender)
    if (!fenetre) return []

    const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
      properties: ['openFile', 'multiSelections'],
      title: 'Joindre des images',
      buttonLabel: 'Joindre',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'] }]
    })
    if (canceled) return []

    return Promise.all(filePaths.map((chemin) => taches.copier(chemin)))
  })

  /**
   * Envoie une consigne dans le terminal d'un onglet, et la retire de la file.
   *
   * L'écriture passe par le pty, c'est-à-dire par le même chemin que le clavier :
   * ce qui arrive est exactement ce qu'on aurait tapé soi-même.
   */
  ipcMain.handle(
    'taches:envoyer',
    (_evenement, cle: string, id: string, tabId: string) => {
      if (!pty.estAttache(tabId)) {
        // Le terminal n'est pas branché : écrire dans le vide perdrait la
        // consigne sans que rien ne le dise.
        return { envoye: false, raison: 'terminal', restantes: taches.lire(cle) }
      }

      const { tache, restantes } = taches.prendre(cle, id)
      if (!tache) return { envoye: false, raison: 'introuvable', restantes }

      pty.write(tabId, encadrer(pourEnvoi(tache)))
      setTimeout(() => pty.write(tabId, '\r'), AVANT_VALIDATION)
      return { envoye: true, restantes }
    }
  )
}
