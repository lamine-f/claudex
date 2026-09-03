/**
 * Prépare le jeu d'icônes de fichiers à partir de material-icon-theme.
 *
 * Le paquet publie un manifeste de plusieurs milliers de correspondances et
 * 1251 SVG. On n'en garde que ce que l'interface consulte — extensions, noms
 * exacts, dossiers, et les icônes de repli — puis on copie les SVG retenus
 * dans les ressources du renderer, où ils seront servis tels quels.
 *
 *   node scripts/preparer-icones.mjs
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const paquet = resolve(ici, '../node_modules/material-icon-theme')
const versSvg = resolve(ici, '../src/renderer/public/icones-fichiers')
const versManifeste = resolve(ici, '../src/renderer/src/components/files/correspondances.json')

const manifeste = JSON.parse(
  await readFile(join(paquet, 'dist/material-icons.json'), 'utf8')
)

/** Nom du SVG derrière une définition d'icône, sans son chemin ni son extension. */
const nomIcone = (cle) => {
  const def = manifeste.iconDefinitions[cle]
  return def ? basename(def.iconPath, '.svg') : undefined
}

/**
 * Index inversé : une icône, les clés qui la désignent.
 *
 * Le même nom d'icône revient des dizaines de fois — « json » couvre à lui
 * seul des centaines de fichiers — et le répéter triplait le poids du
 * manifeste embarqué.
 */
const inverser = (source) => {
  const index = {}
  for (const [cle, valeur] of Object.entries(source ?? {})) {
    const icone = nomIcone(valeur)
    if (!icone) continue
    ;(index[icone] ??= []).push(cle.toLowerCase())
  }
  return index
}

const retenu = {
  extensions: inverser(manifeste.fileExtensions),
  noms: inverser(manifeste.fileNames),
  // L'icône d'un dossier ouvert se déduit par un suffixe dans 4599 cas sur
  // 4654 : la stocker deux fois coûterait 157 Ko pour cinquante-cinq écarts.
  dossiers: inverser(manifeste.folderNames),
  defauts: {
    fichier: nomIcone(manifeste.file),
    dossier: nomIcone(manifeste.folder),
    dossierOuvert: nomIcone(manifeste.folderExpanded)
  }
}

// Seuls les SVG réellement atteignables sont copiés, variantes ouvertes des
// dossiers comprises.
const utiles = new Set(
  [
    ...Object.keys(retenu.extensions),
    ...Object.keys(retenu.noms),
    ...Object.keys(retenu.dossiers),
    ...Object.keys(retenu.dossiers).map((n) => `${n}-open`),
    ...Object.values(retenu.defauts)
  ].filter(Boolean)
)

await rm(versSvg, { recursive: true, force: true })
await mkdir(versSvg, { recursive: true })

const disponibles = new Set(
  (await readdir(join(paquet, 'icons'))).filter((f) => f.endsWith('.svg')).map((f) => basename(f, '.svg'))
)
let copies = 0
for (const nom of utiles) {
  if (!disponibles.has(nom)) continue
  await copyFile(join(paquet, 'icons', `${nom}.svg`), join(versSvg, `${nom}.svg`))
  copies++
}

await writeFile(versManifeste, `${JSON.stringify(retenu)}\n`)

const compte = (index) => Object.values(index).reduce((n, cles) => n + cles.length, 0)
console.log(
  `${copies} icônes copiées · ` +
    `${compte(retenu.extensions)} extensions, ` +
    `${compte(retenu.noms)} noms, ` +
    `${compte(retenu.dossiers)} dossiers`
)
