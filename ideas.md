# Direção visual — GPS Navegação AR Offline

## Três direções consideradas

### Tema: Cockpit Solar
Uma interface escura de cockpit, com âmbar de alta visibilidade e detalhes azul-petróleo para traduzir velocidade, foco e orientação. A linguagem é técnica, mas com calor suficiente para parecer um instrumento de viagem.
**Probabilidade:** 0,07

### Tema: Atlas Editorial
Uma leitura cartográfica clara, com branco mineral, tinta azul e acentos laranja, inspirada em atlas impressos e sinalização rodoviária. A experiência seria mais serena e informativa, priorizando legibilidade em ambientes externos.
**Probabilidade:** 0,03

### Tema: Horizonte Cinético
Uma estética de navegação noturna com superfícies translúcidas, linhas de trajetória e microanimações que respondem ao movimento do aparelho. O AR aparece como uma camada viva sobre o mundo, sem parecer um painel genérico.
**Probabilidade:** 0,09

## Abordagem escolhida: Cockpit Solar

### Design Movement
**Neo-industrial de instrumentação**, combinando painéis de cockpit, sinalização rodoviária contemporânea e interfaces de telemetria. A proposta transforma o mapa em um instrumento confiável, não em um dashboard decorativo.

### Core Principles
1. **Estado sempre visível:** GPS, rede, bússola, câmera, rota e modo offline comunicam seu estado sem depender de adivinhação.
2. **Hierarquia de estrada:** distância, próxima manobra e destino dominam; controles secundários ficam em camadas discretas.
3. **Tolerância a sensores imperfeitos:** heading usa suavização circular, fallback de orientação, calibração explícita e nunca promete precisão inexistente.
4. **Offline honesto:** cache, rota e limitações de rede são tratados como capacidades mensuráveis, não como promessa vaga.

### Color Philosophy
O **âmbar solar** (#ffb000) é o sinal proprietário de decisão: rota, foco e ação. Grafite profundo reduz o brilho percebido da tela e melhora a leitura noturna. Azul-petróleo indica infraestrutura e telemetria; verde menta significa que uma capacidade foi confirmada. Vermelho fica reservado a interrupções, permissões negadas e ações destrutivas.

### Layout Paradigm
Um palco de mapa em tela inteira com dois trilhos de informação: uma fita de telemetria no topo e um painel de comando ancorado abaixo. No AR, o conteúdo é organizado como HUD de direção, com o indicador no eixo central e o contexto da rota em uma faixa inferior. Evitar centralização excessiva: o mapa respira, enquanto os controles orbitam as bordas úteis do polegar.

### Signature Elements
- **Marca em chevron/agulha:** símbolo forward-facing usado no topo, no mapa e no estado de navegação.
- **Linha de telemetria:** pequenos rótulos monoespaçados, separadores e indicadores de saúde do sistema.
- **Faixa de rota em âmbar:** rota sólida no mapa e guia volumétrica no AR, com pulso discreto e sem brilho exagerado.

### Interaction Philosophy
Cada toque deve confirmar uma intenção: procurar, fixar destino, calcular, iniciar AR ou sair. Operações assíncronas exibem estado no próprio controle, evitam cliques duplicados e podem ser canceladas quando aplicável. Falhas são explicadas em linguagem acionável.

### Animation
Movimentos de interface ficam entre 120 e 240 ms, com easing de saída firme. A seta faz um pulso lento apenas durante navegação; o heading usa interpolação circular para evitar saltos entre 359° e 0°. A inicialização do AR usa fade curto e a rota desenhada no mapa recebe uma transição suave. `prefers-reduced-motion` desativa pulso, transformações e transições não essenciais.

### Typography System
**Space Grotesk** em títulos e números importantes, com peso 600–700. **JetBrains Mono** para graus, distância, status e metadados. Texto auxiliar usa um sans system legível, evitando Inter como fonte dominante. O contraste é alto e a largura de linha curta em painéis para leitura com o aparelho em movimento.

### Brand Essence
**Um copiloto AR offline para quem quer transformar deslocamento em direção clara, mesmo quando a rede falha.** Personalidade: concentrada, aventureira, confiável.

### Brand Voice
Headlines são curtas e orientadas à ação; CTAs descrevem o próximo passo real; microcopy é direto, transparente e nunca finge precisão.

> “A estrada à frente. O sinal sob controle.”
>
> “Calcule antes de sair. Navegue sem depender da rede.”

### Wordmark & Logo
Um símbolo sem texto formado por um chevron de avanço atravessado por uma agulha de bússola, com um corte negativo que sugere a moldura de um para-brisa. O mark deve funcionar em 20 px e em uma placa grande, sem depender de letras.

### Signature Brand Color
**Âmbar Solar — #ffb000**, um amarelo-laranja de alta legibilidade que remete à sinalização de estrada iluminada pelo sol e torna cada decisão de navegação imediatamente reconhecível.
