import { describe, expect, it } from 'vitest'
import { estModifie, estNonSuivi, lireDeclaration, lireStatut } from '../src/shared/git'

/** La sortie de git, où les octets nuls sont écrits `\0` pour rester lisibles. */
const sortie = (...morceaux: string[]): string => morceaux.join('\0') + '\0'

describe('lecture de porcelain v2', () => {
  it('lit la branche, son amont et son écart', () => {
    // Relevé sur olive_core le 7 septembre 2026.
    const statut = lireStatut(
      sortie(
        '# branch.oid 4c2bf234f82ff2733eeb4bc78e73c12d3742e2d8',
        '# branch.head local',
        '# branch.upstream origin/local',
        '# branch.ab +2 -0'
      )
    )

    expect(statut.branche).toBe('local')
    expect(statut.amont).toBe('origin/local')
    expect(statut.avance).toBe(2)
    expect(statut.retard).toBe(0)
  })

  it('accepte une branche sans amont, qui est un état normal', () => {
    // C'est le cas de `deploy` dans olive_services : git n'écrit alors ni
    // branch.upstream ni branch.ab. En faire une erreur masquerait le dépôt.
    const statut = lireStatut(sortie('# branch.oid 78be09c', '# branch.head master'))

    expect(statut.branche).toBe('master')
    expect(statut.amont).toBeUndefined()
    expect(statut.avance).toBe(0)
    expect(statut.retard).toBe(0)
  })

  it('ne prend pas une tête détachée pour un nom de branche', () => {
    const statut = lireStatut(sortie('# branch.head (detached)'))
    expect(statut.branche).toBe('')
  })

  it('lit une entrée ordinaire des deux côtés', () => {
    const statut = lireStatut(
      sortie(
        '# branch.head local',
        '1 MM N... 100644 100644 100644 9e5211e 9e5211e src/main/java/ShareLink.java'
      )
    )

    expect(statut.fichiers).toEqual([
      { chemin: 'src/main/java/ShareLink.java', index: 'modifie', travail: 'modifie' }
    ])
  })

  it('distingue ce qui est indexé de ce qui ne l’est pas', () => {
    const statut = lireStatut(
      sortie(
        '# branch.head local',
        '1 A. N... 000000 100644 100644 000000 abc neuf.java',
        '1 .D N... 100644 100644 000000 abc abc parti.java'
      )
    )

    expect(statut.fichiers[0]).toMatchObject({ index: 'ajoute', travail: 'inchange' })
    expect(statut.fichiers[1]).toMatchObject({ index: 'inchange', travail: 'supprime' })
  })

  it('rattache un renommage à son ancien chemin', () => {
    // Relevé sur un dépôt d'essai : avec -z, l'ancien chemin est l'enregistrement
    // qui suit, là où sans -z git colle les deux autour d'une tabulation.
    const statut = lireStatut(
      sortie(
        '# branch.head main',
        '2 R. N... 100644 100644 100644 49fd79f 49fd79f R100 b.txt',
        'a.txt'
      )
    )

    expect(statut.fichiers).toEqual([
      { chemin: 'b.txt', ancien: 'a.txt', index: 'renomme', travail: 'inchange' }
    ])
  })

  it('garde entiers les chemins accentués et espacés', () => {
    // Sans -z, git les rendrait entre guillemets avec des séquences d'échappement
    // octales. Le chemin porte ici un espace : le recoller compte autant que
    // l'accent.
    const statut = lireStatut(
      sortie(
        '# branch.head main',
        '1 .M N... 100644 100644 100644 d08dee7 d08dee7 réglages été.txt',
        '? nouveau dossier/été.txt'
      )
    )

    expect(statut.fichiers.map((f) => f.chemin)).toEqual([
      'réglages été.txt',
      'nouveau dossier/été.txt'
    ])
  })

  it('relève les fichiers non suivis et laisse les ignorés', () => {
    const statut = lireStatut(
      sortie('# branch.head main', '? neuf.txt', '! cible/classes/Vieux.class')
    )

    expect(statut.fichiers).toEqual([
      { chemin: 'neuf.txt', index: 'inchange', travail: 'non-suivi' }
    ])
  })

  it('compte un conflit non résolu comme un fichier touché', () => {
    const statut = lireStatut(
      sortie(
        '# branch.head main',
        'u UU N... 100644 100644 100644 100644 aaa bbb ccc src/Conflit.java'
      )
    )

    expect(statut.fichiers).toEqual([
      { chemin: 'src/Conflit.java', index: 'modifie', travail: 'modifie' }
    ])
  })

  it('ne trouve rien dans un dépôt propre', () => {
    const statut = lireStatut(sortie('# branch.head main', '# branch.ab +0 -0'))
    expect(statut.fichiers).toEqual([])
  })
})

describe('tri des fichiers', () => {
  const statut = lireStatut(
    sortie(
      '# branch.head main',
      '1 .M N... 100644 100644 100644 aaa aaa touche.java',
      '2 R. N... 100644 100644 100644 bbb bbb R100 apres.java',
      'avant.java',
      '? neuf.java'
    )
  )

  it('sépare ce que git suit de ce qu’il ignore encore', () => {
    expect(statut.fichiers.filter(estModifie).map((f) => f.chemin)).toEqual([
      'touche.java',
      'apres.java'
    ])
    expect(statut.fichiers.filter(estNonSuivi).map((f) => f.chemin)).toEqual(['neuf.java'])
  })
})

describe('déclaration des dépôts à suivre', () => {
  it('rend les chemins déclarés, dans leur ordre', () => {
    const lu = lireDeclaration({ depots: ['olive_core', 'olive_gateway_service'] })
    expect(lu.chemins).toEqual(['olive_core', 'olive_gateway_service'])
    expect(lu.reproches).toEqual([])
  })

  it('laisse la recherche faire quand rien n’est déclaré', () => {
    // Un projet sans fichier, ou un fichier qui ne parle pas des dépôts : le
    // comportement d'avant tient, et ce n'est pas une erreur.
    expect(lireDeclaration({})).toEqual({ chemins: [], reproches: [] })
  })

  it('accepte un chemin qui remonte, pour un dépôt rangé à côté', () => {
    expect(lireDeclaration({ depots: ['../web_clients/olive_front'] }).chemins).toEqual([
      '../web_clients/olive_front'
    ])
  })

  it('refuse un chemin absolu, et dit pourquoi', () => {
    // Le fichier vit dans le projet et parle de lui. Un chemin absolu l'en
    // sortirait sans que rien ne le signale.
    const lu = lireDeclaration({ depots: ['/Users/quelquun/ailleurs'] })
    expect(lu.chemins).toEqual([])
    expect(lu.reproches[0]?.message).toContain('absolu')
  })

  it('dit qu’une liste vide ne suivra rien', () => {
    // Écrire `depots: []` est un geste, non un oubli : on le prend au mot, et
    // l'on prévient que la page restera vide.
    const lu = lireDeclaration({ depots: [] })
    expect(lu.chemins).toEqual([])
    expect(lu.reproches[0]?.message).toContain('vide')
  })

  it('écarte ce qui n’est pas du texte, sans perdre le reste', () => {
    const lu = lireDeclaration({ depots: ['bon', 42, '', 'bon'] })
    expect(lu.chemins).toEqual(['bon'])
    expect(lu.reproches).toHaveLength(3)
  })

  it('refuse une déclaration qui n’est pas une liste', () => {
    expect(lireDeclaration({ depots: 'olive_core' }).reproches[0]?.message).toContain('liste')
  })
})
