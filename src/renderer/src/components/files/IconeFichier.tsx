import correspondances from './correspondances.json'

/**
 * Icône d'un fichier ou d'un dossier, tirée du jeu Material Icon Theme.
 *
 * Le manifeste est publié à l'envers — une icône, les clés qui la désignent —
 * pour tenir en cent kilo-octets ; il est remis à l'endroit une fois, au
 * chargement du module.
 */
function redresser(index: Record<string, string[]>): Map<string, string> {
  const table = new Map<string, string>()
  for (const [icone, cles] of Object.entries(index)) {
    for (const cle of cles) table.set(cle, icone)
  }
  return table
}

const EXTENSIONS = redresser(correspondances.extensions)
const NOMS = redresser(correspondances.noms)
const DOSSIERS = redresser(correspondances.dossiers)
const { fichier: PAR_DEFAUT, dossier: DOSSIER, dossierOuvert: DOSSIER_OUVERT } =
  correspondances.defauts

/**
 * Nom de l'icône d'un fichier.
 *
 * Le nom entier prime — « package.json » n'est pas un JSON comme un autre — puis
 * les extensions, de la plus longue à la plus courte : « component.spec.ts » se
 * reconnaît avant de retomber sur « ts ».
 */
function iconeFichier(nom: string): string {
  const bas = nom.toLowerCase()
  const exact = NOMS.get(bas)
  if (exact) return exact

  const morceaux = bas.split('.')
  for (let i = 1; i < morceaux.length; i++) {
    const trouve = EXTENSIONS.get(morceaux.slice(i).join('.'))
    if (trouve) return trouve
  }
  return PAR_DEFAUT
}

function iconeDossier(nom: string, ouvert: boolean): string {
  const particulier = DOSSIERS.get(nom.toLowerCase())
  if (particulier) return ouvert ? `${particulier}-open` : particulier
  return ouvert ? DOSSIER_OUVERT : DOSSIER
}

interface Props {
  nom: string
  dossier: boolean
  ouvert: boolean
}

export function IconeFichier({ nom, dossier, ouvert }: Props): React.JSX.Element {
  const icone = dossier ? iconeDossier(nom, ouvert) : iconeFichier(nom)

  return (
    <img
      src={`./icones-fichiers/${icone}.svg`}
      alt=""
      aria-hidden
      width={16}
      height={16}
      // Une icône absente du jeu ne doit pas laisser un cadre brisé : le repli
      // reprend la place sans bruit.
      onError={(e) => {
        const image = e.currentTarget
        const repli = `./icones-fichiers/${dossier ? DOSSIER : PAR_DEFAUT}.svg`
        if (!image.src.endsWith(repli.slice(1))) image.src = repli
      }}
      className="shrink-0"
    />
  )
}
