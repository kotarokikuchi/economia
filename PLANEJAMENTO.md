# Dashboard de Contas Públicas e Macroeconomia do Brasil — Planejamento

> Documento de ideias, anterior a qualquer código. Criado em 2026-11-18.
> Status: rascunho. Itens marcados com **(confirmar)** precisam ser verificados na fonte antes de virar código.

## 1. Objetivo

Um painel único para acompanhar a situação macroeconômica e fiscal do governo federal brasileiro, com dados oficiais, atualizados automaticamente, e com as identidades contábeis visíveis (não só os gráficos, mas a conta que fecha).

Perguntas que o painel deve responder em menos de um minuto:

1. O PIB está crescendo? Puxado por qual componente (C, I, G ou NX)?
2. A liquidez da economia está se expandindo ou contraindo?
3. O governo está gastando mais do que arrecada? Quanto?
4. A dívida pública está em trajetória de alta ou de estabilização?
5. Como estão juros, inflação e câmbio, que condicionam tudo acima?

## 2. Uma distinção para deixar clara desde o início

"Contas públicas" e "contas nacionais" são coisas diferentes, e o painel cobre as duas:

| Termo | O que mede | Quem produz |
|---|---|---|
| Contas nacionais | A economia inteira (PIB e seus componentes) | IBGE |
| Estatísticas monetárias | Moeda e liquidez | Banco Central |
| Contas públicas (fiscais) | Receitas, despesas, resultado e dívida do governo | Tesouro Nacional e Banco Central |

Consequência prática: o **G** do PIB não é a despesa total do governo. Ele é só o consumo do governo (salários, custeio). Ficam de fora as transferências (previdência, Bolsa Família, juros da dívida), e o investimento público entra em **I**. Um gráfico de "G" não pode ser lido como "gasto público".

## 3. Blocos de indicadores

### 3.1 Contas nacionais (IBGE)

Identidade pela ótica da despesa:

```
Y = C + I + G + (X − M)        ou        Y = C + I + G + NX
```

| Símbolo | Nome nas Contas Nacionais Trimestrais |
|---|---|
| C | Despesa de consumo das famílias |
| I | Formação bruta de capital fixo (FBCF) + variação de estoques |
| G | Despesa de consumo da administração pública |
| X | Exportações de bens e serviços |
| M | Importações de bens e serviços |

Visualizações:

- PIB trimestral: variação contra o trimestre anterior (com ajuste sazonal), contra o mesmo trimestre do ano anterior e acumulada em 4 trimestres.
- Decomposição: participação de cada componente no PIB (% do total) e contribuição de cada um para o crescimento.
- Taxa de investimento (FBCF / PIB) e taxa de poupança.
- PIB pela ótica da oferta (agropecuária, indústria, serviços) como visão secundária.
- Proxy mensal: IBC-Br (Banco Central), para não esperar o dado trimestral.

Como a contribuição ao crescimento é calculada no site (o IBGE não a publica nessa tabela): peso do componente no PIB nominal do mesmo trimestre do ano anterior, multiplicado pelo crescimento real do componente contra esse trimestre. A diferença para o crescimento oficial do PIB aparece como "Estoques e resíduo" e costuma ser grande, porque a variação de estoques das contas trimestrais absorve também a discrepância estatística. É uma aproximação, e o site diz isso.

### 3.2 Moeda e liquidez (Banco Central)

Base monetária (correção da fórmula anotada inicialmente: é uma igualdade, não uma soma de três termos):

```
B = PMPP + R
```

- **PMPP**: papel-moeda em poder do público
- **R**: reservas totais dos bancos (dinheiro em caixa nos bancos + reservas bancárias no Banco Central)

Essa é a forma de livro-texto. O Banco Central publica a mesma base com outro corte, e é esse que os dados permitem reproduzir:

```
B = papel-moeda emitido + reservas bancárias
```

Verificado com dados de junho de 2026 (R$ mil): 382.713.143 + 48.387.855 = 431.100.998, exatamente a base monetária publicada. O PMPP no mesmo mês era 335.948.278; a diferença para o papel-moeda emitido (46,8 bilhões) é o dinheiro em caixa nos bancos. O painel mostra a identidade do Banco Central e explica a equivalência com a de livro-texto.

Agregados monetários (meios de pagamento), do mais líquido ao mais amplo:

| Agregado | Composição |
|---|---|
| M1 | PMPP + depósitos à vista |
| M2 | M1 + depósitos de poupança + títulos emitidos por instituições depositárias |
| M3 | M2 + quotas de fundos monetários + operações compromissadas com títulos públicos |
| M4 | M3 + títulos públicos federais de alta liquidez em poder do setor não financeiro |

M1 = PMPP + depósitos à vista foi verificado com dados de junho de 2026. **(confirmar)** A composição de M2 a M4 acima bate com os nomes das séries componentes no catálogo do Banco Central, mas falta conferir na nota metodológica em qual agregado entra cada tipo de operação compromissada, antes de escrever as legendas.

Indicadores derivados:

- Multiplicador monetário: `m = M1 / B`
- Velocidade de circulação: `V = PIB nominal / M` (da equação de trocas `M·V = P·Y`)
- Agregados em % do PIB e crescimento em 12 meses (nominal e real)

### 3.3 Contas públicas / fiscal (Tesouro Nacional e Banco Central)

É o núcleo do painel.

**Abrangência da primeira versão: só Governo Central** (Tesouro Nacional + Previdência Social + Banco Central). Receitas, despesas, primário, nominal e juros se referem todos a esse recorte. As duas exceções são os indicadores de dívida, que só existem em recorte mais amplo e aparecem rotulados como tal:

- DBGG cobre o Governo Geral (União, estados e municípios).
- DLSP cobre o Setor Público Consolidado (Governo Geral + Banco Central + estatais).

- **Resultado primário do Governo Central**: receita líquida − despesa primária (Tesouro + Previdência + Banco Central). Fonte: Resultado do Tesouro Nacional (RTN), mensal.
- **Resultado nominal**: primário − juros nominais.
- **Necessidades de Financiamento (NFSP)**: visão "abaixo da linha", do Banco Central, usando a abertura referente ao Governo Central.
- **Dívida**: Dívida Bruta do Governo Geral (DBGG) e Dívida Líquida do Setor Público (DLSP), em R$ e em % do PIB.
- **Dívida Pública Federal (DPF)**: estoque, composição por indexador (Selic, prefixado, IPCA, câmbio), prazo médio e custo médio.
- **Composição da despesa**: previdência (RGPS), pessoal, demais obrigatórias, discricionárias, investimento.
- **Regra fiscal**: meta de resultado primário e limite de despesa do arcabouço fiscal (LC 200/2023), realizado contra meta. Ainda não implementado: as metas não vêm de nenhuma API e precisam ser lançadas à mão, com fonte conferida.

Dois conceitos que precisam aparecer rotulados, porque dão números diferentes:

- "Acima da linha" (Tesouro: receitas menos despesas) contra "abaixo da linha" (Banco Central: variação da dívida).
- Governo Central contra Governo Geral contra Setor Público Consolidado. O recorte aparece no título de cada gráfico.

### 3.4 Setor externo (Banco Central / MDIC)

Detalha o **NX** da identidade do PIB: balança comercial, transações correntes (% do PIB), investimento direto no país, reservas internacionais e taxa de câmbio.

### 3.5 Preços e juros (IBGE / Banco Central)

IPCA (mensal e 12 meses, contra a meta), meta Selic, juro real ex-ante e ex-post, expectativas do Boletim Focus.

### 3.6 Projeções

O painel é de monitoramento. Projeções entram só por duas vias, sempre separadas visualmente dos dados realizados (linha tracejada e legenda própria):

- **Boletim Focus**: mediana das expectativas de mercado para o ano corrente e os seguintes. A API oferece, entre outros: IPCA, PIB total e por componente (consumo das famílias, consumo do governo, FBCF, exportações, importações), Selic, câmbio, resultado primário, resultado nominal, DBGG, DLSP, balança comercial e conta corrente (verificado em 2026-11-18). São expectativas do mercado, não do governo nem do painel.
- **Simulador de dinâmica da dívida**: o visitante escolhe juro real, crescimento do PIB e resultado primário, e vê a trajetória da dívida/PIB resultante pela fórmula da seção 4. Os valores iniciais vêm do Focus. É um exercício aritmético, não uma previsão, e a página diz isso.

Limite conhecido do simulador (verificado em 2026-11-18): com os valores iniciais do Focus (juro real 6,6%, crescimento 1,7%, primário −0,2% do PIB), a conta leva a dívida bruta de 83,0% a 135,3% do PIB em 10 anos, enquanto o próprio Focus espera cerca de 102% em 2035. A diferença vem de aplicar a Selic real a toda a dívida, por 10 anos, e de ignorar os demais fatores que movem a DBGG. O site mostra as duas linhas e explica a diferença. Melhoria possível: usar a taxa implícita da dívida em vez da Selic.

Fora: projeções do orçamento (PLOA, LDO) e modelos de previsão próprios.

Situação em 2026-11-18: as expectativas do Focus aparecem em tabela na Visão geral e como linha tracejada no gráfico de inflação. Ainda não aparecem como continuação tracejada dos demais gráficos.

## 4. Identidades que ligam os blocos

São o diferencial do painel em relação a uma coleção de gráficos soltos.

```
(S_privada − I) + (T − G) = (X − M)
```
Poupança privada líquida + resultado do governo = saldo externo. Mostra a relação entre déficit público e déficit externo.

```
Δd = d · (r − g) / (1 + g) − p
```
Dinâmica da dívida: `d` = dívida/PIB, `r` = juro real, `g` = crescimento real do PIB, `p` = primário/PIB. Permite calcular o **primário que estabiliza a dívida** e simular cenários.

```
M · V = P · Y
```
Liga o bloco monetário ao PIB nominal.

## 5. Fontes de dados

Todas públicas e gratuitas.

| Fonte | Conteúdo | Acesso |
|---|---|---|
| BCB — SGS | Séries monetárias, fiscais, externas, juros, câmbio | `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json` |
| BCB — Olinda | Expectativas Focus | `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/` |
| IBGE — SIDRA | Contas Nacionais Trimestrais, IPCA | `https://apisidra.ibge.gov.br/values/t/{tabela}/...` |
| Tesouro Transparente | RTN (só XLSX), estoque da dívida pública federal (CSV e XLSX) | `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_search` |
| Tesouro — SICONFI | Relatórios fiscais de estados e municípios (RREO, RGF). Não usado na primeira versão | `https://apidatalake.tesouro.gov.br/ords/siconfi/` |
| IPEAData | Séries longas consolidadas de várias fontes | `http://www.ipeadata.gov.br/api/odata4/` |

Códigos verificados na etapa 0 (2026-11-18), com nome conferido no catálogo de dados abertos do Banco Central (`https://dadosabertos.bcb.gov.br/api/3/action/package_search`, que informa nome, periodicidade e data de início de cada série) ou nos metadados do IBGE (`https://servicodados.ibge.gov.br/api/v3/agregados/{tabela}/metadados`).

SIDRA, Contas Nacionais Trimestrais, todas de 1996T1 em diante:

| Tabela | Conteúdo |
|---|---|
| 1846 | Valores a preços correntes |
| 1620 | Índice de volume encadeado |
| 1621 | Índice de volume encadeado com ajuste sazonal |
| 5932 | Taxas de variação do índice de volume |
| 6613 | Valores encadeados a preços de 1995 com ajuste sazonal |
| 2072 | Contas econômicas trimestrais (poupança), de 2000T1 em diante |

Categorias da classificação 11255: 90707 (PIB), 93404 (consumo das famílias), 93405 (consumo da administração pública), 93406 (FBCF), 102880 (variação de estoque, só na 1846), 93407 (exportações), 93408 (importações).

SGS, por bloco:

| Bloco | Código | Série | Início |
|---|---|---|---|
| Moeda | 1788 | Base monetária restrita, fim de período | 1946 |
| Moeda | 1786 | Papel-moeda em circulação (emitido) | 1980 |
| Moeda | 1787 | Reservas bancárias | 1980 |
| Moeda | 27789 | Papel-moeda em poder do público | dez/2001 |
| Moeda | 27790 | Depósitos à vista | dez/2001 |
| Moeda | 27791 | M1 | dez/2001 |
| Moeda | 27810 | M2 | jul/2001 |
| Moeda | 27813 | M3 | jul/2001 |
| Moeda | 27815 | M4 | dez/2001 |
| Fiscal | 4639 | Resultado primário, Governo Federal e Banco Central, fluxo mensal | 1991 |
| Fiscal | 5783 | Idem, % do PIB em 12 meses | dez/1991 |
| Fiscal | 4573 | Resultado nominal, Governo Federal e Banco Central, fluxo mensal | 1991 |
| Fiscal | 5717 | Idem, % do PIB em 12 meses | dez/1991 |
| Fiscal | 4606 | Juros nominais, Governo Federal e Banco Central, fluxo mensal | 1991 |
| Dívida | 4513 | DLSP, % do PIB | dez/2001 |
| Dívida | 13762 | DBGG, % do PIB, metodologia a partir de 2008 | dez/2006 |
| Dívida | 4537 | DBGG, % do PIB, metodologia até 2007 | dez/2001 |
| Externo | 22707 | Balança comercial, saldo mensal | 1995 |
| Externo | 22701 | Transações correntes, saldo mensal | 1995 |
| Externo | 23079 | Transações correntes, % do PIB em 12 meses | 1995 |
| Juros | 432 | Meta Selic | mar/1999 |
| Juros | 4390 | Selic acumulada no mês | 1986 |
| Câmbio | 1 | Dólar (venda), diário | 1984 |
| Atividade | 24364 | IBC-Br com ajuste sazonal | 2003 |

Conferido na coleta real da etapa 1: M1, PMPP e depósitos à vista têm o primeiro dado em jan/2002; M2 e M3, em ago/2001. M1 a M4 estão em R$ mil (M1 de R$ 0,65 trilhão e M4 de R$ 16,05 trilhões em set/2026). A identidade do PIB fecha sem resíduo em valores correntes quando se inclui a variação de estoques.

Séries acrescentadas na etapa 3, todas conferidas no catálogo do Banco Central salvo indicação:

| Bloco | Código | Série | Início |
|---|---|---|---|
| Fiscal | 5750 | Juros nominais, Governo Federal e Banco Central, % do PIB em 12 meses | dez/1991 |
| Fiscal | 7869 | Resultado primário, Governo Federal sem INSS, % do PIB em 12 meses | dez/1999 |
| Fiscal | 7870 | Resultado primário, INSS, % do PIB em 12 meses | dez/1998 |
| Fiscal | 5785 | Resultado primário, Banco Central, % do PIB em 12 meses | dez/1999 |
| Dívida | 4177, 4178, 4173 | Dívida mobiliária, participação por indexador (Selic, prefixado, câmbio), posição em carteira | jan/2000 |
| Dívida | 12001 | Idem, IPCA **(confirmar o nome)**: fora do catálogo, mas soma 100% com os demais indexadores | jan/2000 |
| Dívida | 10618 | Prazo médio dos títulos do Tesouro Nacional, em meses | set/2000 |

Conferências com dados de set/2026: Tesouro (−2,11) + INSS (2,49) + Banco Central (0,01) = primário do Governo Central (0,39% do PIB, déficit); primário (0,39) + juros (8,26) = nominal (8,66), a menos de arredondamento.

Planilha do Tesouro (Resultado do Tesouro Nacional, aba 1.1, R$ milhões, mensal): receita total, transferências por repartição, receita líquida, despesa total, benefícios previdenciários, pessoal, outras obrigatórias, despesas sujeitas à programação financeira e resultado primário acima da linha. As linhas são localizadas pelo começo do rótulo (por exemplo, "4.1 Benefícios Previdenciários"); se o Tesouro renomear uma rubrica, a série falha com erro explícito em vez de trazer dado errado. Conferido em jul/2026: receita líquida − despesa = primário, e as 4 rubricas de despesa somam a despesa total, sem resíduo. Em 12 meses, o primário do Tesouro (−72,7 bilhões) e o do Banco Central (−72,4 bilhões) diferem em R$ 0,25 bilhão.

Séries acrescentadas na etapa 4:

| Bloco | Código | Série | Início |
|---|---|---|---|
| Externo | 22885 | Investimento direto no país, líquido mensal, US$ milhões | 1995 |
| Externo | 3546 | Reservas internacionais, mensal, US$ milhões **(confirmar o nome)** | antes de 1994 |
| Preços | 13521 | Meta de inflação do ano, % **(confirmar o nome)**: fora do catálogo; os valores (3,00% desde 2024) batem com as metas conhecidas | 1999 |

Boletim Focus (API Olinda), duas consultas:

- `ExpectativasMercadoAnuais`: mediana da pesquisa mais recente para cada ano-calendário, de IPCA, PIB Total, Selic, Câmbio, Resultado primário e Dívida bruta do governo geral. É guardada como uma série por indicador, em que a "data" é o ano de referência; cada coleta sobrescreve com a pesquisa mais nova.
- `ExpectativasMercadoInflacao12Meses`: série diária, desde dez/2001, da mediana suavizada do IPCA esperado para os 12 meses seguintes. Usada no juro real esperado.

O juro real esperado do site é uma aproximação: meta Selic do fim do mês descontada da inflação esperada em 12 meses. O cálculo usual do mercado usa a taxa de contratos futuros de um ano, que não está coletada.

Nas NFSP, sinal positivo é déficit. O site inverte o sinal, para déficit aparecer como número negativo. "Governo Federal e Banco Central" inclui o INSS e corresponde ao Governo Central.

Códigos com dados conferidos, mas sem nome no catálogo **(confirmar o nome no site do SGS)**: 433 (IPCA mensal), 13522 (IPCA 12 meses), 4380 (PIB mensal em valores correntes), 3546 (reservas internacionais, mensal). Os valores recentes são coerentes com o esperado.

Séries monetárias anteriores a 2001 **(confirmar o nome)**: os códigos 1827, 1824 e 1836 têm dados desde julho de 1994 e parecem ser M1, PMPP e M2 na metodologia antiga, mas não constam no catálogo.

Existem bibliotecas Python prontas para essas APIs (`python-bcb`, `sidrapy`), mas não serão usadas: a coleta é feita em casa, com chamadas HTTP diretas (seção 8).

## 6. Armadilhas de dados já conhecidas

1. **Frequências diferentes**: PIB é trimestral; moeda e fiscal são mensais; câmbio e Selic são diários. Definir uma regra de agregação por série (fim de período, média ou soma).
2. **Nominal contra real**: toda série em R$ precisa de versão deflacionada pelo IPCA ou em % do PIB. Comparar valores nominais de anos diferentes engana.
3. **Sazonalidade**: usar a série com ajuste sazonal do IBGE quando existir; para o fiscal, usar acumulado em 12 meses.
4. **Revisões**: o IBGE revisa o PIB e o BCB revisa séries. Guardar a data de coleta de cada dado.
5. **Quebras metodológicas**: agregados monetários (2018) e mudanças de regra fiscal (teto de gastos em 2016, arcabouço em 2023).
6. **Limites do SGS** (verificado): em séries diárias a data inicial é obrigatória e a janela máxima é de 10 anos por consulta. Séries mensais aceitam o período inteiro de uma vez.
7. **Defasagem de publicação**: PIB sai cerca de 2 meses após o trimestre; fiscal, cerca de 1 mês. Mostrar a data de referência em cada gráfico.
8. **Meta Selic traz datas futuras** (verificado): a série 432 já vem preenchida até a próxima reunião do Copom. A coleta descarta datas posteriores ao dia da execução.
9. **Arquivo do Tesouro muda de nome todo mês** (verificado): o endereço da planilha do RTN inclui o mês (`seriehistoricajul26.xlsx`). A coleta precisa perguntar o endereço atual ao catálogo do Tesouro, e não guardá-lo fixo.
10. **API de séries temporais do Tesouro** (`apiapex.tesouro.gov.br`) respondeu erro 403 no teste. Não contar com ela.

### 6.1 Consequências do histórico desde 1994

O painel cobre de julho de 1994 (início do Real) em diante. Nem toda série chega até lá, e o painel mostra cada uma a partir de onde ela existe, sem emendar metodologias diferentes.

Início de cada série, verificado na etapa 0 salvo indicação:

| Série | Início | Observação |
|---|---|---|
| IPCA, câmbio, base monetária e seus componentes | antes de 1994 | cobrem o período inteiro |
| Resultado primário e nominal do Governo Central (Banco Central) | 1991 | cobre o período inteiro |
| Transações correntes e balança comercial | 1995 | |
| PIB trimestral | 1996 | 1994 e 1995 só em séries anuais |
| Resultado do Tesouro Nacional (planilha) | jan/1997 | conferido na coleta; a planilha sai com cerca de 2 meses de atraso em relação ao Banco Central |
| Meta Selic | mar/1999 | antes disso, usar a Selic efetiva mensal (desde 1986) |
| Expectativas Focus | 1999 | indicadores fiscais podem começar depois **(confirmar)** |
| M1 a M4 e PMPP na metodologia atual | 2001 | séries antigas existem desde 1994, nomes a confirmar |
| DLSP (% PIB) | dez/2001 | |
| IBC-Br | 2003 | |
| DBGG na metodologia atual | dez/2006 | metodologia anterior disponível de 2001 a 2007 |

Cuidados adicionais:

1. **Resíduo da hiperinflação**: variações em 12 meses de 1994 e 1995 são tão altas que achatam o resto do gráfico. A visão padrão abre nos últimos 10 anos, com botão para o período completo.
2. **Mudanças de regime** marcadas nos gráficos como linhas verticais: câmbio flutuante e metas de inflação (1999), Lei de Responsabilidade Fiscal (2000), teto de gastos (2016), arcabouço fiscal (2023).
3. **Faixas de mandato presidencial** ao fundo, opcionais, para leitura do público leigo.
4. **Séries diárias longas** (câmbio, Selic): a coleta precisa pedir em blocos de anos por causa do limite do SGS, e depois só buscar o que é novo.
5. **Valores em R$ de 30 anos**: só fazem sentido deflacionados ou em % do PIB. O valor nominal vira opção secundária.

## 7. Estrutura do painel (rascunho)

1. **Visão geral**: 6 a 8 números com última leitura e variação (PIB 4 trimestres, IPCA 12 meses, Selic, câmbio, primário 12 meses % PIB, DBGG % PIB, M1 12 meses).
2. **Atividade**: PIB e decomposição C + I + G + NX.
3. **Moeda**: base monetária, M1 a M4, multiplicador, velocidade.
4. **Fiscal**: receitas, despesas, primário, nominal, realizado contra meta.
5. **Dívida**: DBGG, DLSP, perfil da DPF, simulador de dinâmica da dívida.
6. **Externo e preços**: balança, transações correntes, reservas, câmbio, IPCA, juros.

Cada página traz a fórmula no topo, com os valores do último período substituídos nos símbolos.

## 8. Proposta técnica

Decidido em 2026-11-18: página web pública para terceiros, desenvolvimento local, Docker em servidor remoto no futuro. Na mesma data, o Streamlit foi descartado: o painel é feito em casa, em JavaScript puro, sem frameworks nem bibliotecas de terceiros.

- **Painel**: site estático em HTML, CSS e JavaScript puro (módulos nativos do navegador, sem etapa de build, sem npm). Uma página por bloco da seção 7.
- **Gráficos**: módulo próprio que desenha em SVG. Precisa cobrir linha, barras empilhadas, eixo de datas, dica ao passar o mouse ou tocar, seleção de período, linhas verticais de mudança de regime e trecho tracejado para projeções. É a parte mais trabalhosa de fazer em casa.
- **Simulador de dívida**: roda inteiro no navegador, com a fórmula da seção 4.
- **Coleta**: script Python separado do site, só com a biblioteca padrão (`urllib`, `json`), que grava as observações em um banco SQLite (`data/economia.db`) e, ao fim de cada execução, exporta um arquivo JSON por série para `site/data/`, além de um `index.json` com nome, unidade e estado da última coleta de cada série. O site só lê esses arquivos e nunca chama as APIs durante uma visita. Assim o site continua no ar quando uma API do governo cai, e visitantes não geram chamadas externas.- **Sem servidor de aplicação**: como tudo que o visitante recebe é arquivo estático, basta um servidor de arquivos.
- **Catálogo de séries**: um único arquivo (código, fonte, nome, unidade, frequência, regra de agregação). Adicionar um indicador é adicionar uma linha.
- **Banco de dados**: SQLite, pelo módulo `sqlite3` da biblioteca padrão. Duas tabelas: `series` (catálogo e estado da última coleta) e `observations` (série, data, valor e quando o valor entrou ou foi revisado). O banco fica fora de `site/` e não é servido ao público; o navegador não lê SQLite sem biblioteca de terceiros, por isso a exportação para JSON.
- **Sem login**: os dados são públicos.

Atualização dos dados:

- **Uma coleta por dia, de madrugada** (horário de Brasília), cobrindo todas as fontes. Séries mensais e trimestrais são consultadas todo dia mesmo assim: a chamada é barata e dispensa manter um calendário de divulgações.
- Dados diários (câmbio, Selic) aparecem com um dia útil de atraso, o que é aceitável para um painel de monitoramento.
- **Coleta incremental**: histórico completo só na primeira execução; depois, apenas o período recente de cada série, com uma janela de alguns meses para capturar revisões.
- **Falha em uma fonte não derruba o resto**: cada série é gravada separadamente, e o arquivo anterior só é substituído quando a nova coleta termina com sucesso. O site continua mostrando o último dado bom.
- O site exibe a data da última coleta bem-sucedida de cada fonte, e o script registra em log o que falhou.
- No desenvolvimento local, o mesmo script roda manualmente. No servidor, o agendamento é feito pelo cron da máquina, que dispara o serviço `collector`.

Desenvolvimento local:

- Sem Docker e sem instalar nada: `python3 collector/collect.py` para coletar, `python3 -m unittest discover collector` para os testes da coleta, `node --test` para os testes das contas do site (só exige o Node instalado, sem pacotes) e `python3 -m http.server --directory site` para abrir o site no navegador.
- Estrutura do site: uma página HTML por bloco; `js/calc.js` (contas puras, testadas), `js/format.js` (formato brasileiro), `js/data.js` (leitura dos JSON), `js/chart.js` (gráficos) e um script por página em `js/pages/`.
- Cores das séries: paleta de 4 cores validada para daltonismo nos temas claro e escuro. Um quinto componente em um mesmo gráfico exige revalidar.
- Escrever desde o início de forma compatível com contêiner: caminhos do banco e da pasta de exportação por variável de ambiente (`DB_PATH`, `EXPORT_DIR`), nenhum caminho absoluto, endereços relativos no site.

Deploy futuro (Docker no servidor remoto):

- Dois serviços no `docker compose`: `web` (servidor de arquivos estáticos com HTTPS, Caddy) e `collector` (imagem Python, executado por agendamento).
- Dois volumes: o do banco (`data/`), visível só para o `collector`, e o da exportação (`site/data/`), em que o `collector` escreve e o `web` só lê.

Consequências de ser público:

- Cada gráfico mostra fonte, data de referência e data da coleta.
- Página "Sobre / Metodologia" com as fórmulas, as fontes e um aviso de que não é publicação oficial.
- Textos e rótulos escritos para quem não é economista: sigla sempre acompanhada do nome por extenso.
- Leitura em celular precisa funcionar.
- **Idioma**: só português (pt-BR) na primeira versão, com datas e números no formato brasileiro (`1.234,56`, `mar/2026`). Os textos da interface e os nomes das séries ficam concentrados no catálogo e em um arquivo de textos, não espalhados pelas páginas, para que uma tradução futura não exija reescrevê-las.

Custos conhecidos de fazer em casa:

- O módulo de gráficos substitui uma biblioteca pronta e soma cerca de 3 dias ao cronograma (seção 9), além de manutenção própria.
- A série histórica do Resultado do Tesouro Nacional só é publicada em planilha XLSX. Sem bibliotecas, a leitura é feita à mão (o XLSX é um ZIP com XML dentro; testado na etapa 0 e funciona, mas é frágil a mudanças de layout). Como a coleta usa só a biblioteca padrão, o leitor de XLSX também é próprio. Alternativa sem planilha: as séries de primário, nominal e juros do Banco Central (seção 5) cobrem os totais desde 1991; a planilha só é necessária para o detalhamento de receitas e despesas.
- Em troca, não há limite prático de visitantes: site estático não mantém sessão no servidor.

## 9. Etapas sugeridas

| Etapa | Entrega | Estimativa |
|---|---|---|
| 0 | Validar códigos das séries, a data de início de cada uma e baixar uma amostra de cada fonte. **Concluída em 2026-11-18**, com 5 itens "(confirmar)" restantes, nenhum bloqueante | meio dia |
| 1 | Coletor + catálogo + SQLite + exportação JSON para os blocos 3.1 e 3.2. **Concluída em 2026-11-18**: 56 séries, cerca de 27 mil observações, coleta completa em 1 minuto | 1 dia |
| 1b | Módulo de gráficos em SVG e esqueleto do site (navegação, layout, celular). **Concluída em 2026-11-18**: gráficos de linha e de barras empilhadas, seletor de período, dica por mouse, toque e teclado, tabela de dados, temas claro e escuro; páginas Visão geral e Atividade | 3 dias |
| 2 | Páginas de Atividade e Moeda. **Concluída em 2026-11-18**: 7 gráficos em Atividade e 4 em Moeda, com as identidades do PIB, da base monetária e do M1; catálogo com 60 séries. Ficou de fora a taxa de poupança (tabela 2072 do IBGE, ainda não coletada) | 1 dia |
| 3 | Bloco fiscal e dívida (dados do Tesouro são os mais trabalhosos). **Concluída em 2026-11-18**: páginas Fiscal (5 gráficos e 2 identidades) e Dívida (3 gráficos); leitor próprio da planilha do Tesouro; catálogo com 85 séries. Ficaram de fora a comparação com a meta fiscal e o custo médio da dívida | 2 a 3 dias |
| 4 | Visão geral, externo e preços. **Concluída em 2026-11-18**: páginas Externo (5 gráficos) e Preços e juros (3 gráficos); Visão geral com 8 números e a tabela de expectativas do Focus; catálogo com 98 séries | 1 dia |
| 5 | Simulador de dinâmica da dívida. **Concluída em 2026-11-18**: na página Dívida, com três controles (juro real, crescimento, primário), trajetória de 10 anos, primário que estabiliza a dívida e comparação com a expectativa do Focus | meio dia |
| 6 | Página de metodologia, revisão de textos e leitura em celular | 1 dia |
| 7 | Dockerfile, `docker compose`, agendamento da coleta e HTTPS no servidor | 1 dia |

As etapas 0 a 6 acontecem todas na máquina local. A etapa 7 só começa quando houver servidor.

## 10. Decisões

Resolvidas:

- **Público**: publicação para terceiros via página web (2026-11-18).
- **Linguagem e execução**: desenvolvimento local; Docker em servidor remoto no futuro (2026-11-18).
- **Tecnologia do site**: feito em casa, em HTML, CSS e JavaScript puro, sem frameworks nem bibliotecas; Streamlit descartado (2026-11-18).

- **Profundidade histórica**: desde o Plano Real, julho de 1994 (2026-11-18). Detalhes na seção 6.1.

- **Abrangência fiscal**: só Governo Central na primeira versão; DBGG e DLSP são os únicos números de recorte mais amplo (2026-11-18).

- **Projeções**: só expectativas do Focus e o simulador de dívida; sem PLOA (2026-11-18). Detalhes na seção 3.6.

- **Atualização**: coleta diária automática, de madrugada (2026-11-18). Detalhes na seção 8.

- **Idioma do site**: só português na primeira versão (2026-11-18).

- **Linguagem da coleta**: Python, só com a biblioteca padrão (2026-11-18).
- **Armazenamento**: banco SQLite, com exportação em JSON para o site (2026-11-18).
- **Fluxo de trabalho**: repositório privado no GitHub; cada feature em branch própria (2026-11-18).

Em aberto:

0. **Nome do site**: "Painel Macro Brasil" é provisório, escolhido só para preencher o cabeçalho.
1. **Servidor e domínio**: onde será hospedado e com qual endereço? Só bloqueia a etapa 7.

## 11. Fora do escopo (por enquanto)

- Detalhamento da execução orçamentária por órgão ou programa (Portal da Transparência, SIOP).
- Contas regionais e finanças de estados e municípios.
- Projeções do orçamento (PLOA, LDO) e modelos de previsão próprios.
- Comparações internacionais (FMI, OCDE).
- Versão do site em inglês.
