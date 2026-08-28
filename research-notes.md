# Pesquisa técnica — mapas e roteamento offline

A documentação oficial do GraphHopper descreve uma API de roteamento por perfil de veículo, com cálculo de melhor caminho entre pontos e suporte a instruções; fonte: https://docs.graphhopper.com/openapi.

A documentação oficial do Valhalla descreve respostas de rota com geometria codificada e uma lista de manobras; fonte: https://valhalla.github.io/valhalla/api/route/api-reference/.

Decisão de implementação: o frontend deve expor um contrato único de rota (`points`, `steps`, `distance`, `duration`) e usar adaptadores que aceitem respostas GraphHopper/Valhalla quando um endpoint for configurado. Sem endpoint local disponível no navegador, o fallback deve ser explícito e determinístico, nunca apresentado como rota de rua real.
