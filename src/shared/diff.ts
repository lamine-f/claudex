/**
 * Lecture d'un diff unifié, tel que `git diff` le rend.
 *
 * Le format unifié porte déjà, dans l'en-tête de chaque section, les numéros de
 * ligne de départ des deux côtés. Cela suffit à aligner deux colonnes sans rien
 * deviner, et dispense d'écrire un algorithme de comparaison.
 *
 * Rien ici n'appelle git : le texte entre, les sections sortent.
 */

/** Une ligne du diff, du côté où elle existe. */
export type LigneDiff =
  | { genre: 'contexte'; gauche: number; droite: number; texte: string }
  | { genre: 'retire'; gauche: number; texte: string }
  | { genre: 'ajoute'; droite: number; texte: string }

export interface Section {
  /** Ce que git écrit après le second `@@`, souvent le nom de la fonction. */
  entete: string
  /** Première ligne de la section, de chaque côté. */
  departGauche: number
  departDroite: number
  lignes: LigneDiff[]
}

export interface Diff {
  sections: Section[]
  /** Vrai quand git a renoncé à comparer : une image, une archive, un binaire. */
  binaire: boolean
  /** Vrai quand le fichier n'existait pas avant, ou n'existe plus après. */
  ajoute: boolean
  supprime: boolean
}

const ENTETE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

/**
 * Découpe un diff unifié en sections.
 *
 * Les lignes qui ne sont ni du contexte, ni un ajout, ni un retrait sont
 * ignorées. C'est le cas de `\ No newline at end of file`, que git glisse
 * après la ligne concernée et qui ne représente aucune ligne du fichier.
 */
export function lireDiff(sortie: string): Diff {
  const diff: Diff = { sections: [], binaire: false, ajoute: false, supprime: false }
  let section: Section | undefined
  let gauche = 0
  let droite = 0

  for (const ligne of sortie.split('\n')) {
    if (ligne.startsWith('Binary files ') || ligne.startsWith('GIT binary patch')) {
      diff.binaire = true
      continue
    }

    if (ligne.startsWith('--- ')) {
      diff.ajoute = ligne === '--- /dev/null'
      continue
    }
    if (ligne.startsWith('+++ ')) {
      diff.supprime = ligne === '+++ /dev/null'
      continue
    }

    const entete = ENTETE.exec(ligne)
    if (entete) {
      gauche = Number(entete[1])
      droite = Number(entete[3])
      section = {
        entete: entete[5] ?? '',
        departGauche: gauche,
        departDroite: droite,
        lignes: []
      }
      diff.sections.push(section)
      continue
    }

    if (!section) continue

    if (ligne.startsWith('-')) {
      section.lignes.push({ genre: 'retire', gauche: gauche++, texte: ligne.slice(1) })
      continue
    }
    if (ligne.startsWith('+')) {
      section.lignes.push({ genre: 'ajoute', droite: droite++, texte: ligne.slice(1) })
      continue
    }
    if (ligne.startsWith(' ')) {
      section.lignes.push({
        genre: 'contexte',
        gauche: gauche++,
        droite: droite++,
        texte: ligne.slice(1)
      })
    }
  }

  return diff
}

/** Une rangée de la vue côte à côte, avec ce que chaque colonne y montre. */
export interface Paire {
  gauche?: LigneDiff
  droite?: LigneDiff
}

/**
 * Apparie les lignes d'une section pour la vue côte à côte.
 *
 * Un bloc de retraits suivi d'un bloc d'ajouts se lit comme un remplacement :
 * la première ligne retirée fait face à la première ajoutée. Les lignes en trop
 * d'un côté font face au vide. Le contexte occupe les deux colonnes.
 */
export function apparier(section: Section): Paire[] {
  const paires: Paire[] = []
  let i = 0

  while (i < section.lignes.length) {
    const ligne = section.lignes[i]
    if (!ligne) break

    if (ligne.genre === 'contexte') {
      paires.push({ gauche: ligne, droite: ligne })
      i++
      continue
    }

    // Le bloc courant, jusqu'au retour du contexte.
    const retires: LigneDiff[] = []
    const ajoutes: LigneDiff[] = []
    while (i < section.lignes.length) {
      const suivante = section.lignes[i]
      if (!suivante || suivante.genre === 'contexte') break
      if (suivante.genre === 'retire') retires.push(suivante)
      else ajoutes.push(suivante)
      i++
    }

    for (let rang = 0; rang < Math.max(retires.length, ajoutes.length); rang++) {
      paires.push({ gauche: retires[rang], droite: ajoutes[rang] })
    }
  }

  return paires
}

/** Le nombre de lignes ajoutées et retirées, pour l'annoncer d'un mot. */
export function compter(diff: Diff): { ajoutees: number; retirees: number } {
  const lignes = diff.sections.flatMap((s) => s.lignes)
  return {
    ajoutees: lignes.filter((l) => l.genre === 'ajoute').length,
    retirees: lignes.filter((l) => l.genre === 'retire').length
  }
}

/** Une étendue de rangées que l'on peut cacher, parce que rien n'y change. */
export interface Repli {
  /** Rang de la première rangée cachée, dans la liste des paires. */
  debut: number
  /** Rang de la première rangée qui n'est plus cachée. */
  fin: number
}

/**
 * Les étendues inchangées assez longues pour valoir un repli.
 *
 * Montrer un fichier entier donne le contexte, mais noie deux lignes changées
 * dans quatre mille. Replier ce qui ne change pas garde les deux : le contexte
 * reste à portée d'un clic, et l'œil va droit au changement.
 *
 * Le contexte demandé est laissé de chaque côté d'un changement, comme le fait
 * `git diff -U`. Une étendue qui n'y survit pas n'est pas repliée : cacher
 * deux lignes pour poser une barre à leur place ne gagne rien.
 */
export function replis(paires: Paire[], contexte = 3, minimum = 4): Repli[] {
  const change = paires.map(
    (p) => p.gauche?.genre !== 'contexte' || p.droite?.genre !== 'contexte'
  )

  const trouves: Repli[] = []
  let debut = 0
  for (let rang = 0; rang <= paires.length; rang++) {
    if (rang < paires.length && !change[rang]) continue

    // L'étendue court de `debut` à `rang`, exclus. On y laisse le contexte.
    const de = debut === 0 ? 0 : debut + contexte
    const a = rang === paires.length ? paires.length : rang - contexte
    if (a - de >= minimum) trouves.push({ debut: de, fin: a })
    debut = rang + 1
  }
  return trouves
}

/** Vrai quand ce rang tombe dans une étendue repliée. */
export function estCache(rang: number, replies: Repli[]): boolean {
  return replies.some((r) => rang >= r.debut && rang < r.fin)
}
