# Painel Macro Brasil

Painel de acompanhamento das contas nacionais, da moeda e das contas públicas do governo federal brasileiro, com dados do IBGE, do Banco Central e do Tesouro Nacional. O nome é provisório.

O desenho, as decisões e as pendências estão em [PLANEJAMENTO.md](PLANEJAMENTO.md).

## Como funciona

- `collector/collect.py` busca as séries listadas em `collector/catalog.json`, grava em um banco SQLite e exporta um arquivo JSON por série.
- `site/` é um site estático em HTML, CSS e JavaScript puro, que lê esses arquivos JSON.
- Nada além da biblioteca padrão do Python e de um navegador é necessário.

## Rodar na sua máquina

```sh
python3 collector/collect.py                      # coleta tudo (cerca de 1 minuto)
python3 -m http.server 8765 --directory site      # abra http://127.0.0.1:8765
```

Para coletar só algumas séries: `python3 collector/collect.py m1 pib_corrente`.

## Testes

```sh
python3 -m unittest discover collector            # coleta
node --test                                       # contas e formatação do site
```

## Publicar em um servidor com Docker

1. Instale o Docker no servidor e clone este repositório.
2. Aponte o domínio para o servidor e libere as portas 80 e 443.
3. Crie o arquivo `.env` a partir do modelo e preencha o domínio:
   ```sh
   cp .env.example .env
   ```
4. Faça a primeira coleta e suba o site:
   ```sh
   docker compose --profile collect run --rm collector
   docker compose up -d
   ```
5. Agende a coleta diária no agendador do servidor (`crontab -e`), trocando o caminho:
   ```
   CRON_TZ=America/Sao_Paulo
   0 5 * * * cd /caminho/do/repositorio && docker compose --profile collect run --rm collector >> coleta.log 2>&1
   ```

Com `SITE_ADDRESS` preenchido no `.env`, o certificado HTTPS é obtido e renovado automaticamente. Sem ele, o site responde só em HTTP na porta 80.

## Atualizar o site publicado

```sh
git pull
docker compose up -d --build
```

Os dados coletados ficam em volumes do Docker e não são afetados pela atualização.

## Onde ficam os dados no servidor

| Volume | Conteúdo |
|---|---|
| `db` | Banco SQLite com todas as observações. Não é servido ao público. É o que vale guardar em backup; pode ser refeito com uma nova coleta completa. |
| `export` | Arquivos JSON lidos pelo site. São regerados a cada coleta. |
| `caddy_data` | Certificados HTTPS. |

## Acrescentar uma série

Inclua uma linha em `collector/catalog.json` e rode a coleta. A série passa a existir em `site/data/<id>.json` e aparece na tabela da página de metodologia.
