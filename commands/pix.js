// Importe InteractionResponseFlags e SlashCommandBuilder do discord.js
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pix')
        .setDescription('Gera um QR Code Pix para pagamento via Mercado Pago.')
        .addNumberOption(option =>
            option.setName('valor')
               .setDescription('O valor a ser cobrado (ex: 19.99)')
               .setRequired(true))
        .addStringOption(option =>
            option.setName('email')
               .setDescription('O email do pagador')
               .setRequired(true)),
    async execute(interaction) {
        // Usando MessageFlags.Ephemeral para respostas temporárias
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const amount = interaction.options.getNumber('valor');
        const payerEmail = interaction.options.getString('email');
        const userId = interaction.user.id;

        if (isNaN(amount) || amount <= 0) {
            return interaction.editReply({ content: 'Por favor, forneça um valor numérico válido e maior que zero.'});
        }

        try {
            const idempotencyKey = uuidv4();
            const expirationDate = new Date(Date.now() + 30 * 60 * 1000);

            const response = await axios.post(
                'https://api.mercadopago.com/v1/payments',
                {
                    transaction_amount: amount,
                    description: `Pagamento Pix solicitado por ${interaction.user.username}`,
                    payment_method_id: 'pix',
                    date_of_expiration: expirationDate.toISOString(),
                    payer: {
                        email: payerEmail,
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': idempotencyKey,
                    },
                }
            );

            const pixData = response.data.point_of_interaction.transaction_data;
            const qrCode = pixData.qr_code;
            const qrCodeBase64 = pixData.qr_code_base64;

            if (!qrCode || !qrCodeBase64) {
                return interaction.editReply({ content: 'Erro: Dados de QR Code não encontrados na resposta do Mercado Pago.' });
            }

            const qrCodeBuffer = Buffer.from(qrCodeBase64, 'base64');
            const attachment = new AttachmentBuilder(qrCodeBuffer, { name: 'pix_qrcode.png' });

            const pixEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Pagamento Pix')
                .setDescription(`Escaneie o QR Code abaixo ou use o código Copia e Cola.\n\n**Valor: R$ ${amount.toFixed(2).replace('.', ',')}**`)
                .setImage('attachment://pix_qrcode.png')
                .addFields(
                    { name: 'Pix Copia e Cola', value: `\`\`\`\n${qrCode}\n\`\`\`` }
                )
                .setFooter({ text: 'Powered by Mercado Pago' })
                .setTimestamp();
            
            // AVISO CORRIGIDO: Removendo 'ephemeral: false', pois a resposta não pode mudar de privada para pública
            await interaction.editReply({
                content: `<@${userId}>, seu pedido de pagamento Pix foi gerado!`,
                embeds: [pixEmbed],
                files: [attachment],
            });

        } catch (error) {
            console.error('Erro ao gerar Pix:', error.response ? error.response.data : error.message);
            let errorMessage = 'Ocorreu um erro ao gerar o pagamento Pix.';

            if (error.response && error.response.data && error.response.data.message) {
                errorMessage += `\n**Detalhes da API:** ${error.response.data.message}`;
            }

            await interaction.editReply({ content: errorMessage });
        }
    },
};
