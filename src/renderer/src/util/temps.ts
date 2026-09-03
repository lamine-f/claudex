/**
 * Datation relative, comme dans la colonne des sessions.
 *
 * L'heure exacte n'a d'intérêt que le jour même ; au-delà, ce qui compte est de
 * situer d'un coup d'œil — hier, la semaine dernière, il y a longtemps.
 */
export function quand(ms: number): string {
  const maintenant = new Date()
  const date = new Date(ms)
  const minutes = Math.floor((maintenant.getTime() - ms) / 60_000)

  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`

  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const jour = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  if (jour(date) === jour(maintenant)) return `aujourd'hui ${heure}`

  const hier = new Date(maintenant)
  hier.setDate(hier.getDate() - 1)
  if (jour(date) === jour(hier)) return `hier ${heure}`

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Initiales d'un projet, pour le rail : « boutique_front » donne « OF ». */
export function initiales(nom: string): string {
  const morceaux = nom.split(/[\s_\-.]+/).filter(Boolean)
  if (morceaux.length >= 2) return (morceaux[0]![0]! + morceaux[1]![0]!).toUpperCase()
  return nom.slice(0, 2).toUpperCase()
}
