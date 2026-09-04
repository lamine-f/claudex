import { ipcMain, type WebContents } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import type { Apercu, Entree } from '@shared/types'
import { lireApercu, lireDossier } from '../services/fichiers'
import * as store from '../services/store'
import { assertInsideWorkspace } from '../util/paths'

/**
 * Un seul veilleur par workspace observé, et le destinataire du moment.
 *
 * Le destinataire est gardé à part parce que le veilleur, lui, ne se referme
 * plus entre deux appels : il faut pouvoir le rebrancher sur une fenêtre neuve
 * sans le recréer, ce qui arrive à chaque rechargement de l'interface.
 */
const veilleurs = new Map<string, { veilleur: FSWatcher; destinataire: WebContents }>()

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

    // Un veilleur déjà posé sur cette racine est gardé, et seulement rebranché.
    // Le refermer pour en poser un identique ne changeait rien, et refermer
    // pendant son parcours initial faisait planter chokidar : il gèle l'objet
    // qui porte la surveillance dès qu'il la referme, puis en réécrit un champ.
    // L'interface appelle cette méthode à chaque retour sur un projet, la
    // fenêtre était donc grande ouverte.
    const pose = veilleurs.get(racine)
    if (pose) {
      pose.destinataire = evenement.sender
      return
    }

    const veilleur = chokidar.watch(racine, {
      ignoreInitial: true,
      // Deux niveaux suffisent à voir ce qui compte — un fichier créé à la
      // racine ou dans un dossier courant. Six posaient des centaines de
      // surveillances sur un projet ordinaire, pour des changements que
      // personne ne regardait.
      depth: 2,
      ignored: (cible: string) =>
        /(^|[/\\])(node_modules|\.git|dist|out|build|target|venv|\.venv|__pycache__|\.next|coverage)([/\\]|$)/.test(
          cible
        ),
      // Un fichier en cours d'écriture ne doit pas déclencher trois événements.
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
    })

    // Le destinataire est relu à chaque événement plutôt que capturé une fois :
    // c'est ce qui permet au veilleur de survivre au rechargement de la fenêtre.
    const notifier = (): void => {
      const destinataire = veilleurs.get(racine)?.destinataire
      if (destinataire && !destinataire.isDestroyed()) destinataire.send('fs:change', racine)
    }
    veilleur.on('add', notifier).on('unlink', notifier).on('addDir', notifier).on('unlinkDir', notifier)

    veilleurs.set(racine, { veilleur, destinataire: evenement.sender })
  })

  ipcMain.handle('fs:cesserObservation', (_evenement, chemin: string) => {
    const racine = verifier(chemin)
    void veilleurs.get(racine)?.veilleur.close()
    veilleurs.delete(racine)
  })
}

/** Referme tous les veilleurs — appelé à la fermeture de l'application. */
export function arreterVeilleurs(): void {
  for (const { veilleur } of veilleurs.values()) void veilleur.close()
  veilleurs.clear()
}
