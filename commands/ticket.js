const { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Cria um novo ticket de transação.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('O outro usuário envolvido na transação.')
                .setRequired(true)),
    async execute(interaction) {
        const creator = interaction.user;
        const otherUser = interaction.options.getUser('user');
        const staffRoleId = '1388306963498143804';

        if (creator.id === otherUser.id) {
            return interaction.reply({ content: 'Você não pode criar um ticket com você mesmo.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }); // Defer the reply immediately

        const channel = await interaction.guild.channels.create({
            name: `ticket-${creator.username}-${otherUser.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: creator.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
                {
                    id: otherUser.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
                {
                    id: staffRoleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
                },
            ],
        });

        const initialEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('⚡ Definam seus papéis')
            .setDescription('Escolha seu papel abaixo:')
            .setFooter({ text: 'Bot de Middleman' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('role_buyer')
                    .setLabel('Sou Comprador')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('role_seller')
                    .setLabel('Sou Vendedor')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('role_reset')
                    .setLabel('Resetar Seleção')
                    .setStyle(ButtonStyle.Danger),
            );

        const message = await channel.send({ embeds: [initialEmbed], components: [row] });

        db.run(
            'INSERT INTO tickets (ticket_id, status, creator_id, other_user_id, message_id) VALUES (?, ?, ?, ?, ?)',
            [channel.id, 'awaiting_roles', creator.id, otherUser.id, message.id],
            (err) => {
                if (err) {
                    console.error('Erro ao inserir ticket no banco de dados:', err);
                    return interaction.editReply({ content: 'Ocorreu um erro ao criar o ticket.' }); // Use editReply
                }
                interaction.editReply({ content: `Ticket criado em ${channel}` }); // Use editReply
            }
        );
    },
};
