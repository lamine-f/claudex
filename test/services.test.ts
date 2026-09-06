import { describe, expect, it } from 'vitest'
import { parse } from 'smol-toml'
import { resoudre, vagues, type Declaration } from '../src/shared/services'

const lire = (texte: string): Declaration => parse(texte) as Declaration

describe('défauts de groupe', () => {
  const declaration = lire(`
[defaut.back]
commande = "./mvnw spring-boot:run -Dspring-boot.run.profiles=local"
sante = "http://localhost:{port}/actuator/health"
depend_de = ["infra"]

[[service]]
nom = "infra"
commande = "docker compose up -d"
detache = true

[[service]]
nom = "auth"
groupe = "back"
dossier = "olive_auth_service"
port = 8010

[[service]]
nom = "front_admin"
groupe = "back"
dossier = "olive_front_admin"
port = 4201
commande = "npm start"
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
    const { services, reproches } = resoudre(lire('[[service]]\nnom = "seul"'))
    expect(services).toHaveLength(0)
    expect(reproches[0]?.message).toMatch(/commande/)
  })

  it('refuse deux services du même nom', () => {
    const { reproches } = resoudre(
      lire('[[service]]\nnom = "a"\ncommande = "x"\n[[service]]\nnom = "a"\ncommande = "y"')
    )
    expect(reproches[0]?.message).toMatch(/portent ce nom/)
  })

  it('signale une dépendance qui ne désigne rien', () => {
    const { reproches } = resoudre(
      lire('[[service]]\nnom = "a"\ncommande = "x"\ndepend_de = ["fantome"]')
    )
    expect(reproches[0]?.message).toMatch(/fantome/)
  })

  it('refuse une santé qui attend un port absent', () => {
    const { services, reproches } = resoudre(
      lire('[[service]]\nnom = "a"\ncommande = "x"\nsante = "http://localhost:{port}/sante"')
    )
    expect(services).toHaveLength(0)
    expect(reproches[0]?.message).toMatch(/port/)
  })
})

describe('ordre de démarrage', () => {
  const plan = (texte: string): ReturnType<typeof vagues> => vagues(resoudre(lire(texte)).services)

  it('range les services en vagues lançables d’un bloc', () => {
    const { ordre, bloques } = plan(`
[[service]]
nom = "infra"
commande = "x"
[[service]]
nom = "auth"
commande = "x"
depend_de = ["infra"]
[[service]]
nom = "gateway"
commande = "x"
depend_de = ["infra", "auth"]
[[service]]
nom = "front"
commande = "x"
depend_de = ["gateway"]
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
[[service]]
nom = "infra"
commande = "x"
[[service]]
nom = "a"
commande = "x"
depend_de = ["infra"]
[[service]]
nom = "b"
commande = "x"
depend_de = ["infra"]
`)
    expect(ordre[1]?.map((s) => s.nom)).toEqual(['a', 'b'])
  })

  it('nomme ce qu’un cycle retient, au lieu de tourner sans fin', () => {
    const { ordre, bloques } = plan(`
[[service]]
nom = "a"
commande = "x"
depend_de = ["b"]
[[service]]
nom = "b"
commande = "x"
depend_de = ["a"]
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
[defaut.back]
commande = "./mvnw spring-boot:run -Dspring-boot.run.profiles=local"
sante = "http://localhost:{port}/actuator/health"
depend_de = ["infra"]

[defaut.front]
commande = "npm start"
depend_de = ["gateway"]

[[service]]
nom = "infra"
groupe = "infra"
commande = "docker compose up -d"
detache = true
sante = "http://localhost:8500/v1/status/leader"

[[service]]
nom = "auth"
groupe = "back"
dossier = "olive_services/olive_auth_service"
port = 8010
[[service]]
nom = "administration"
groupe = "back"
dossier = "olive_services/olive_administration"
port = 8020
[[service]]
nom = "settings"
groupe = "back"
dossier = "olive_services/olive_settings_service"
port = 8030
[[service]]
nom = "princing"
groupe = "back"
dossier = "olive_services/olive_princing"
port = 8060
[[service]]
nom = "subscription_rules"
groupe = "back"
dossier = "olive_services/olive_subscription_rules_service"
port = 8070
[[service]]
nom = "pdf_builder"
groupe = "back"
dossier = "olive_services/olive_pdf_builder_service"
port = 8081
[[service]]
nom = "datawarehouse"
groupe = "back"
dossier = "olive_services/olive_datawarehouse"
port = 8082
[[service]]
nom = "numeric_attestations"
groupe = "back"
dossier = "olive_services/olive_numeric_attestations"
port = 8091
[[service]]
nom = "core"
groupe = "back"
dossier = "olive_services/olive_core"
port = 8100
[[service]]
nom = "customer"
groupe = "back"
dossier = "olive_services/olive_customer"
port = 8110
[[service]]
nom = "gateway"
groupe = "back"
dossier = "olive_services/olive_gateway_service"
port = 8080
depend_de = ["infra", "auth"]

[[service]]
nom = "front"
groupe = "front"
dossier = "olive_clients/web_clients/olive_front"
port = 4200
[[service]]
nom = "front_admin"
groupe = "front"
dossier = "olive_clients/web_clients/olive_front_admin"
port = 4201
commande = "npm start"
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
