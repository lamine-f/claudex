import { ipcMain, type WebContents } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Apercu, Entree } from '@shared/types'
import { lireApercu, lireDossier } from '../services/fichiers'
import * as store from '../services/store'
import { assertInsideWorkspace } from '../util/paths'

/** Un seul veilleur par workspace observé. */
const veilleurs = new Map<string, FSWatcher>()

function racinesAutorisees(): string[] {
  return store.get().workspaces.map((w) => w.path)
}

/** Valide qu'un chemin appartient bien à un projet enregistré. */
function verifier(chemin: string): string {
  return assertInsideWorkspace(chemin, racinesAutorisees())
}

export function registerFsIpc(): void {
  ipcMain.handle('fs:lireDossier', (_evenement, chemin: string): Promise<Entree[]> =>
    lireDossier(verifier(chemin))
  )

  ipcMain.handle('fs:lireApercu', (_evenement, chemin: string): Promise<Apercu> =>
    lireApercu(verifier(chemin))
  )

  /**
   * Surveille un projet et signale les changements au renderer.
   *
   * La profondeur est bornée et les dossiers volumineux exclus : observer un
   * arbre entier coûterait cher pour un bénéfice nul, l'utilisateur ne voyant
   * jamais que quelques niveaux à la fois.
   */
  ipcMain.handle('fs:observer', (evenement, chemin: string) => {
    const racine = verifier(chemin)
    veilleurs.get(racine)?.close()

    const veilleur = chokidar.watch(racine, {
      ignoreInitial: true,
      depth: 6,
      ignored: (cible: string) =>
        /(^|[/\\])(node_modules|\.git|dist|out|build|target|venv|\.venv|__pycache__|\.next|coverage)([/\\]|$)/.test(
          cible
        ),
      // Un fichier en cours d'écriture ne doit pas déclencher trois événements.
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
    })

    const signaler = (destinataire: WebContents) => (): void => {
      if (!destinataire.isDestroyed()) destinataire.send('fs:change', racine)
    }
    const notifier = signaler(evenement.sender)
    veilleur.on('add', notifier).on('unlink', notifier).on('addDir', notifier).on('unlinkDir', notifier)

    veilleurs.set(racine, veilleur)
  })

  ipcMain.handle('fs:cesserObservation', (_evenement, chemin: string) => {
    const racine = verifier(chemin)
    void veilleurs.get(racine)?.close()
    veilleurs.delete(racine)
  })
}

/** Referme tous les veilleurs — appelé à la fermeture de l'application. */
export function arreterVeilleurs(): void {
  for (const veilleur of veilleurs.values()) void veilleur.close()
  veilleurs.clear()
}
