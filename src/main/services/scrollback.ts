import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Tab } from '@shared/types'
import { multiplexeur } from './multiplexeur'
import * as store from './store'

/**
 * Écran des terminaux, conservé entre deux vies de l'application.
 *
 * Tant que le serveur tmux tient, il redessine lui-même l'écran au client qui se
 * rattache et cette copie ne sert à rien. Elle prend tout son sens après un
 * redémarrage de la machine : le serveur tmux est parti, la session est recréée
 * vide, et sans elle on perdrait la trace de tout ce qui avait été fait.
 */
function dossier(): string {
  return join(app.getPath('userData'), 'scrollback')
}

function fichier(tabId: string): string {
  return join(dossier(), `${tabId}.txt`)
}

/** Capture l'écran d'une session, séquences de couleur comprises. */
export async function sauvegarder(tabId: string, sessionTmux: string): Promise<void> {
  const contenu = await multiplexeur.capturer(sessionTmux, 5000)
  if (!contenu.trim()) return
  await mkdir(dossier(), { recursive: true })
  await writeFile(fichier(tabId), contenu, 'utf8')
}

/** Chemin du fichier d'écran, s'il existe. */
export async function chemin(tabId: string): Promise<string | undefined> {
  const cible = fichier(tabId)
  try {
    await readFile(cible)
    return cible
  } catch {
    return undefined
  }
}

export async function lire(tabId: string): Promise<string | null> {
  try {
    return await readFile(fichier(tabId), 'utf8')
  } catch {
    return null
  }
}

export async function oublier(tabId: string): Promise<void> {
  await rm(fichier(tabId), { force: true })
}

/**
 * Relève ce qu'il faudra pour reprendre : le répertoire courant, qui a pu changer
 * au fil du travail, et la commande longue en cours, qu'on proposera de relancer.
 */
async function releverContexte(tab: Tab): Promise<void> {
  const info = await multiplexeur.info(tab.tmuxSession)
  if (!info) return
  const commande = await multiplexeur.commandeComplete(info)

  store.update((etat) => {
    const cible = etat.tabs.find((t) => t.id === tab.id)
    if (!cible) return
    if (info.cwd) cible.cwd = info.cwd
    // On ne retient qu'une commande encore en cours : celles déjà terminées ne
    // méritent pas d'être reproposées au démarrage suivant.
    if (commande) cible.lastCommand = commande
  })
}

/** Sauvegarde l'état de plusieurs onglets, sans qu'un échec n'arrête les autres. */
export async function sauvegarderTous(onglets: Tab[]): Promise<void> {
  await Promise.allSettled(
    onglets.flatMap((o) => [sauvegarder(o.id, o.tmuxSession), releverContexte(o)])
  )
}
