import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertInsideWorkspace,
  encodeProjectDir,
  tmuxSessionName
} from '../src/main/util/paths'

const SUR_WINDOWS = process.platform === 'win32'

describe('encodeProjectDir', () => {
  // Ces paires reprennent la forme de cas relevés sur une vraie machine —
  // espaces, accents, apostrophes, tirets déjà présents, mélange de séparateurs
  // — chacune vérifiée contre le contenu réel de ~/.claude/projects. Les noms
  // sont neutres : ce qui compte ici est la ponctuation, jamais le mot.
  const cas: Array<[string, string]> = [
    ['/Users/ada/Workspace/Mon IDE fait maison', '-Users-ada-Workspace-Mon-IDE-fait-maison'],
    [
      '/Users/ada/Workspace/Acme/Boutique/boutique_clients/web_clients/boutique_front',
      '-Users-ada-Workspace-Acme-Boutique-boutique-clients-web-clients-boutique-front'
    ],
    [
      '/Users/ada/Workspace/je porte la casquette sur mon app',
      '-Users-ada-Workspace-je-porte-la-casquette-sur-mon-app'
    ],
    // Accents et apostrophe : chaque caractère non alphanumérique compte pour un tiret.
    [
      "/Users/ada/Workspace/voir si le téléphone n'est pas éteint",
      '-Users-ada-Workspace-voir-si-le-t-l-phone-n-est-pas--teint'
    ],
    ['/Users/ada/Downloads/tmp', '-Users-ada-Downloads-tmp'],
    // Un tiret déjà présent est conservé tel quel.
    [
      '/Users/ada/Workspace/Acme/Boutique/boutique_services/metabase-backup',
      '-Users-ada-Workspace-Acme-Boutique-boutique-services-metabase-backup'
    ]
  ]

  it.each(cas)('%s', (chemin, attendu) => {
    expect(encodeProjectDir(chemin)).toBe(attendu)
  })

  it('est à sens unique : deux chemins peuvent produire le même dossier', () => {
    expect(encodeProjectDir('/a/b c')).toBe(encodeProjectDir('/a/b_c'))
  })

  // La même règle, sur des chemins Windows relevés dans ~/.claude/projects après
  // avoir lancé `claude` dans chacun des dossiers. Le deux-points du lecteur et
  // l'antislash comptent chacun pour un tiret, exactement comme la barre oblique :
  // rien à changer à l'encodage, ce qui n'allait pas de soi.
  const casWindows: Array<[string, string]> = [
    ['C:\\Users\\ada', 'C--Users-ada'],
    [
      'C:\\Users\\ada\\essai claudex\\dossier_test',
      'C--Users-ada-essai-claudex-dossier-test'
    ],
    // Un chemin de partage réseau commence par deux antislashs : deux tirets.
    ['\\\\serveur\\partage\\projet', '--serveur-partage-projet'],
    ['D:\\Travail\\Acme\\boutique-front', 'D--Travail-Acme-boutique-front']
  ]

  it.each(casWindows)('%s', (chemin, attendu) => {
    expect(encodeProjectDir(chemin)).toBe(attendu)
  })
})

describe('assertInsideWorkspace', () => {
  // Les chemins sont ceux du système qui exécute le test : `resolve` y complète un
  // chemin POSIX avec la lettre du lecteur courant, et la valeur rendue ne serait
  // alors plus celle qu'on lui a passée.
  const racine = SUR_WINDOWS ? 'C:\\Users\\x' : '/Users/x'
  const projet = join(racine, 'projet')
  const roots = [projet, join(racine, 'autre')]

  it('accepte le workspace lui-même et sa descendance', () => {
    expect(assertInsideWorkspace(projet, roots)).toBe(projet)
    expect(assertInsideWorkspace(join(projet, 'src', 'a.ts'), roots)).toBe(
      join(projet, 'src', 'a.ts')
    )
  })

  it('refuse un chemin extérieur', () => {
    expect(() => assertInsideWorkspace(SUR_WINDOWS ? 'C:\\Windows\\win.ini' : '/etc/passwd', roots)).toThrow()
  })

  it("refuse un dossier voisin dont le nom commence pareil", () => {
    expect(() => assertInsideWorkspace(join(racine, 'projet-secret', 'a'), roots)).toThrow()
  })

  it('refuse une remontée par ..', () => {
    // Assemblé à la main : `join` normaliserait les `..` avant même l'appel, et
    // le garde-fou ne serait plus celui qu'on teste.
    expect(() => assertInsideWorkspace(`${projet}${sep}..${sep}..${sep}secret`, roots)).toThrow()
  })
})

describe('tmuxSessionName', () => {
  it('ne produit que des caractères sûrs pour une cible tmux', () => {
    const nom = tmuxSessionName('ws-1.a', 'tab:2')
    expect(nom).toBe('cdx_ws1a_tab2')
    expect(nom).not.toMatch(/[.:]/)
  })
})
