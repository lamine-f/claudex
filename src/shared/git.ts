/**
 * Lecture de `git status --porcelain=v2 --branch -z`.
 *
 * Le format v2 est préféré au v1 pour trois raisons. Il donne la branche amont
 * et l'écart avec elle, il sépare l'état de l'index de celui de la copie de
 * travail sur deux caractères de position fixe, et il annonce les renommages
 * avec leur ancien chemin. Le v1 laisse deviner les trois.
 *
 * Rien ici n'appelle git : la sortie entre en texte, l'état sort en objet. Le
 * format est stable et documenté, les cas limites sont nombreux, et les uns
 * comme les autres se vérifient sans dépôt.
 */

/** Ce qu'une position d'état dit d'un fichier. */
export type Marque = 'inchange' | 'modifie' | 'ajoute' | 'supprime' | 'renomme' | 'non-suivi'

export interface FichierGit {
  /** Chemin relatif à la racine du dépôt. */
  chemin: string
  /** Ce que l'index porte, par rapport à HEAD. */
  index: Marque
  /** Ce que la copie de travail porte, par rapport à l'index. */
  travail: Marque
  /** Chemin d'avant, quand git a reconnu un renommage ou une copie. */
  ancien?: string
}

export interface StatutDepot {
  branche: string
  /** Absente tant que la branche n'a pas d'amont : c'est un état normal. */
  amont?: string
  /** Commits d'avance sur l'amont. Zéro quand il n'y en a pas, ou pas d'amont. */
  avance: number
  retard: number
  fichiers: FichierGit[]
}

/** Les lettres du format v2, dans l'ordre où git les écrit. */
const MARQUES: Record<string, Marque> = {
  '.': 'inchange',
  M: 'modifie',
  T: 'modifie',
  A: 'ajoute',
  D: 'supprime',
  R: 'renomme',
  C: 'renomme',
  U: 'modifie'
}

const marque = (lettre: string | undefined): Marque =>
  (lettre ? MARQUES[lettre] : undefined) ?? 'modifie'

/**
 * Découpe la sortie brute en enregistrements.
 *
 * Avec `-z`, git sépare par des octets nuls plutôt que par des retours à la
 * ligne, ce qui met les noms de fichiers à l'abri : un chemin peut contenir un
 * retour à la ligne, jamais un octet nul. Les lignes d'en-tête `#` gardent la
 * même séparation.
 */
export function lireStatut(sortie: string): StatutDepot {
  const morceaux = sortie.split('\0')
  const statut: StatutDepot = { branche: '', avance: 0, retard: 0, fichiers: [] }

  for (let i = 0; i < morceaux.length; i++) {
    const ligne = morceaux[i]
    if (!ligne) continue

    if (ligne.startsWith('# branch.head ')) {
      const nom = ligne.slice('# branch.head '.length)
      // Une tête détachée s'annonce ainsi, et n'est pas un nom de branche.
      statut.branche = nom === '(detached)' ? '' : nom
      continue
    }

    if (ligne.startsWith('# branch.upstream ')) {
      statut.amont = ligne.slice('# branch.upstream '.length)
      continue
    }

    if (ligne.startsWith('# branch.ab ')) {
      // « +2 -0 ». La ligne manque quand la branche n'a pas d'amont : c'est le
      // cas de `deploy` dans olive_services, et ce n'est pas une anomalie.
      const ecart = /^\+(\d+) -(\d+)$/.exec(ligne.slice('# branch.ab '.length))
      if (ecart) {
        statut.avance = Number(ecart[1])
        statut.retard = Number(ecart[2])
      }
      continue
    }

    if (ligne.startsWith('#')) continue

    // « ? chemin » : ce que git ne suit pas encore.
    if (ligne.startsWith('? ')) {
      statut.fichiers.push({
        chemin: ligne.slice(2),
        index: 'inchange',
        travail: 'non-suivi'
      })
      continue
    }

    // « ! chemin » : ignoré, et demandé seulement avec --ignored.
    if (ligne.startsWith('! ')) continue

    // « 1 XY … chemin » : une entrée ordinaire. Les deux lettres d'état
    // viennent en deuxième champ, le chemin en dernier.
    if (ligne.startsWith('1 ')) {
      const champs = ligne.split(' ')
      const etat = champs[1] ?? '..'
      statut.fichiers.push({
        chemin: champs.slice(8).join(' '),
        index: marque(etat[0]),
        travail: marque(etat[1])
      })
      continue
    }

    // « 2 XY … chemin » puis, dans l'enregistrement suivant, l'ancien chemin.
    // git écrit les deux séparément avec -z, là où sans -z il les colle autour
    // d'une tabulation.
    if (ligne.startsWith('2 ')) {
      const champs = ligne.split(' ')
      const etat = champs[1] ?? '..'
      statut.fichiers.push({
        chemin: champs.slice(9).join(' '),
        index: marque(etat[0]),
        travail: marque(etat[1]),
        ancien: morceaux[++i] ?? ''
      })
      continue
    }

    // « u XY … chemin » : un conflit non résolu. Il compte comme touché, et le
    // panneau le signalera à part le moment venu.
    if (ligne.startsWith('u ')) {
      const champs = ligne.split(' ')
      statut.fichiers.push({
        chemin: champs.slice(10).join(' '),
        index: 'modifie',
        travail: 'modifie'
      })
    }
  }

  return statut
}

/** Un fichier que git ne suit pas encore. */
export const estNonSuivi = (f: FichierGit): boolean => f.travail === 'non-suivi'

/** Un fichier suivi dont quelque chose a bougé, d'un côté ou de l'autre. */
export const estModifie = (f: FichierGit): boolean =>
  !estNonSuivi(f) && (f.index !== 'inchange' || f.travail !== 'inchange')
