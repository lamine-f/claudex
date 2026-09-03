import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { app, BrowserWindow, Notification } from 'electron'
import type { Sollicitation } from '@shared/types'
import { dossierEvenements, type Evenement } from './hooks'
import * as store from './store'

let veilleur: FSWatcher | null = null

/**
 * Ce que Claude Code envoie n'est pas notre format : on n'y touche qu'avec des
 * pincettes. Seul l'identifiant de session compte vraiment ; le reste est du
 * confort, et son absence ne doit rien casser.
 */
function texteDe(charge: unknown, clef: string): string | undefined {
  if (!charge || typeof charge !== 'object') return undefined
  const valeur = (charge as Record<string, unknown>)[clef]
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : undefined
}

function sessionDe(charge: unknown): string | undefined {
  return texteDe(charge, 'session_id') ?? texteDe(charge, 'sessionId')
}

/**
 * Un événement déposé par le script : la première ligne nomme l'événement, le
 * reste est la charge JSON de Claude Code.
 *
 * Le nom est repris de l'argument passé au script plutôt que de la charge :
 * c'est nous qui l'écrivons, il ne dépend donc d'aucun format extérieur.
 */
function decouper(contenu: string): { evenement: string; charge: unknown } {
  const saut = contenu.indexOf('\n')
  if (saut === -1) return { evenement: contenu.trim(), charge: null }
  const evenement = contenu.slice(0, saut).trim()
  try {
    return { evenement, charge: JSON.parse(contenu.slice(saut + 1)) }
  } catch {
    return { evenement, charge: null }
  }
}

function fenetre(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

function diffuser(): void {
  const sollicitations = store.get().sollicitations ?? {}
  const cible = fenetre()
  if (cible && !cible.isDestroyed()) {
    cible.webContents.send('claude:sollicitations', sollicitations)
  }
  // Le compte se lit depuis n'importe où, même l'application fermée au fond du
  // dock : c'est tout l'intérêt d'une pastille.
  if (process.platform === 'darwin' && app.dock) {
    const nombre = Object.keys(sollicitations).length
    app.dock.setBadge(nombre > 0 ? String(nombre) : '')
  }
}

/**
 * Prévient hors de l'application.
 *
 * Rien n'est émis quand la fenêtre a le focus : ce qui se passe sous les yeux
 * se voit déjà dans la colonne, et une notification par-dessus ne ferait que
 * répéter ce qui est à l'écran.
 */
/**
 * Deux voix, parce que ce sont deux nouvelles différentes.
 *
 * « Glass » est net et monte : un agent s'est arrêté et attend. « Pop » est
 * bref et retombe : il a rendu la main, il n'y a rien à faire. Les entendre
 * pareil obligerait à revenir voir pour savoir laquelle des deux c'était.
 * (Sons du système, macOS seulement ; ailleurs la notification garde le sien.)
 */
const VOIX = { attente: 'Glass', fin: 'Pop' } as const

function prevenir(
  titre: string,
  corps: string,
  tabId: string,
  workspaceId: string,
  voix: keyof typeof VOIX
): void {
  if (process.env.NODE_ENV === 'test') return
  if (!Notification.isSupported()) return
  const cible = fenetre()
  if (cible?.isFocused()) return

  const notification = new Notification({ title: titre, body: corps, sound: VOIX[voix] })
  notification.on('click', () => {
    const ouverte = fenetre()
    if (!ouverte || ouverte.isDestroyed()) return
    if (ouverte.isMinimized()) ouverte.restore()
    if (process.platform === 'darwin') app.focus({ steal: true })
    ouverte.focus()
    ouverte.webContents.send('claude:allerVers', tabId, workspaceId)
  })
  notification.show()
}

function traiter(evenement: string, charge: unknown): void {
  const uuid = sessionDe(charge)
  if (!uuid) return

  // Seules les conversations ouvertes dans Claudex nous concernent. Le hook est
  // posé au niveau de l'utilisateur, donc appelé par tous les `claude` de la
  // machine : réagir aux autres reviendrait à notifier pour des terminaux dont
  // l'application ne sait rien.
  const onglet = store.get().tabs.find((t) => t.claudeSessionId === uuid)
  if (!onglet) return

  const nom = onglet.title
  switch (evenement as Evenement) {
    case 'Notification': {
      const message = texteDe(charge, 'message') ?? 'Claude Code attend une réponse.'
      store.update((etat) => {
        const sollicitations = (etat.sollicitations ??= {})
        sollicitations[uuid] = { message, quand: Date.now(), workspaceId: onglet.workspaceId }
      })
      prevenir(nom, message, onglet.id, onglet.workspaceId, 'attente')
      break
    }
    case 'Stop': {
      apaiser(uuid)
      prevenir(nom, 'Claude a terminé.', onglet.id, onglet.workspaceId, 'fin')
      return
    }
    case 'UserPromptSubmit': {
      // On vient de reprendre la main : l'agent n'attend plus rien de nous.
      apaiser(uuid)
      return
    }
    default:
      return
  }
  diffuser()
}

/** Éteint le voyant d'une conversation. */
export function apaiser(uuid: string): void {
  if (!store.get().sollicitations?.[uuid]) return
  store.update((etat) => {
    delete etat.sollicitations?.[uuid]
  })
  diffuser()
}

export function sollicitations(): Record<string, Sollicitation> {
  return store.get().sollicitations ?? {}
}

async function avaler(fichier: string): Promise<void> {
  let contenu: string
  try {
    contenu = await readFile(fichier, 'utf8')
  } catch {
    return
  } finally {
    await rm(fichier, { force: true }).catch(() => undefined)
  }
  const { evenement, charge } = decouper(contenu)
  traiter(evenement, charge)
}

/**
 * Ramasse les événements déposés par le script.
 *
 * Ceux qui traînaient avant le démarrage sont jetés sans être lus : ils datent
 * d'une exécution précédente, et une notification pour une demande vieille de
 * trois jours ne rendrait service à personne.
 */
export async function demarrer(): Promise<void> {
  if (veilleur) return
  const dossier = dossierEvenements()
  // On ne surveille pas ce qui n'existe pas : le dossier est créé ici plutôt que
  // d'être supposé, faute de quoi les premiers événements passeraient à l'as.
  await mkdir(dossier, { recursive: true }).catch(() => undefined)

  const restes = await readdir(dossier).catch(() => [])
  await Promise.all(
    restes.map((f) => rm(join(dossier, f), { force: true }).catch(() => undefined))
  )

  veilleur = chokidar.watch(dossier, { ignoreInitial: true, depth: 0 })
  veilleur.on('add', (fichier) => {
    if (fichier.endsWith('.json')) void avaler(fichier)
  })
  diffuser()
}

export async function arreter(): Promise<void> {
  await veilleur?.close()
  veilleur = null
}
