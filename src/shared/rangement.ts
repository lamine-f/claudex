/**
 * Rangement d'une liste, à la main.
 *
 * Les conversations viennent du disque, les projets d'un fichier d'état : ni
 * les unes ni les autres ne disent dans quel ordre on veut les voir ni ce qui
 * va avec quoi. Ce rangement est la couche que l'on pose par-dessus : un ordre
 * choisi à la main, et des groupes nommés.
 *
 * Il ne connaît de ce qu'il range que son identifiant. C'est ce qui lui permet
 * de servir aux conversations comme aux projets, sans qu'on écrive deux fois la
 * même mécanique de glisser-déposer.
 *
 * Il ne cite que ce que l'on a déplacé. Tant qu'on n'a rien touché, il est vide
 * et la liste garde son ordre naturel — favoris en tête, puis les plus
 * récentes. Dès qu'une conversation est rangée, elle garde sa place ; celles
 * qui apparaissent ensuite passent devant, pour qu'une conversation qui vient
 * de naître se voie sans avoir à la chercher.
 */

/** Un groupe de conversations. */
export interface Groupe {
  nom: string
  replie?: boolean
  /** Identifiants des conversations du groupe, dans l'ordre voulu. */
  sessions: string[]
}

/** Élément du premier niveau : un groupe, ou une conversation hors groupe. */
export type Element = { type: 'groupe'; id: string } | { type: 'session'; id: string }

export interface Rangement {
  /** Ordre du premier niveau, groupes et conversations mêlés. */
  ordre: Element[]
  groupes: Record<string, Groupe>
}

export const RANGEMENT_VIDE: Rangement = { ordre: [], groupes: {} }

/** Une ligne de la liste, une fois le rangement appliqué. */
export type Ligne<T> =
  | { type: 'groupe'; id: string; nom: string; replie: boolean; membres: T[] }
  | { type: 'element'; element: T }

/** Où déposer ce que l'on déplace : dans quel conteneur, à quel rang. */
export interface Cible {
  /** `null` pour le premier niveau, sinon l'identifiant du groupe. */
  groupe: string | null
  /** Rang d'insertion, compté sur la liste telle qu'elle est avant le geste. */
  index: number
}

function copier(rangement: Rangement): Rangement {
  return {
    ordre: [...rangement.ordre],
    groupes: Object.fromEntries(
      Object.entries(rangement.groupes).map(([id, g]) => [id, { ...g, sessions: [...g.sessions] }])
    )
  }
}

function borner(index: number, longueur: number): number {
  return Math.max(0, Math.min(index, longueur))
}

/** Applique le rangement aux éléments tels qu'on les a lus. */
export function assembler<T extends { id: string }>(
  elements: T[],
  rangement: Rangement
): Ligne<T>[] {
  const parId = new Map(elements.map((e) => [e.id, e]))
  const rangees = new Set<string>()
  for (const element of rangement.ordre) {
    if (element.type === 'session') rangees.add(element.id)
    else for (const id of rangement.groupes[element.id]?.sessions ?? []) rangees.add(id)
  }
  // Un groupe absent de l'ordre n'a pas à emporter ses conversations avec lui.
  for (const [id, groupe] of Object.entries(rangement.groupes)) {
    if (rangement.ordre.some((e) => e.type === 'groupe' && e.id === id)) continue
    for (const uuid of groupe.sessions) rangees.add(uuid)
  }

  const lignes: Ligne<T>[] = elements
    .filter((e) => !rangees.has(e.id))
    .map((element) => ({ type: 'element', element }))

  const ligneDeGroupe = (id: string, groupe: Groupe): Ligne<T> => ({
    type: 'groupe',
    id,
    nom: groupe.nom,
    replie: groupe.replie ?? false,
    // Un membre cité mais disparu est simplement omis : le rangement n'a pas à
    // être nettoyé pour rester lisible.
    membres: groupe.sessions
      .map((membre) => parId.get(membre))
      .filter((e): e is T => e !== undefined)
  })

  for (const element of rangement.ordre) {
    if (element.type === 'session') {
      const trouve = parId.get(element.id)
      if (trouve) lignes.push({ type: 'element', element: trouve })
    } else {
      const groupe = rangement.groupes[element.id]
      if (groupe) lignes.push(ligneDeGroupe(element.id, groupe))
    }
  }

  // Un groupe qui n'est plus cité dans l'ordre reste visible en fin de liste
  // plutôt que de disparaître avec ce qu'il contient.
  for (const [id, groupe] of Object.entries(rangement.groupes)) {
    if (!rangement.ordre.some((e) => e.type === 'groupe' && e.id === id)) {
      lignes.push(ligneDeGroupe(id, groupe))
    }
  }

  return lignes
}

/**
 * Fige l'ordre affiché dans le rangement.
 *
 * Le premier geste manuel doit partir de ce que l'on a sous les yeux : sans
 * cela, déplacer une conversation la ferait sauter au milieu d'une liste dont
 * le reste n'est encore rangé nulle part.
 */
export function materialiser<T extends { id: string }>(
  elements: T[],
  rangement: Rangement
): Rangement {
  const groupes: Record<string, Groupe> = {}
  const ordre = assembler(elements, rangement).map((ligne): Element => {
    if (ligne.type === 'element') return { type: 'session', id: ligne.element.id }
    groupes[ligne.id] = {
      nom: ligne.nom,
      replie: ligne.replie,
      sessions: ligne.membres.map((m) => m.id)
    }
    return { type: 'groupe', id: ligne.id }
  })
  return { ordre, groupes }
}

/** Retire un élément de l'endroit où il se trouve. Renvoie d'où il vient. */
function retirer(rangement: Rangement, quoi: Element): Cible | null {
  if (quoi.type === 'groupe') {
    const index = rangement.ordre.findIndex((e) => e.type === 'groupe' && e.id === quoi.id)
    if (index === -1) return null
    rangement.ordre.splice(index, 1)
    return { groupe: null, index }
  }

  const index = rangement.ordre.findIndex((e) => e.type === 'session' && e.id === quoi.id)
  if (index !== -1) {
    rangement.ordre.splice(index, 1)
    return { groupe: null, index }
  }

  for (const [id, groupe] of Object.entries(rangement.groupes)) {
    const rang = groupe.sessions.indexOf(quoi.id)
    if (rang === -1) continue
    groupe.sessions.splice(rang, 1)
    return { groupe: id, index: rang }
  }
  return null
}

/**
 * Déplace une conversation ou un groupe.
 *
 * Un groupe ne peut aller que sur le premier niveau : imbriquer des groupes
 * donnerait une arborescence là où l'on veut un classeur.
 */
export function deplacer(rangement: Rangement, quoi: Element, cible: Cible): Rangement {
  if (quoi.type === 'groupe' && cible.groupe !== null) return rangement
  if (cible.groupe !== null && !rangement.groupes[cible.groupe]) return rangement

  const copie = copier(rangement)
  const origine = retirer(copie, quoi)
  // Le rang visé est celui d'avant le retrait : descendre dans sa propre liste
  // sauterait sinon d'un cran de trop.
  let index = cible.index
  if (origine && origine.groupe === cible.groupe && origine.index < index) index--

  if (cible.groupe === null) {
    copie.ordre.splice(borner(index, copie.ordre.length), 0, quoi)
  } else {
    const groupe = copie.groupes[cible.groupe]!
    groupe.sessions.splice(borner(index, groupe.sessions.length), 0, quoi.id)
  }
  return copie
}

/** Crée un groupe au premier niveau, éventuellement garni de conversations. */
export function creerGroupe(
  rangement: Rangement,
  id: string,
  nom: string,
  index = 0,
  avec: string[] = []
): Rangement {
  const copie = copier(rangement)
  for (const uuid of avec) retirer(copie, { type: 'session', id: uuid })
  copie.groupes[id] = { nom, sessions: [...avec] }
  copie.ordre.splice(borner(index, copie.ordre.length), 0, { type: 'groupe', id })
  return copie
}

export function renommerGroupe(rangement: Rangement, id: string, nom: string): Rangement {
  const groupe = rangement.groupes[id]
  if (!groupe) return rangement
  const copie = copier(rangement)
  copie.groupes[id]!.nom = nom
  return copie
}

export function replierGroupe(rangement: Rangement, id: string, replie: boolean): Rangement {
  const groupe = rangement.groupes[id]
  if (!groupe) return rangement
  const copie = copier(rangement)
  copie.groupes[id]!.replie = replie
  return copie
}

/**
 * Défait un groupe sans toucher aux conversations : elles reprennent leur place
 * là où le groupe se tenait, plutôt que de repartir se perdre en fin de liste.
 */
export function dissoudreGroupe(rangement: Rangement, id: string): Rangement {
  const groupe = rangement.groupes[id]
  if (!groupe) return rangement
  const copie = copier(rangement)
  const index = copie.ordre.findIndex((e) => e.type === 'groupe' && e.id === id)
  const rendues = groupe.sessions.map((uuid): Element => ({ type: 'session', id: uuid }))
  if (index === -1) copie.ordre.push(...rendues)
  else copie.ordre.splice(index, 1, ...rendues)
  delete copie.groupes[id]
  return copie
}

/** Efface toute trace d'une conversation écartée. */
export function oublier(rangement: Rangement, uuid: string): Rangement {
  const copie = copier(rangement)
  retirer(copie, { type: 'session', id: uuid })
  return copie
}
