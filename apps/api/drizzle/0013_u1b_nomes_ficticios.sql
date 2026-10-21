-- Nomes fictícios (U1b): quem já tem o antigo "Jogador #ID" gravado passa ao nome fictício fixo
-- da Conta. A conta é a mesma de `placeholderNameFor` (src/accounts/placeholder-names.ts):
-- floor(((public_id * 2654435761) mod 2^32) * N / 2^32), com a lista na mesma ordem. As demais
-- Contas se corrigem sozinhas no próximo connect ou login, que recalculam o nome.
UPDATE "accounts"
SET "display_name" = (ARRAY['Alfredo', 'Fulano', 'Beltrano', 'Ciclano', 'Osvaldo', 'Aurélio', 'Heitor', 'Wilson', 'Rubens', 'Hélio', 'Lauro', 'Cláudio', 'Everaldo', 'Nelson', 'Orlando', 'Armando', 'Reinaldo', 'Valdir', 'Ademar', 'Eurico', 'Moacir', 'Gilberto', 'Joaquim', 'Otávio', 'Sebastião', 'Teodoro', 'Edgar', 'Milton', 'Waldemar', 'Almir', 'Anselmo', 'Cândido', 'Odete', 'Marlene', 'Neusa', 'Alzira', 'Dulce', 'Iracema', 'Zuleica', 'Nair', 'Lúcia', 'Teresa', 'Conceição', 'Rosalina', 'Eunice', 'Ivone', 'Lourdes', 'Maristela', 'Norma', 'Olga', 'Palmira', 'Selma', 'Vera', 'Berenice', 'Cecília', 'Dirce', 'Elza', 'Fátima', 'Glória', 'Hilda', 'Ilda', 'Jandira', 'Leonor', 'Madalena'])[
	1 + (((("public_id" * 2654435761) % 4294967296) * 64) / 4294967296)::int
]
WHERE "custom_display_name" IS NULL
	AND "display_name" = 'Jogador #' || "public_id"::text;
