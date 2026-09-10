import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resoudre, vagues, type Declaration } from '../src/shared/services'

const lire = (texte: string): Declaration => parse(texte) as Declaration

describe('défauts de groupe', () => {
  const declaration = lire(`
defaut:
  back:
    commande: ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
    sante: http://localhost:{port}/actuator/health
    depend_de: [infra]

services:
  - nom: infra
    commande: docker compose up -d
    detache: true
  - nom: auth
    groupe: back
    dossier: olive_auth_service
    port: 8010
  - nom: front_admin
    groupe: back
    dossier: olive_front_admin
    port: 4201
    commande: npm start
`)

  it('donne au service la commande de son groupe', () => {
    const { services } = resoudre(declaration)
    const auth = services.find((s) => s.nom === 'auth')!
    expect(auth.commande).toBe('./mvnw spring-boot:run -Dspring-boot.run.profiles=local')
    expect(auth.depend_de).toEqual(['infra'])
  })

  it('remplace le port dans l’URL de santé', () => {
    const { services } = resoudre(declaration)
    expect(services.find((s) => s.nom === 'auth')!.sante).toBe(
      'http://localhost:8010/actuator/health'
    )
  })

  it('laisse le service écraser ce que son groupe propose', () => {
    const { services } = resoudre(declaration)
    expect(services.find((s) => s.nom === 'front_admin')!.commande).toBe('npm start')
  })

  it('n’impose rien à qui n’a pas de groupe', () => {
    const { services } = resoudre(declaration)
    const infra = services.find((s) => s.nom === 'infra')!
    expect(infra.commande).toBe('docker compose up -d')
    expect(infra.detache).toBe(true)
    expect(infra.depend_de).toEqual([])
  })
})

describe('déclarations fautives', () => {
  it('refuse un service sans commande', () => {
    const { services, reproches } = resoudre(lire('services:\n  - nom: seul'))
    expect(services).toHaveLength(0)
    expect(reproches[0]?.message).toMatch(/commande/)
  })

  it('refuse deux services du même nom', () => {
    const { reproches } = resoudre(
      lire('services:\n  - nom: a\n    commande: x\n  - nom: a\n    commande: y')
    )
    expect(reproches[0]?.message).toMatch(/portent ce nom/)
  })

  it('signale une dépendance qui ne désigne rien', () => {
    const { reproches } = resoudre(
      lire('services:\n  - nom: a\n    commande: x\n    depend_de: [fantome]')
    )
    expect(reproches[0]?.message).toMatch(/fantome/)
  })

  it('refuse une santé qui attend un port absent', () => {
    const { services, reproches } = resoudre(
      lire('services:\n  - nom: a\n    commande: x\n    sante: http://localhost:{port}/sante')
    )
    expect(services).toHaveLength(0)
    expect(reproches[0]?.message).toMatch(/port/)
  })
})

describe('ordre de démarrage', () => {
  const plan = (texte: string): ReturnType<typeof vagues> => vagues(resoudre(lire(texte)).services)

  it('range les services en vagues lançables d’un bloc', () => {
    const { ordre, bloques } = plan(`
services:
  - { nom: infra, commande: x }
  - { nom: auth, commande: x, depend_de: [infra] }
  - { nom: gateway, commande: x, depend_de: [infra, auth] }
  - { nom: front, commande: x, depend_de: [gateway] }
`)
    expect(ordre.map((v) => v.map((s) => s.nom))).toEqual([
      ['infra'],
      ['auth'],
      ['gateway'],
      ['front']
    ])
    expect(bloques).toEqual([])
  })

  it('met dans la même vague ce qui ne s’attend pas', () => {
    const { ordre } = plan(`
services:
  - { nom: infra, commande: x }
  - { nom: a, commande: x, depend_de: [infra] }
  - { nom: b, commande: x, depend_de: [infra] }
`)
    expect(ordre[1]?.map((s) => s.nom)).toEqual(['a', 'b'])
  })

  it('nomme ce qu’un cycle retient, au lieu de tourner sans fin', () => {
    const { ordre, bloques } = plan(`
services:
  - { nom: a, commande: x, depend_de: [b] }
  - { nom: b, commande: x, depend_de: [a] }
`)
    expect(ordre).toEqual([])
    expect(bloques.map((s) => s.nom)).toEqual(['a', 'b'])
  })
})

/**
 * Le cas qui a dessiné le fichier : onze services Spring, deux fronts Angular,
 * et l'infrastructure en conteneurs dont tout dépend.
 */
const OLIVE = `
defaut:
  back:
    commande: ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
    sante: http://localhost:{port}/actuator/health
    depend_de: [infra]
  front:
    commande: npm start
    depend_de: [gateway]

services:
  - nom: infra
    groupe: infra
    commande: docker compose up -d
    detache: true
    sante: http://localhost:8500/v1/status/leader

  - { nom: auth,                 groupe: back, port: 8010, dossier: olive_services/olive_auth_service }
  - { nom: administration,       groupe: back, port: 8020, dossier: olive_services/olive_administration }
  - { nom: settings,             groupe: back, port: 8030, dossier: olive_services/olive_settings_service }
  - { nom: princing,             groupe: back, port: 8060, dossier: olive_services/olive_princing }
  - { nom: subscription_rules,   groupe: back, port: 8070, dossier: olive_services/olive_subscription_rules_service }
  - { nom: pdf_builder,          groupe: back, port: 8081, dossier: olive_services/olive_pdf_builder_service }
  - { nom: datawarehouse,        groupe: back, port: 8082, dossier: olive_services/olive_datawarehouse }
  - { nom: numeric_attestations, groupe: back, port: 8091, dossier: olive_services/olive_numeric_attestations }
  - { nom: core,                 groupe: back, port: 8100, dossier: olive_services/olive_core }
  - { nom: customer,             groupe: back, port: 8110, dossier: olive_services/olive_customer }
  - { nom: gateway,              groupe: back, port: 8080, dossier: olive_services/olive_gateway_service, depend_de: [infra, auth] }

  - { nom: front,       groupe: front, port: 4200, dossier: olive_clients/web_clients/olive_front }
  - { nom: front_admin, groupe: front, port: 4201, dossier: olive_clients/web_clients/olive_front_admin, commande: npm start }
`

describe('le cas Olive', () => {
  const { services, reproches } = resoudre(lire(OLIVE))

  it('se lit sans reproche', () => {
    expect(reproches).toEqual([])
    expect(services).toHaveLength(14)
  })

  it('donne à chaque service back sa commande et sa santé', () => {
    const core = services.find((s) => s.nom === 'core')!
    expect(core.commande).toContain('spring-boot.run.profiles=local')
    expect(core.sante).toBe('http://localhost:8100/actuator/health')
  })

  it('démarre en quatre vagues, l’infrastructure en tête', () => {
    const { ordre, bloques } = vagues(services)
    expect(bloques).toEqual([])
    expect(ordre.map((v) => v.length)).toEqual([1, 10, 1, 2])
    expect(ordre[0]!.map((s) => s.nom)).toEqual(['infra'])
    expect(ordre[2]!.map((s) => s.nom)).toEqual(['gateway'])
    expect(ordre[3]!.map((s) => s.nom)).toEqual(['front', 'front_admin'])
  })

  it('ne laisse tourner l’infrastructure que sur sa santé', () => {
    // Sa commande rend la main aussitôt : la juger sur son processus la dirait
    // arrêtée alors que les conteneurs tournent.
    const infra = services.find((s) => s.nom === 'infra')!
    expect(infra.detache).toBe(true)
    expect(infra.sante).toBeTruthy()
  })
})

describe('modèles nommés, séparés des groupes', () => {
  it('fait hériter du modèle cité, sans toucher au groupe', () => {
    // Un front qui se lance autrement que ses voisins devait former un groupe
    // à lui seul : la page en montrait deux là où il n'y a qu'une famille.
    const declaration = lire(`
modeles:
  angular:
    commande: npm start
  angular_public:
    commande: npm run start-public-local

services:
  - { nom: front,        modele: angular,        groupe: front, port: 4200 }
  - { nom: front_public, modele: angular_public, groupe: front, port: 4300 }
  - { nom: front_admin,  modele: angular,        groupe: front, port: 4201 }
`)
    const { services, reproches } = resoudre(declaration)

    expect(reproches).toEqual([])
    expect(services.map((s) => s.commande)).toEqual([
      'npm start',
      'npm run start-public-local',
      'npm start'
    ])
    // Un seul groupe, quel que soit le nombre de modèles.
    expect(new Set(services.map((s) => s.groupe))).toEqual(new Set(['front']))
  })

  it('dit qu’un modèle cité n’existe pas', () => {
    // Silencieux, le service serait simplement écarté faute de commande, et
    // l'on chercherait la faute dans le mauvais champ.
    const { services, reproches } = resoudre(
      lire(`
modeles:
  angular: { commande: npm start }
services:
  - { nom: front, modele: angulaire }
`)
    )
    expect(services).toEqual([])
    expect(reproches[0]?.message).toContain('angulaire')
  })

  it('garde le bloc du groupe pour les fichiers écrits avant', () => {
    // La première façon de faire marche sans être reprise.
    const { services } = resoudre(
      lire(`
defaut:
  back: { commande: ./mvnw spring-boot:run }
services:
  - { nom: coeur, groupe: back, port: 8081 }
`)
    )
    expect(services[0]?.commande).toBe('./mvnw spring-boot:run')
  })

  it('ne consulte pas le bloc du groupe quand un modèle est cité', () => {
    // Deux sources pour un même champ se contrediraient un jour. Celle qu'on a
    // nommée l'emporte.
    const { services } = resoudre(
      lire(`
modeles:
  neuf: { commande: la bonne }
defaut:
  back: { commande: l’ancienne }
services:
  - { nom: coeur, modele: neuf, groupe: back }
`)
    )
    expect(services[0]?.commande).toBe('la bonne')
  })
})
