const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setvalor')
        .setDescription('Define o valor da transação.')
        .addNumberOption(option =>
            option.setName('valor')
                .setDescription('O valor da transação (ex: 19.99)')
                .setRequired(true)),
    async execute(interaction) {
        const { channel, user, options } = interaction;
        const value = options.getNumber('valor');
        const ticketId = channel.id;

        db.get('SELECT * FROM tickets WHERE ticket_id = ? AND seller_id = ? AND status = ?', [ticketId, user.id, 'awaiting_value'], async (err, ticket) => {
            if (err) {
                console.error('Erro ao buscar ticket:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao processar a sua solicitação.', ephemeral: true });
            }

            if (!ticket) {
                return interaction.reply({ content: 'Você não pode definir o valor neste momento ou não é o vendedor.', ephemeral: true });
            }

            db.run('UPDATE tickets SET value = ?, status = ? WHERE ticket_id = ?', [value, 'awaiting_value_confirmation', ticketId], async (err) => {
                if (err) {
                    console.error('Erro ao atualizar valor no banco de dados:', err);
                    return interaction.reply({ content: 'Ocorreu um erro ao definir o valor.', ephemeral: true });
                }

                const confirmationEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('Confirmação de Valor')
                    .setDescription(`O vendedor definiu o valor da transação em **R$ ${value.toFixed(2).replace('.', ',')}**.\n\nAmbos devem confirmar para continuar.`)
                    .setFooter({ text: 'Bot de Middleman' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('confirm_value').setLabel('Confirmar Valor').setStyle(ButtonStyle.Success)
                    );

                await interaction.reply({ embeds: [confirmationEmbed], components: [row] });
            });
        });
    },
};
