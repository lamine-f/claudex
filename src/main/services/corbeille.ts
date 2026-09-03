import { mkdir, rename, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'

/**
 * Conversations écartées.
 *
 * Le transcrit est déplacé, jamais effacé : c'est le seul exemplaire d'un
 * travail parfois long, et une suppression définitive au clic droit serait une
 * mauvaise surprise. Le fichier reste récupérable à la main.
 */
export function dossierCorbeille(): string {
  return join(app.getPath('userData'), 'corbeille')
}

/** Écarte un transcrit et rend le chemin où il a été déposé. */
export async function ecarter(cheminTranscrit: string): Promise<string> {
  await stat(cheminTranscrit)
  const corbeille = dossierCorbeille()
  await mkdir(corbeille, { recursive: true })

  // Horodater évite d'écraser une conversation écartée plus tôt sous le même nom.
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-')
  const destination = join(corbeille, `${horodatage}--${basename(cheminTranscrit)}`)
  await rename(cheminTranscrit, destination)
  return destination
}
