# Operação offline real — Wayfinder

A interface agora aceita três estratégias de rota: `local`, `graphhopper` e `valhalla`. A estratégia local é um fallback determinístico para testes de UI e não representa a malha viária. Para navegação real sem internet, o motor precisa estar instalado no dispositivo ou acessível por uma rede local.

## GraphHopper

Use uma instância self-hosted com dados `.osm.pbf` da região desejada. No painel do Wayfinder, selecione **GraphHopper self-hosted** e informe o endpoint `/route`. O frontend envia dois parâmetros `point=lat,lng`, `points_encoded=false` e `instructions=true`, e normaliza `paths[0].points.coordinates`, `distance`, `time` e `instructions`.

A resposta deve permitir CORS para a origem do app. Não coloque uma chave privada no frontend; quando a instalação exigir autenticação, use um proxy local ou um gateway na mesma rede. Documentação oficial: https://docs.graphhopper.com/openapi.

## Valhalla

Use uma instância local com o grafo da região e o endpoint de rota. No painel, selecione **Valhalla self-hosted** e informe a URL. O frontend envia `POST` com `locations`, `costing: "auto"` e `directions_options.units: "kilometers"`. A resposta é normalizada a partir de `trip.summary`, `trip.legs[0].shape` e `trip.legs[0].maneuvers`; a polilinha Valhalla de precisão 6 é decodificada no navegador.

Documentação oficial: https://valhalla.github.io/valhalla/api/route/api-reference/.

## CORS e rede local

O endpoint deve ser acessível pelo navegador no mesmo aparelho. Em desenvolvimento, abra o app em `localhost` ou HTTPS. Em produção, prefira um hostname HTTPS na rede local. O navegador não consegue chamar um processo que esteja apenas no computador do desenvolvedor se o celular estiver em outra rede.

## Mapas offline

O botão **Pré-carregar** gera uma região em torno da posição atual, nos níveis de zoom 14, 15 e 16, e grava cada tile em IndexedDB. O catálogo de regiões mantém centro, total esperado, tiles concluídos, falhas, status e data de atualização. Downloads podem ser pausados e retomados; uma falha isolada não cancela o restante.

Para produção, substitua o download direto de tiles públicos por um pacote autorizado da região ou por PMTiles servido localmente. Respeite os termos e a política do provedor de tiles utilizado.

## Calibração Android/iOS

A calibração registra o offset atual em `localStorage`, suaviza a transição circular do heading e mostra `alpha`, `beta` e `gamma` brutos. Em iOS, a permissão de orientação deve ser solicitada a partir de uma ação do usuário. Em Android, sensores podem exigir HTTPS, e a precisão varia conforme o aparelho, interferência magnética e orientação física.

O offset salvo é um ajuste de sessão do produto; ele não substitui uma calibração magnética do sistema operacional nem uma correção geomagnética oficial. Antes de usar em trânsito, valide o comportamento em aparelhos físicos.
