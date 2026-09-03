import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { EtatGit } from '@shared/types'

const run = promisify(execFile)

/**
 * État git d'un projet, tel qu'affiché dans la barre de statut.
 *
 * Volontairement minimal : la branche et le nombre de fichiers touchés suffisent
 * à savoir où l'on est. Un dossier hors dépôt n'est pas une erreur — beaucoup de
 * projets n'en sont pas.
 */
export async function etat(chemin: string): Promise<EtatGit | null> {
  try {
    const [branche, statut] = await Promise.all([
      run('git', ['-C', chemin, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 4000 }),
      run('git', ['-C', chemin, 'status', '--porcelain'], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 })
    ])

    const lignes = statut.stdout.split('\n').filter(Boolean)
    return {
      branche: branche.stdout.trim(),
      modifies: lignes.filter((l) => !l.startsWith('??')).length,
      nonSuivis: lignes.filter((l) => l.startsWith('??')).length
    }
  } catch {
    return null
  }
}

/**
 * Parmi des noms d'un même dossier, ceux que git ignore.
 *
 * Les distinguer évite de confondre ce qui fait le projet et ce qui n'en est
 * que dérivé — dépendances, sorties de compilation, artefacts de test.
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
