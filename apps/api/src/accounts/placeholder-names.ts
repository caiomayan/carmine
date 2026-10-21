/**
 * Nome fictício de uma Conta sem nome aceitável (U1b). Vale quando o nome Steam é vazio, ofensivo
 * ou foi resetado pela Staff, no lugar do antigo "Jogador #ID": o `#ID` não aparece em nenhuma
 * tela nem no jogo (spec, "ID público fora da interface"), e um nome provisório que o carregasse
 * o devolveria por onde ele saiu.
 *
 * Lista curada de nomes PT-BR comuns, neutros e inofensivos, com um toque de anos 60 (o tom
 * "Liberty" do produto). Todos passam nas regras de um nome próprio e no filtro de palavras
 * ofensivas (`placeholder-names.spec.ts`). Não há unicidade: dois jogadores podem ser "Alfredo",
 * como já podem ter o mesmo nome Steam.
 *
 * **Mudar a lista ou a conta de `placeholderNameFor` exige uma migração de dados**, porque o
 * nome fica gravado em `accounts.display_name` (a 0013 repete esta conta em SQL).
 */
export const PLACEHOLDER_NAMES: readonly string[] = [
  'Alfredo',
  'Fulano',
  'Beltrano',
  'Ciclano',
  'Osvaldo',
  'Aurélio',
  'Heitor',
  'Wilson',
  'Rubens',
  'Hélio',
  'Lauro',
  'Cláudio',
  'Everaldo',
  'Nelson',
  'Orlando',
  'Armando',
  'Reinaldo',
  'Valdir',
  'Ademar',
  'Eurico',
  'Moacir',
  'Gilberto',
  'Joaquim',
  'Otávio',
  'Sebastião',
  'Teodoro',
  'Edgar',
  'Milton',
  'Waldemar',
  'Almir',
  'Anselmo',
  'Cândido',
  'Odete',
  'Marlene',
  'Neusa',
  'Alzira',
  'Dulce',
  'Iracema',
  'Zuleica',
  'Nair',
  'Lúcia',
  'Teresa',
  'Conceição',
  'Rosalina',
  'Eunice',
  'Ivone',
  'Lourdes',
  'Maristela',
  'Norma',
  'Olga',
  'Palmira',
  'Selma',
  'Vera',
  'Berenice',
  'Cecília',
  'Dirce',
  'Elza',
  'Fátima',
  'Glória',
  'Hilda',
  'Ilda',
  'Jandira',
  'Leonor',
  'Madalena',
];

/** Multiplicador de Knuth (hash multiplicativo): espalha IDs seguidos pela lista. */
const MULTIPLIER = 2_654_435_761n;
const MODULUS = 4_294_967_296n;

/**
 * O nome fictício da Conta: sempre o mesmo para o mesmo ID público, para não mudar a cada visita.
 * Só inteiros (`BigInt`), para a migração de dados repetir a conta em SQL sem diferença:
 * `floor(((publicId * 2654435761) mod 2^32) * N / 2^32)`.
 */
export function placeholderNameFor(publicId: number): string {
  const size = BigInt(PLACEHOLDER_NAMES.length);
  const index = (((BigInt(publicId) * MULTIPLIER) % MODULUS) * size) / MODULUS;
  return PLACEHOLDER_NAMES[Number(index)] as string;
}
