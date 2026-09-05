/**
 * Attend une promesse sans s'y suspendre pour toujours.
 *
 * Écrit pour `shell.openPath()`, qui ne rend pas la main lorsqu'aucun
 * gestionnaire de fichiers ne répond. Mesuré sur une Debian privée de
 * `xdg-open` : l'appel reste en suspens au-delà de huit secondes, sans erreur
 * ni valeur, et le gestionnaire IPC qui l'attendait restait pendant lui aussi —
 * une promesse abandonnée par clic.
 *
 * La promesse d'origine n'est pas annulée, rien ne le permet : elle est
 * seulement cessée d'être attendue.
 */
export function borner<T>(promesse: Promise<T>, ms: number, ecoule: T): Promise<T> {
  return new Promise<T>((resoudre) => {
    const minuterie = setTimeout(() => resoudre(ecoule), ms)
    void promesse.then(
      (valeur) => {
        clearTimeout(minuterie)
        resoudre(valeur)
      },
      () => {
        clearTimeout(minuterie)
        resoudre(ecoule)
      }
    )
  })
}
