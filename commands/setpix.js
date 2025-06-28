// commands/setpix.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js'); // Use '../' para voltar uma pasta

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setpix')
        .setDescription('Define ou atualiza sua chave PIX para receber o pagamento.')
        .addStringOption(option =>
            option.setName('chave_pix')
                .setDescription('Sua chave PIX (CPF, CNPJ, e-mail, celular ou chave aleatória).')
                .setRequired(true)),
    async execute(interaction) {
        const { channel, user, options } = interaction;
        const pixKey = options.getString('chave_pix');
        const ticketId = channel.id;

        // Adia a resposta para ter mais tempo de processar
        await interaction.deferReply({ ephemeral: true });

        db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId], async (err, ticket) => {
            if (err) {
                console.error("Erro ao buscar ticket para setpix:", err);
                return interaction.editReply({ content: 'Ocorreu um erro ao acessar o banco de dados.' });
            }

            // 1. Verifica se o canal é um ticket
            if (!ticket) {
                return interaction.editReply({ content: 'Este comando só pode ser usado dentro de um canal de ticket de transação.' });
            }

            // 2. Verifica se o usuário é o vendedor do ticket
            if (ticket.seller_id !== user.id) {
                return interaction.editReply({ content: 'Apenas o vendedor deste ticket pode definir a chave PIX.' });
            }

            // 3. Verifica se a transação já não foi concluída
            if (ticket.status === 'completed' || ticket.status === 'expired') {
                return interaction.editReply({ content: 'Esta transação já foi finalizada e a chave PIX não pode mais ser alterada.' });
            }

            // Se todas as verificações passaram, atualiza a chave PIX
            db.run('UPDATE tickets SET seller_pix_key = ? WHERE ticket_id = ?', [pixKey, ticketId], async (updateErr) => {
                if (updateErr) {
                    console.error("Erro ao atualizar a chave PIX:", updateErr);
                    return interaction.editReply({ content: 'Ocorreu um erro ao salvar sua chave PIX.' });
                }

                await interaction.editReply({ content: `✅ Sua chave PIX foi definida com sucesso para: \`${pixKey}\`` });
                
                // [BÔNUS] Se a chave foi definida após a confirmação de entrega, avança o processo
                // Isso acontece quando o bot diz "sua chave não está registrada"
                if (ticket.status === 'awaiting_delivery' && ticket.confirmed_users && ticket.confirmed_users.includes(ticket.buyer_id)) {
                    // Esta condição é um pouco complexa, vamos simplificar para a condição do seu código atual
                    // Se o comprador já confirmou a entrega, mas a chave pix não existia, agora podemos prosseguir.
                    // O seu código atualiza o status para 'awaiting_payout_confirmation' na função handleDelivery. 
                    // Se a chave não existia, o status não foi atualizado. Vamos simular essa etapa aqui.
                    db.run('UPDATE tickets SET status = ? WHERE ticket_id = ?', ['awaiting_payout_confirmation', ticketId]);

                    const payoutEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('🚚 Entrega Confirmada e PIX Registrado!')
                        .setDescription(`O comprador confirmou o recebimento e sua chave PIX foi registrada.\n\n**Vendedor (<@${ticket.seller_id}>)**, por favor, clique no botão abaixo para receber seu pagamento.`)
                        .addFields({ name: 'Chave PIX de Destino', value: `\`${pixKey}\`` })
                        .setFooter({ text: 'Bot de Middleman' });

                    const payoutRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('confirm_payout').setLabel('✅ Receber Pagamento').setStyle(ButtonStyle.Success)
                    );
                    
                    // Envia a mensagem no canal, pois a resposta ao comando já foi dada.
                    await channel.send({ embeds: [payoutEmbed], components: [payoutRow] });
                }
            });
        });
    },
};