Instale as dependências:
npm install


# Configure as Variáveis de Ambiente:
Crie um arquivo .env na raiz do projeto e preencha com suas credenciais. Utilize o arquivo .env.example como guia.

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

# Inicie o bot:

node index.js

# 2. Configurando o Receptor de Webhook (no Glitch)
Crie um novo projeto no Glitch a partir do template "hello-express".
Copie o código do arquivo webhook/server.js deste repositório para o server.js do seu projeto Glitch.
No Glitch, configure o arquivo .env com as mesmas variáveis do bot principal.
No painel de desenvolvedor do PagBank, configure a URL de notificação (webhook) para o URL do seu projeto Glitch (ex: https://seu-app-webhook.glitch.me/webhook), tanto no ambiente Sandbox quanto no de Produção.

# 🚀 Comandos
/iniciar-transacao: Inicia um novo ticket de negociação.
/setvalor <valor>: (Apenas Vendedor) Define o valor do item/serviço.
/setpix <chave_pix>: (Apenas Vendedor) Define a chave PIX para recebimento do pagamento.
(outros comandos que você tenha criado)

# ⚠️ Importante
Este bot lida com transações financeiras. É crucial que as credenciais e tokens sejam mantidos em segurança no arquivo .env e nunca expostos no código ou em repositórios públicos. O uso de uma conta PJ (MEI) é um requisito legal e técnico para a utilização das APIs de repasse do PagBank.