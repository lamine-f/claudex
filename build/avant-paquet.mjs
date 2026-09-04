import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Retire le dossier de sortie de l'index de Spotlight, avant que quoi que ce
 * soit n'y soit écrit.
 *
 * L'application empaquetée y côtoie celle qui est installée : une recherche en
 * remontait deux, dont une qu'un `npm run dist` remplace sous les pieds de qui
 * l'a lancée. Le fichier vide `.metadata_never_index` est la façon prévue par
 * macOS de dire « ne regarde pas ici ». Il doit être posé d'abord : arrivé
 * après le paquet, il ne rattrape pas ce qui vient d'être indexé.
 */
export default async function avantPaquet({ electronPlatformName }) {
  if (electronPlatformName !== 'darwin') return
  const sortie = resolve('dist')
  mkdirSync(sortie, { recursive: true })
  writeFileSync(join(sortie, '.metadata_never_index'), '')
  console.log('  • dossier de sortie retiré de Spotlight  file=%s', sortie)
}
