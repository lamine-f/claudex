import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app } from 'electron'
import type { Tache } from '@shared/types'
import { deplacer, orphelines } from '@shared/taches'
import * as store from './store'

/**
 * Les consignes qu'on prépare pour un agent, et les images qu'on y joint.
 *
 * Les consignes vivent dans l'état, avec les onglets. Les images vivent à côté,
 * en fichiers : une capture d'écran pèse deux mégaoctets, et le `state.json`
 * est relu et réécrit à chaque changement d'onglet.
 */

/** Où les images jointes sont écrites. */
export function dossier(): string {
  return join(app.getPath('userData'), 'taches')
}

function toutes(): Record<string, Tache[]> {
  return store.get().taches ?? {}
}

export function lire(cle: string): Tache[] {
  return toutes()[cle] ?? []
}

/** Applique une modification à la file d'une conversation, et la rend. */
function changer(cle: string, modif: (liste: Tache[]) => Tache[]): Tache[] {
  let resultat: Tache[] = []
  store.update((etat) => {
    const taches = (etat.taches ??= {})
    resultat = modif(taches[cle] ?? [])
    if (resultat.length === 0) delete taches[cle]
    else taches[cle] = resultat
  })
  return resultat
}

export function ajouter(cle: string, texte: string, images: string[] = []): Tache[] {
  const tache: Tache = { id: randomUUID(), texte, creeeLe: Date.now() }
  if (images.length > 0) tache.images = images
  return changer(cle, (liste) => [...liste, tache])
}

export function modifier(cle: string, id: string, patch: Partial<Omit<Tache, 'id'>>): Tache[] {
  return changer(cle, (liste) => liste.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

export function retirer(cle: string, id: string): Tache[] {
  return changer(cle, (liste) => liste.filter((t) => t.id !== id))
}

export function ranger(cle: string, id: string, vers: number): Tache[] {
  return changer(cle, (liste) => deplacer(liste, id, vers))
}

/** Rend une consigne à l'appelant et la retire de la file, d'un seul geste. */
export function prendre(cle: string, id: string): { tache?: Tache; restantes: Tache[] } {
  const tache = lire(cle).find((t) => t.id === id)
  return { tache, restantes: tache ? retirer(cle, id) : lire(cle) }
}

/** Extensions connues, pour nommer ce qui arrive par le presse-papier. */
const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg'
}

/**
 * Écrit une image jointe et rend son chemin.
 *
 * Sous `userData` et non dans le projet : une capture posée dans un dépôt
 * apparaîtrait dans `git status`, et finirait commitée un jour sans qu'on l'ait
 * voulu.
 */
export async function joindre(donnees: Uint8Array, type: string): Promise<string> {
  await mkdir(dossier(), { recursive: true })
  const cible = join(dossier(), `${randomUUID()}${EXTENSIONS[type] ?? '.png'}`)
  await writeFile(cible, donnees)
  return cible
}

/** Copie une image déjà sur le disque, pour que la file ne dépende pas d'elle. */
export async function copier(source: string): Promise<string> {
  await mkdir(dossier(), { recursive: true })
  const cible = join(dossier(), `${randomUUID()}${extname(source) || '.png'}`)
  await copyFile(source, cible)
  return cible
}

/** Une semaine : le temps qu'un agent traite ce qu'on lui a envoyé. */
const SURSIS = 7 * 24 * 60 * 60 * 1000

/**
 * Efface les images qu'aucune consigne ne réclame plus.
 *
 * Une consigne envoyée quitte la file mais laisse son image : l'agent doit
 * encore pouvoir la lire. Le ménage attend donc, et ne prend que ce qui a
 * vieilli.
 */
export async function menage(maintenant = Date.now()): Promise<number> {
  let fichiers: string[]
  try {
    fichiers = (await readdir(dossier())).map((nom) => join(dossier(), nom))
  } catch {
    // Aucune image n'a jamais été jointe : il n'y a rien à ranger.
    return 0
  }

  let effaces = 0
  for (const fichier of orphelines(toutes(), fichiers)) {
    const age = await stat(fichier)
      .then((info) => maintenant - info.mtimeMs)
      .catch(() => 0)
    if (age < SURSIS) continue
    await rm(fichier, { force: true })
    effaces++
  }
  return effaces
}
