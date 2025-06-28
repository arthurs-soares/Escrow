# 🤖 Bot de Middleman para Discord

![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)![PagBank](https://img.shields.io/badge/PagBank-00A2A4?style=for-the-badge&logo=pagbank&logoColor=white)

## 📖 Sobre o Projeto

Este é um bot completo para Discord projetado para atuar como um **intermediário de segurança (Middleman / Escrow)** em transações financeiras entre usuários. Ele garante que o vendedor só receba o pagamento após o comprador confirmar o recebimento do produto ou serviço, trazendo segurança e confiança para negociações dentro do servidor.

O bot gerencia todo o fluxo da transação, desde a criação de um canal privado para a negociação até a automação do recebimento e do repasse de valores, utilizando a API do PagBank para processamento dos pagamentos.

## ✨ Funcionalidades Principais

-   **Criação de Tickets Privados:** Inicia um canal de texto privado para cada nova transação, convidando apenas o comprador, o vendedor e a staff.
-   **Definição de Papéis:** Interface com botões para que os usuários se identifiquem como "Comprador" ou "Vendedor".
-   **Fluxo Guiado:** Conduz a negociação passo a passo: confirmação de papéis, definição de valor, escolha do pagador da taxa, etc.
-   **Automação de Pagamentos via PagBank:**
    -   **Recebimento:** Gera um QR Code PIX via API do PagBank para o comprador realizar o pagamento de forma segura.
    -   **Confirmação Automática:** Utiliza um webhook para detectar pagamentos aprovados e notificar o ticket instantaneamente.
    -   **Repasse (Payout):** Transfere o valor para a chave PIX do vendedor de forma automática após a confirmação de entrega do comprador.
-   **Sistema de Taxa de Serviço:** Permite configurar uma taxa de serviço e definir quem irá arcar com ela (comprador ou vendedor).
-   **Logs de Transações:** Registra todas as transações concluídas ou com falha em um canal privado, facilitando a auditoria e o controle administrativo.
-   **Base de Dados:** Utiliza SQLite para persistir as informações de todos os tickets e transações.

## 🛠️ Tecnologias Utilizadas

-   **Backend:** Node.js
-   **Biblioteca Discord:** [Discord.js](https://discord.js.org/) v14
-   **Banco de Dados:** SQLite3
-   **Requisições HTTP:** Axios
-   **API de Pagamento:** [PagBank Connect](https://dev.pagbank.uol.com.br/)
-   **Servidor para Webhook:** Express.js (hospedado no Glitch)

## ⚙️ Configuração e Instalação

Para rodar este projeto, você precisará configurar dois componentes: o bot principal e o receptor de webhook.

### Pré-requisitos

-   [Node.js](https://nodejs.org/) (versão 16.9.0 ou superior)
-   Uma conta de desenvolvedor no [Portal de Desenvolvedores do Discord](https://discord.com/developers/applications)
-   Uma **conta PJ (com CNPJ/MEI)** no [PagBank](https://pagbank.uol.com.br/) com acesso de desenvolvedor aprovado.
-   Uma conta no [Glitch](https://glitch.com/) para hospedar o webhook.

### 1. Configurando o Bot Principal

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/seu-repositorio.git
    cd seu-repositorio
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto e preencha com suas credenciais. Utilize o arquivo `.env.example` como guia.

    ```env
    # Credenciais do Discord
    DISCORD_TOKEN="SEU_TOKEN_DO_DISCORD_AQUI"
    CLIENT_ID="ID_DO_CLIENTE_DO_SEU_BOT"
    GUILD_ID="ID_DO_SEU_SERVIDOR_DISCORD"

    # Configuração do Ambiente PagBank ('true' para Sandbox, 'false' para Produção)
    IS_SANDBOX="true"

    # Credenciais PagBank (preencha ambas)
    PAGBANK_SANDBOX_TOKEN="SEU_TOKEN_DO_SANDBOX_AQUI"
    PAGBANK_PRODUCTION_TOKEN="SEU_TOKEN_DE_PRODUÇÃO_AQUI"

    # URL do seu receptor de webhook no Glitch
    WEBHOOK_URL="https://seu-app-webhook.glitch.me/webhook"

    # ID do canal de Discord para logs de transações
    LOG_CHANNEL_ID="ID_DO_CANAL_DE_LOGS"
    ```

4.  **Inicie o bot:**
    ```bash
    node index.js
    ```

### 2. Configurando o Receptor de Webhook (no Glitch)

1.  Crie um novo projeto no Glitch a partir do template **`hello-express`**.
2.  Copie o código do arquivo `webhook/server.js` deste repositório para o `server.js` do seu projeto Glitch.
3.  No Glitch, configure o arquivo `.env` com as mesmas variáveis do bot principal.
4.  No painel de desenvolvedor do PagBank, configure a URL de notificação (webhook) para o URL do seu projeto Glitch (ex: `https://seu-app-webhook.glitch.me/webhook`), tanto no ambiente Sandbox quanto no de Produção.

## 🚀 Comandos

-   `/ticket`: Inicia um novo ticket de negociação.
-   `/setvalor <valor>`: (Apenas Vendedor) Define o valor do item/serviço.
-   `/setpix <chave_pix>`: (Apenas Vendedor) Define a chave PIX para recebimento do pagamento.
-   *(outros comandos que você tenha criado)*

## ⚠️ Importante

Este bot lida com transações financeiras. É crucial que as credenciais e tokens sejam mantidos em segurança no arquivo `.env` e nunca expostos no código ou em repositórios públicos. O uso de uma **conta PJ (MEI)** ou **conta PF (vendador)** é um requisito legal e técnico para a utilização das APIs de repasse do PagBank. 