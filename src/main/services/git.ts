import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { estModifie, estNonSuivi, lireStatut } from '@shared/git'
import type { DepotGit, EtatGit } from '@shared/types'

const run = promisify(execFile)

/** Au-delà, on cesse de chercher : un projet n'a pas cent dépôts sous la main. */
const PLAFOND = 60

/**
 * Les dépôts git d'un projet.
 *
 * Deux cas, et un seul chemin de code pour les deux. Si le dossier du projet
 * porte un `.git`, il est le dépôt et il est seul. Sinon, ses enfants directs
 * sont examinés : c'est ainsi que sont rangés `olive_services` et
 * `web_clients`, qui ne sont pas des dépôts mais en contiennent seize et deux.
 *
 * La recherche ne descend jamais plus bas. C'est instantané, et cela évite par
 * construction de tomber sur les `.git` que des dépendances traînent parfois
 * dans `node_modules`.
 *
 * `.git` peut être un fichier plutôt qu'un dossier : c'est le cas des
 * sous-modules et des arbres de travail liés. Le test porte donc sur
 * l'existence, jamais sur le type.
 */
export async function depots(chemin: string): Promise<string[]> {
  if (await existe(join(chemin, '.git'))) return [chemin]

  let entrees: string[]
  try {
    entrees = (await readdir(chemin, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }

  const trouves: string[] = []
  for (const nom of entrees.slice(0, 400)) {
    if (trouves.length >= PLAFOND) break
    const sous = join(chemin, nom)
    if (await existe(join(sous, '.git'))) trouves.push(sous)
  }
  return trouves
}

/**
 * L'état d'un dépôt, en une seule commande.
 *
 * `--porcelain=v2` donne l'amont et l'écart avec lui, ce que le v1 tait. `-z`
 * met les chemins à l'abri : un nom peut contenir un espace ou un accent, et
 * sans lui git les rend entre guillemets avec des séquences octales.
 *
 * `-uall` demande les fichiers non suivis un par un. Sans lui, git replie un
 * dossier entier en une seule ligne `? src/`, qui n'est pas un fichier : on ne
 * saurait ni ce qu'il contient, ni quoi cocher. Le coût est nul en pratique,
 * puisque git ne descend pas dans ce que `.gitignore` écarte. Mesuré sur les
 * seize dépôts d'olive_services : 0,48 s avec, 0,52 s sans.
 */
export async function etatDepot(chemin: string): Promise<DepotGit | null> {
  try {
    const { stdout } = await run(
      'git',
      [
        '-c',
        'core.quotepath=false',
        '-C',
        chemin,
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '-uall'
      ],
      { timeout: 8000, maxBuffer: 16 * 1024 * 1024 }
    )
    const statut = lireStatut(stdout)
    return { nom: basename(chemin), chemin, ...statut }
  } catch {
    return null
  }
}

/**
 * L'état git d'un projet, tous dépôts confondus.
 *
 * Un dossier hors dépôt et sans dépôt dessous rend `null`. Ce n'est pas une
 * erreur : beaucoup de projets n'en sont pas.
 */
export async function etat(chemin: string): Promise<EtatGit | null> {
  const racines = await depots(chemin)
  if (racines.length === 0) return null

  const lus = await Promise.all(racines.map(etatDepot))
  const trouves = lus.filter((d): d is DepotGit => d !== null)
  if (trouves.length === 0) return null

  const branches = new Set(trouves.map((d) => d.branche).filter(Boolean))
  const tous = trouves.flatMap((d) => d.fichiers)

  return {
    depots: trouves,
    // Seize dépôts sur trois branches n'ont pas de branche commune à annoncer.
    branche: branches.size === 1 ? [...branches][0] : undefined,
    modifies: tous.filter(estModifie).length,
    nonSuivis: tous.filter(estNonSuivi).length
  }
}

/** Au-delà, le diff n'est plus lisible et son affichage coûterait plus qu'il ne montre. */
const DIFF_MAX = 2 * 1024 * 1024

export interface DiffLu {
  /** La sortie brute de git, vide quand il n'y a rien à montrer. */
  sortie: string
  /** Taille en octets quand elle dépasse le seuil, et que rien n'est rendu. */
  trop?: number
}

/**
 * Le diff d'un fichier, d'un côté ou de l'autre de l'index.
 *
 * Deux diffs distincts pour un même fichier : ce que l'index porte face à HEAD,
 * et ce que la copie de travail porte face à l'index. Les confondre en cacherait
 * un.
 *
 * Un fichier que git ne suit pas encore n'a pas d'ancien côté, et `git diff`
 * n'en dirait rien. `--no-index` contre `/dev/null` le montre entier comme
 * ajouté, ce qui est exactement ce qu'il est.
 */
export async function diff(
  depot: string,
  fichier: string,
  options: { indexe?: boolean; nonSuivi?: boolean } = {}
): Promise<DiffLu> {
  const commun = ['-c', 'core.quotepath=false', '-C', depot, 'diff', '--no-color', '-U3']
  const arguments_ = options.nonSuivi
    ? [...commun, '--no-index', '--', '/dev/null', fichier]
    : [...commun, ...(options.indexe ? ['--cached'] : []), '--', fichier]

  try {
    const { stdout } = await run('git', arguments_, {
      timeout: 15_000,
      maxBuffer: DIFF_MAX + 1024
    })
    return { sortie: stdout }
  } catch (erreur) {
    // `--no-index` sort en 1 dès qu'il trouve une différence, ce qui est le cas
    // nominal ici : la sortie est bonne, seul le code de retour trompe.
    const echec = erreur as { code?: number; stdout?: string; message?: string }
    if (echec.code === 1 && typeof echec.stdout === 'string') return { sortie: echec.stdout }

    // Au-delà du tampon, node coupe et lève. C'est le signe qu'il ne faut pas
    // afficher, plutôt qu'une panne.
    if (echec.message?.includes('maxBuffer')) return { sortie: '', trop: DIFF_MAX }
    return { sortie: '' }
  }
}

/**
 * Parmi des noms d'un même dossier, ceux que git ignore.
 *
 * Les distinguer évite de confondre ce qui fait le projet et ce qui n'en est
 * que dérivé : dépendances, sorties de compilation, artefacts de test.
 */
export async function ignores(dossier: string, noms: string[]): Promise<Set<string>> {
  if (noms.length === 0) return new Set()
  try {
    const { stdout } = await run('git', ['-C', dossier, 'check-ignore', '--', ...noms], {
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024
    })
    return new Set(stdout.split('\n').filter(Boolean))
  } catch (erreur) {
    // `check-ignore` sort en 1 quand aucun chemin n'est ignoré, et en 128 hors
    // d'un dépôt : ni l'un ni l'autre n'est une anomalie.
    const code = (erreur as { code?: number }).code
    if (code === 1 || code === 128) return new Set()
    return new Set()
  }
}

async function existe(chemin: string): Promise<boolean> {
  try {
    await stat(chemin)
    return true
  } catch {
    return false
  }
}
