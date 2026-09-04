import { describe, expect, it } from 'vitest'
import {
  assertInsideWorkspace,
  encodeProjectDir,
  tmuxSessionName
} from '../src/main/util/paths'

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
    ],
    // Les mêmes vérifications sur Debian, contre le contenu réel de
    // ~/.claude/projects. La règle ne change pas d'un système à l'autre : seule
    // la racine diffère, /home au lieu de /Users.
    ['/home/ada/Téléchargements/compilatio', '-home-ada-T-l-chargements-compilatio'],
    [
      "/home/ada/Workspace/Ndeye Awa avec l'historique",
      '-home-ada-Workspace-Ndeye-Awa-avec-l-historique'
    ],
    // Un tiret entouré d'espaces en donne trois, un par caractère.
    [
      '/home/ada/Workspace/Projet RAG - Fintuning - Agents',
      '-home-ada-Workspace-Projet-RAG---Fintuning---Agents'
    ]
  ]

  it.each(cas)('%s', (chemin, attendu) => {
    expect(encodeProjectDir(chemin)).toBe(attendu)
  })

  /**
   * Le compte des tirets se fait sur les unités UTF-16, pas sur les caractères.
   *
   * Un accent ou un tiret cadratin tient dans une unité et donne un tiret, quel
   * que soit son poids en octets. Un emoji en occupe deux et en donne deux. La
   * règle est celle d'un `replace` sans le drapeau `u` : l'ajouter n'écrirait
   * qu'un tiret pour l'emoji, et Claudex chercherait un dossier qui n'existe pas.
   *
   * Vérifié en lançant `claude` dans ces dossiers et en lisant le nom créé.
   */
  it("suit le découpage UTF-16, jusqu'aux caractères hors du plan de base", () => {
    expect(encodeProjectDir('/home/ada/Été 2026 (v1.2) — fin')).toBe(
      '-home-ada--t--2026--v1-2----fin'
    )
    expect(encodeProjectDir('/home/ada/日本語 😀 fin')).toBe('-home-ada--------fin')
  })

  it('est à sens unique : deux chemins peuvent produire le même dossier', () => {
    expect(encodeProjectDir('/a/b c')).toBe(encodeProjectDir('/a/b_c'))
  })
})

describe('assertInsideWorkspace', () => {
  const roots = ['/Users/x/projet', '/Users/x/autre']

  it('accepte le workspace lui-même et sa descendance', () => {
    expect(assertInsideWorkspace('/Users/x/projet', roots)).toBe('/Users/x/projet')
    expect(assertInsideWorkspace('/Users/x/projet/src/a.ts', roots)).toBe(
      '/Users/x/projet/src/a.ts'
    )
  })

  it('refuse un chemin extérieur', () => {
    expect(() => assertInsideWorkspace('/etc/passwd', roots)).toThrow()
  })

  it("refuse un dossier voisin dont le nom commence pareil", () => {
    expect(() => assertInsideWorkspace('/Users/x/projet-secret/a', roots)).toThrow()
  })

  it('refuse une remontée par ..', () => {
    expect(() => assertInsideWorkspace('/Users/x/projet/../../secret', roots)).toThrow()
  })
})

describe('tmuxSessionName', () => {
  it('ne produit que des caractères sûrs pour une cible tmux', () => {
    const nom = tmuxSessionName('ws-1.a', 'tab:2')
    expect(nom).toBe('cdx_ws1a_tab2')
    expect(nom).not.toMatch(/[.:]/)
  })
})
