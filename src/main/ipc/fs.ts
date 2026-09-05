import { ipcMain, shell, type WebContents } from 'electron'
import { stat } from 'node:fs/promises'
import chokidar, { type FSWatcher } from 'chokidar'
import { borner } from '@shared/attente'
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

/**
 * Au-delà, on tient pour acquis qu'aucun gestionnaire de fichiers ne viendra.
 *
 * Large à dessein : un gestionnaire qui démarre à froid met parfois plusieurs
 * secondes, et l'attente ne coûte rien puisque personne ne s'y suspend.
 */
const ATTENTE_GESTIONNAIRE = 10_000

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
   * Montre une entrée dans le gestionnaire de fichiers du système.
   *
   * Un dossier s'ouvre, un fichier se révèle dans son dossier : c'est ce que
   * l'on veut d'un « ouvrir son dossier », et cela évite d'ouvrir le fichier
   * lui-même dans une application qu'on n'a pas demandée.
   *
   * L'attente est bornée parce que `shell.openPath()` ne rend pas toujours la
   * main. Sur une Debian sans `xdg-open` — le cas d'une AppImage, qui ne peut
   * déclarer aucune dépendance là où le paquet Debian réclame `xdg-utils` —
   * l'appel reste en suspens sans erreur ni valeur, et ce gestionnaire restait
   * pendant avec lui, une promesse abandonnée par clic.
   *
   * L'échec est tracé dans la sortie du processus main plutôt que remonté à
   * l'interface, qui appelle sans attendre la réponse. C'est peu, mais c'est
   * tout ce qu'il y avait auparavant : rien.
   */
  ipcMain.handle('fs:montrer', async (_evenement, chemin: string) => {
    const cible = verifier(chemin)
    const infos = await stat(cible)
    if (!infos.isDirectory()) {
      // Celui-ci ne rend rien du tout, pas même un échec : il n'y a rien à lire.
      shell.showItemInFolder(cible)
      return
    }

    const echec = await borner(
      shell.openPath(cible),
      ATTENTE_GESTIONNAIRE,
      'aucun gestionnaire de fichiers n’a répondu'
    )
    if (echec) console.error('[fs] ouverture de', cible, ':', echec)
  })

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
