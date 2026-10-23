# Tailwind CSS v4, shadcn/ui e Animate UI no web, no lugar de CSS Modules

O `apps/web` nasceu com CSS Modules e custom properties. Antes de existirem telas de verdade, migramos para Tailwind CSS v4 + shadcn/ui, com componentes animados do Animate UI, ícones Lucide (variantes animadas do lucide-animated) e ícones de marcas (Steam, FACEIT, Discord, redes sociais) do Simple Icons. O motivo é manutenção e escala: componentes padronizados, um ecossistema grande e a possibilidade de adicionar componentes prontos por registry em minutos. Os tokens da identidade Liberty continuam sendo a fonte única, expostos ao Tailwind via `@theme`.

## Consequences

- O Animate UI declara "MIT + Commons Clause" no `LICENSE.md` (o README diz MIT) e está sem commits desde 31/12/2025. O código copiado vira nosso: mantemos e corrigimos localmente, e a licença deve ser revista antes de cobrar VIP.
- Nem o Animate UI nem o lucide-animated tratam `prefers-reduced-motion`: o app inteiro fica sob `<MotionConfig reducedMotion="user">`, e cada componente animado é verificado com movimento reduzido.
- Marcas do Simple Icons são CC0 como desenho, mas seguem as diretrizes de marca de cada empresa.
- O fluxo do shadcn (CLI + `components.json`) passa a ser o padrão para novos componentes; CSS Modules não são mais usados.
- Select, Popover e Command (base do Combobox) não existem no registro do Animate UI: vêm do shadcn base (Radix) e são reestilizados nos tokens Liberty, com a animação de entrada do `tw-animate-css` (sem movimento com `prefers-reduced-motion`). Dropdown Menu, Dialog, Sheet, Tabs, Switch e Tooltip seguem na versão do Animate UI.

## Considered Options

- Manter CSS Modules e portar só os padrões do Animate UI: menos dependências, mas mais código próprio a manter e um ecossistema menor.
