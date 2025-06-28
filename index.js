const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const db = require('./database.js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const IS_SANDBOX = process.env.IS_SANDBOX === 'true';

const PAGBANK_TOKEN = IS_SANDBOX 
    ? process.env.PAGBANK_SANDBOX_TOKEN 
    : process.env.PAGBANK_PRODUCTION_TOKEN;

const PAGBANK_BASE_URL = IS_SANDBOX 
    ? 'https://sandbox.api.pagseguro.com' 
    : 'https://api.pagseguro.com';

console.log(`--- BOT INICIADO EM MODO ${IS_SANDBOX ? 'SANDBOX' : 'PRODUÇÃO'} ---`);

// --- SUGESTÃO: Mova a taxa para uma constante no topo para fácil manutenção ---
const SERVICE_FEE = 5.00;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once('ready', () => {
    console.log('Bot está online!');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        const { customId, user, channel } = interaction;
        const ticketId = channel.id;

        db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId], async (err, ticket) => {
            if (err) {
                console.error('Erro ao buscar ticket:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao processar a sua solicitação.', ephemeral: true });
            }

            if (!ticket) {
                return; // Não responder se não for um ticket, para evitar poluir o chat.
            }

            const { creator_id, other_user_id } = ticket;
            if (user.id !== creator_id && user.id !== other_user_id) {
                return interaction.reply({ content: 'Você não tem permissão para interagir com este ticket.', ephemeral: true });
            }
            
            // Roteamento dos botões para as funções handler
            const handlers = {
                'role_': handleRoleSelection,
                'confirm_roles': handleRoleConfirmation,
                'confirm_value': handleValueConfirmation,
                'fee_': handleFeePayerSelection,
                'final_confirm': handleFinalConfirmation,
                'confirm_delivery': handleDeliveryConfirmation,
                'confirm_payout': handlePayout,
            };

            for (const prefix in handlers) {
                if (customId.startsWith(prefix)) {
                    await handlers[prefix](interaction, ticket);
                    return;
                }
            }
        });
    }
});

async function sendLog(logData) {
    // Pega o ID do canal das variáveis de ambiente
    const logChannelId = process.env.LOG_CHANNEL_ID;

    // Se o ID do canal não foi configurado, apenas loga no console e para.
    if (!logChannelId) {
        console.log("LOG_CHANNEL_ID não configurado. Log para o console:", logData);
        return;
    }

    try {
        // Busca o canal no Discord
        const channel = await client.channels.fetch(logChannelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Canal de log com ID ${logChannelId} não encontrado ou não é um canal de texto.`);
            return;
        }

        // Monta o embed do log
        const logEmbed = new EmbedBuilder()
            .setColor(logData.color || 0x808080) // Cor cinza por padrão
            .setTitle(logData.title)
            .setTimestamp();

        // Adiciona os campos de detalhes
        if (logData.fields) {
            logEmbed.addFields(logData.fields);
        }

        // Adiciona descrição se houver
        if(logData.description) {
            logEmbed.setDescription(logData.description);
        }
        
        // Envia o embed para o canal de logs
        await channel.send({ embeds: [logEmbed] });

    } catch (error) {
        console.error("Falha ao enviar log para o Discord:", error);
    }
}

async function handleRoleSelection(interaction, ticket) {
    const { customId, user, channel } = interaction;
    const role = customId.split('_')[1];

    if (role === 'reset') {
        db.run('UPDATE tickets SET buyer_id = NULL, seller_id = NULL WHERE ticket_id = ?', [ticket.ticket_id], (err) => {
            if (err) {
                console.error('Erro ao resetar papéis no banco de dados:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao resetar os papéis.', ephemeral: true });
            }
            return interaction.reply({ content: '♻️ Seleção de papéis foi resetada.', ephemeral: true });
        });
        return;
    }

    const roleToSet = role === 'buyer' ? 'buyer_id' : 'seller_id';
    const otherRole = role === 'buyer' ? 'seller_id' : 'buyer_id';

    // Usando uma transação para garantir a atomicidade
    db.serialize(() => {
        db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], (err, currentTicket) => {
            if (err) {
                console.error('Erro ao buscar ticket para seleção de papel:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao processar sua seleção.', ephemeral: true });
            }

            // Verifica se o usuário já escolheu o outro papel
            if (currentTicket[otherRole] === user.id) {
                return interaction.reply({ content: 'Você já escolheu o outro papel.', ephemeral: true });
            }

            // Verifica se o outro usuário já escolheu este papel
            if (currentTicket[roleToSet] && currentTicket[roleToSet] !== user.id) {
                return interaction.reply({ content: 'O outro usuário já selecionou este papel.', ephemeral: true });
            }
            
            // Verifica se o usuário já escolheu este papel
            if (currentTicket[roleToSet] === user.id) {
                return interaction.reply({ content: `Você já selecionou o papel de ${role}.`, ephemeral: true });
            }

            const query = `UPDATE tickets SET ${roleToSet} = ? WHERE ticket_id = ?`;
            db.run(query, [user.id, ticket.ticket_id], function(err) {
                if (err) {
                    console.error('Erro ao atualizar papel no banco de dados:', err);
                    return interaction.reply({ content: 'Ocorreu um erro ao salvar sua escolha.', ephemeral: true });
                }

                interaction.reply({ content: `✅ Você escolheu ser ${role === 'buyer' ? 'Comprador' : 'Vendedor'}.`, ephemeral: true });
                
                // Verifica se ambos os papéis foram definidos
                db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], (err, updatedTicket) => {
                    if (updatedTicket.buyer_id && updatedTicket.seller_id) {
                        sendConfirmationEmbed(channel, updatedTicket);
                    }
                });
            });
        });
    });
}

async function sendConfirmationEmbed(channel, ticket) {
    db.run('UPDATE tickets SET status = ? WHERE ticket_id = ?', ['awaiting_confirmation', ticket.ticket_id], async (err) => {
        if (err) {
            console.error('Erro ao atualizar status do ticket para awaiting_confirmation:', err);
            return;
        }

        const confirmationEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Confirmação de Papéis')
            .setDescription(`Papéis definidos:\n\n**Comprador:** <@${ticket.buyer_id}>\n**Vendedor:** <@${ticket.seller_id}>\n\nAmbos devem confirmar para continuar.`)
            .setFooter({ text: 'Bot de Middleman' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('confirm_roles').setLabel('✅ Confirmar').setStyle(ButtonStyle.Success)
            );

        await channel.send({ embeds: [confirmationEmbed], components: [row] });
    });
}

async function handleRoleConfirmation(interaction, ticket) {
    const { channel, user } = interaction;

    db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], (err, currentTicket) => {
        if (err) {
            console.error('Erro ao buscar ticket para confirmação:', err);
            return interaction.reply({ content: 'Ocorreu um erro.', ephemeral: true });
        }

        // Usa a nova coluna `confirmed_users`
        let confirmedUsers = currentTicket.confirmed_users ? currentTicket.confirmed_users.split(',') : [];

        if (confirmedUsers.includes(user.id)) {
            return interaction.reply({ content: 'Você já confirmou.', ephemeral: true });
        }

        confirmedUsers.push(user.id);

        db.run('UPDATE tickets SET confirmed_users = ? WHERE ticket_id = ?', [confirmedUsers.join(','), ticket.ticket_id], async (err) => {
            if (err) {
                console.error('Erro ao salvar confirmação:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao salvar sua confirmação.', ephemeral: true });
            }

            await interaction.reply({ content: 'Você confirmou os papéis. Aguardando o outro usuário...', ephemeral: true });
            
            // Verifica se o comprador e o vendedor confirmaram
            if (confirmedUsers.includes(currentTicket.buyer_id) && confirmedUsers.includes(currentTicket.seller_id)) {
                // Limpa confirmed_users para a próxima etapa e atualiza o status
                db.run('UPDATE tickets SET status = ?, confirmed_users = NULL WHERE ticket_id = ?', ['awaiting_value', ticket.ticket_id], async (err) => {
                    if (err) {
                        console.error('Erro ao atualizar status do ticket:', err);
                        return channel.send('Ocorreu um erro ao confirmar os papéis.');
                    }
                    
                    // Desabilita os botões na mensagem de confirmação de papéis
                    const confirmationMessage = await channel.messages.fetch(interaction.message.id);
                    const disabledConfirmationRow = new ActionRowBuilder().addComponents(
                        ButtonBuilder.from(confirmationMessage.components[0].components[0]).setDisabled(true)
                    );
                    await confirmationMessage.edit({ components: [disabledConfirmationRow] });

                    // Desabilita os botões na mensagem inicial de seleção de papéis
                    if (currentTicket.message_id) {
                        try {
                            const initialMessage = await channel.messages.fetch(currentTicket.message_id);
                            const disabledInitialRow = new ActionRowBuilder().addComponents(
                                ButtonBuilder.from(initialMessage.components[0].components[0]).setDisabled(true),
                                ButtonBuilder.from(initialMessage.components[0].components[1]).setDisabled(true),
                                ButtonBuilder.from(initialMessage.components[0].components[2]).setDisabled(true)
                            );
                            await initialMessage.edit({ components: [disabledInitialRow] });
                        } catch (error) {
                            console.error("Não foi possível encontrar ou editar a mensagem de seleção de papéis:", error);
                        }
                    }

                    const valueEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Definir Valor')
                        .setDescription(`Papéis confirmados! Vendedor, por favor, use o comando \`/setvalor <valor>\` para definir o valor da transação.`)
                        .setFooter({ text: 'Bot de Middleman' });

                    await channel.send({ embeds: [valueEmbed] });
                });
            }
        });
    });
}

async function handleValueConfirmation(interaction, ticket) {
    const { channel, user } = interaction;

    db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], (err, currentTicket) => {
        if (err) {
            console.error('Erro ao buscar ticket para confirmação de valor:', err);
            return interaction.reply({ content: 'Ocorreu um erro.', ephemeral: true });
        }

        let confirmedUsers = currentTicket.confirmed_users ? currentTicket.confirmed_users.split(',') : [];
        if (confirmedUsers.includes(user.id)) {
            return interaction.reply({ content: 'Você já confirmou o valor.', ephemeral: true });
        }
        confirmedUsers.push(user.id);

        db.run('UPDATE tickets SET confirmed_users = ? WHERE ticket_id = ?', [confirmedUsers.join(','), ticket.ticket_id], async (err) => {
            if (err) {
                console.error('Erro ao salvar confirmação de valor:', err);
                return interaction.reply({ content: 'Ocorreu um erro ao salvar sua confirmação.', ephemeral: true });
            }

            await interaction.reply({ content: 'Você confirmou o valor. Aguardando o outro usuário...', ephemeral: true });

            if (confirmedUsers.length === 2) {
                const originalMessage = await channel.messages.fetch(interaction.message.id);
                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true)
                );
                await originalMessage.edit({ components: [disabledRow] });

                db.run('UPDATE tickets SET status = ?, confirmed_users = NULL WHERE ticket_id = ?', ['awaiting_fee_payer', ticket.ticket_id], async (err) => {
                    if (err) {
                        console.error('Erro ao atualizar status do ticket:', err);
                        return channel.send('Ocorreu um erro ao confirmar o valor.');
                    }

                    const feeEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('Taxa de Serviço')
                        .setDescription(`Valor confirmado! Agora, por favor, decidam quem pagará a taxa de R$ 5,00.`)
                        .addFields(
                            { name: 'Valor', value: `R$ ${ticket.value.toFixed(2).replace('.', ',')}` },
                            { name: 'Taxa', value: 'R$ 5,00' }
                        )
                        .setFooter({ text: 'Bot de Middleman' });

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId('fee_buyer').setLabel('Comprador Paga').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('fee_seller').setLabel('Vendedor Paga').setStyle(ButtonStyle.Primary)
                        );

                    await channel.send({ embeds: [feeEmbed], components: [row] });
                });
            }
        });
    });
}

async function handleFeePayerSelection(interaction, ticket) {
    const { customId, channel } = interaction;
    const feePayer = customId.split('_')[1];

    db.run('UPDATE tickets SET fee_payer = ?, status = ? WHERE ticket_id = ?', [feePayer, 'awaiting_final_confirmation', ticket.ticket_id], async (err) => {
        if (err) {
            console.error('Erro ao atualizar pagador da taxa no banco de dados:', err);
            return channel.send('Ocorreu um erro ao definir o pagador da taxa.');
        }

        const originalMessage = await channel.messages.fetch(interaction.message.id);
        const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true),
            ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true)
        );
        await originalMessage.edit({ components: [disabledRow] });
        
        await interaction.reply({ content: `O pagador da taxa foi definido como o ${feePayer === 'buyer' ? 'Comprador' : 'Vendedor'}.`, ephemeral: false });

    const fee = SERVICE_FEE;
    const itemValue = ticket.value;
    const totalPaidByBuyer = feePayer === 'buyer' ? itemValue + fee : itemValue;
    const totalReceivedBySeller = feePayer === 'seller' ? itemValue - fee : itemValue;

    const finalConfirmationEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Confirmação Final da Transação')
        .setDescription('Por favor, revisem todos os detalhes abaixo. Ambos devem confirmar para gerar o pagamento.')
        .addFields(
            { name: 'Comprador', value: `<@${ticket.buyer_id}>`, inline: true },
            { name: 'Vendedor', value: `<@${ticket.seller_id}>`, inline: true },
            { name: '\u200B', value: '\u200B' }, // Espaço em branco
            { name: 'Valor do Item', value: `R$ ${itemValue.toFixed(2).replace('.', ',')}` },
            { name: 'Pagador da Taxa de Serviço', value: `${feePayer === 'buyer' ? 'Comprador' : 'Vendedor'} (R$ ${fee.toFixed(2).replace('.', ',')})` },
            { name: '➡️ Total a ser PAGO pelo Comprador', value: `**R$ ${totalPaidByBuyer.toFixed(2).replace('.', ',')}**` },
            { name: '⬅️ Total a ser RECEBIDO pelo Vendedor', value: `**R$ ${totalReceivedBySeller.toFixed(2).replace('.', ',')}**` }
        )
        .setFooter({ text: 'Bot de Middleman' });
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('final_confirm').setLabel('Confirmar e Gerar Pagamento').setStyle(ButtonStyle.Success)
            );

        await channel.send({ embeds: [finalConfirmationEmbed], components: [row] });
    });
}

async function handleFinalConfirmation(interaction, ticket) {
    const { channel, user } = interaction;

    db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], async (err, currentTicket) => {
        if (err || !currentTicket) {
            console.error('Erro ao buscar ticket para confirmação final:', err);
            return interaction.reply({ content: 'Ocorreu um erro ao encontrar o ticket.', ephemeral: true });
        }

        let confirmedUsers = currentTicket.confirmed_users ? currentTicket.confirmed_users.split(',') : [];

        if (confirmedUsers.includes(user.id)) {
            return interaction.reply({ content: 'Você já confirmou. Aguardando o outro usuário.', ephemeral: true });
        }

        confirmedUsers.push(user.id);
        db.run('UPDATE tickets SET confirmed_users = ? WHERE ticket_id = ?', [confirmedUsers.join(','), ticket.ticket_id]);
        
        if (confirmedUsers.includes(currentTicket.buyer_id) && confirmedUsers.includes(currentTicket.seller_id)) {
            
            await interaction.deferUpdate(); 
            
            const finalConfirmMessage = await channel.messages.fetch(interaction.message.id);
            const disabledButton = ButtonBuilder.from(finalConfirmMessage.components[0].components[0]).setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
            await finalConfirmMessage.edit({ components: [disabledRow] });

            let totalAmountToPay = (currentTicket.fee_payer === 'buyer') 
                ? currentTicket.value + SERVICE_FEE 
                : currentTicket.value;

            try {
                const buyerUser = await client.users.fetch(currentTicket.buyer_id);
                const amountInCents = Math.round(totalAmountToPay * 100);
                const expirationDate = new Date();
                expirationDate.setMinutes(expirationDate.getMinutes() + 60);
                const transactionReference = `TICKET-${ticket.ticket_id}`;

                const orderData = {
                    reference_id: transactionReference,
                    customer: {
                        name: buyerUser.username,
                        email: `buyer.${buyerUser.id}@meubot.com`,
                        tax_id: "48388396005"
                    },
                    items: [{
                        name: `Transação Middleman - ${transactionReference}`,
                        quantity: 1,
                        unit_amount: amountInCents
                    }],
                    qr_codes: [{
                        amount: {
                            value: amountInCents
                        },
                        expiration_date: expirationDate.toISOString()
                    }],
                };

                if (process.env.WEBHOOK_URL) {
                    orderData.notification_urls = [process.env.WEBHOOK_URL];
                }

                const response = await axios.post(
                    `${PAGBANK_BASE_URL}/orders`,
                    orderData,
                    {
                        headers: {
                            'Authorization': `Bearer ${PAGBANK_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                const pixData = response.data.qr_codes[0];
                const qrCodeLink = pixData.links.find(link => link.media === 'image/png').href;
                const pixCopyPaste = pixData.text;

                db.run('UPDATE tickets SET status = ?, payment_id = ? WHERE ticket_id = ?', ['awaiting_payment', response.data.id, ticket.ticket_id]);
                
                const qrImageResponse = await axios.get(qrCodeLink, { responseType: 'arraybuffer' });
                const qrImageBuffer = Buffer.from(qrImageResponse.data, 'binary');
                const attachment = new AttachmentBuilder(qrImageBuffer, { name: 'qrcode.png' });

                const pixEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('Pagamento PIX Gerado (PagBank)')
                    .setDescription(`Escaneie o QR Code ou use o código Copia e Cola para pagar.\n\n**Valor Total: R$ ${totalAmountToPay.toFixed(2).replace('.', ',')}**`)
                    .setImage('attachment://qrcode.png')
                    // --- MUDANÇA AQUI ---
                    .addFields(
                        { name: 'ID da Transação', value: `\`${transactionReference}\`` },
                        { name: 'Pix Copia e Cola', value: `\`\`\`${pixCopyPaste}\`\`\`` }
                    )
                    .setFooter({ text: 'Powered by PagBank Sandbox' });

                await channel.send({ 
                    content: `Pagamento solicitado para <@${currentTicket.buyer_id}>.`, 
                    embeds: [pixEmbed],
                    files: [attachment]
                });

            } catch (error) {
                console.error('Erro ao gerar PIX PagBank (/orders):', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
                await channel.send('Ocorreu um erro ao gerar o pagamento. Verifique os dados e tente novamente.');
            }
        } else {
            await interaction.reply({ content: '✅ Sua confirmação foi registrada! Aguardando o outro usuário.', ephemeral: true });
        }
    }); // <-- ESTE É O FECHAMENTO DO db.get QUE ESTAVA FALTANDO
}


async function handleDeliveryConfirmation(interaction, ticket) {
    const { user, channel } = interaction;

    if (user.id !== ticket.buyer_id) {
        return interaction.reply({ content: 'Apenas o comprador pode confirmar a entrega do item.', ephemeral: true });
    }

    await interaction.deferUpdate();

    try {
        // Recarrega o ticket do DB para pegar a chave PIX mais recente, caso o vendedor tenha acabado de usar /setpix
        db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticket.ticket_id], async (err, currentTicket) => {
            if (err || !currentTicket) {
                return channel.send('Ocorreu um erro ao buscar os dados da transação.');
            }

            if (!currentTicket.seller_pix_key) {
                // Mensagem com o nome do comando correto
                await channel.send({ 
                    content: `🚨 **Atenção <@${currentTicket.seller_id}>!** A entrega foi confirmada, mas sua chave PIX não está registrada. Por favor, use o comando \`/setpix <sua_chave_pix>\` para que o pagamento possa ser processado.`,
                });
                return;
            }

            db.run('UPDATE tickets SET status = ? WHERE ticket_id = ?', ['awaiting_payout_confirmation', currentTicket.ticket_id], async (updateErr) => {
                if (updateErr) {
                    console.error('Erro ao atualizar status para awaiting_payout_confirmation:', updateErr);
                    return channel.send('Ocorreu um erro interno ao processar a confirmação. Por favor, contate um administrador.');
                }

                const originalMessage = interaction.message;
                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true)
                );
                await originalMessage.edit({ components: [disabledRow] });
                
                const payoutEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🚚 Entrega Confirmada!')
                    .setDescription(`O comprador confirmou o recebimento do item.\n\n**Vendedor (<@${currentTicket.seller_id}>)**, por favor, clique no botão abaixo para receber seu pagamento.`)
                    .addFields({ name: 'Chave PIX de Destino', value: `\`${currentTicket.seller_pix_key}\`` })
                    .setFooter({ text: 'Bot de Middleman' });

                const payoutRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_payout').setLabel('✅ Receber Pagamento').setStyle(ButtonStyle.Success)
                );

                await channel.send({ embeds: [payoutEmbed], components: [payoutRow] });
            });
        });

    } catch (error) {
        console.error("Erro em handleDeliveryConfirmation:", error);
        await channel.send('Ocorreu um erro crítico durante a confirmação de entrega. Contate um administrador.');
    }
}

// no seu arquivo index.js principal
async function handlePayout(interaction, ticket) {
    const { user, channel } = interaction;

    // --- Validações iniciais (estão corretas) ---
    if (user.id !== ticket.seller_id) {
        return interaction.reply({ content: 'Apenas o vendedor pode solicitar o recebimento do pagamento.', ephemeral: true });
    }
    if (ticket.status !== 'awaiting_payout_confirmation') {
        return interaction.reply({ content: 'Você não pode realizar esta ação neste momento.', ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: 'Processando seu pagamento... Por favor, aguarde.' });
    await interaction.message.edit({ components: [] }); 

    let payoutAmount;
    if (ticket.fee_payer === 'seller') {
        payoutAmount = ticket.value - SERVICE_FEE;
    } else {
        payoutAmount = ticket.value;
    }
    
    if (payoutAmount <= 0) {
        await channel.send(`Erro: O valor final do repasse (R$ ${payoutAmount.toFixed(2)}) é inválido.`);
        await interaction.editReply({ content: 'Falha na transação. O valor do repasse é inválido.' });
        return;
    }

    try {
        // CORREÇÃO: Definindo o transferData
        const amountInCents = Math.round(payoutAmount * 100);
        const transferData = {
            amount: {
                value: amountInCents,
                currency: "BRL"
            },
            type: "PIX",
            account: {
                pix: {
                    key: ticket.seller_pix_key, // A chave PIX que o vendedor cadastrou
                }
            }
        };

        await axios.post(
            `${PAGBANK_BASE_URL}/transfers`,
            transferData,
            {
                headers: {
                    'Authorization': `Bearer ${PAGBANK_TOKEN}`,
                    'Content-Type': 'application/json',
                    'x-idempotency-key': uuidv4()
                }
            }
        );

        db.run('UPDATE tickets SET status = ? WHERE ticket_id = ?', ['completed', ticket.ticket_id]);
        
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Transação Concluída com Sucesso!')
            .setDescription(`O pagamento de **R$ ${payoutAmount.toFixed(2).replace('.', ',')}** foi enviado para o vendedor. Obrigado por usar nosso serviço! Este canal será excluído em 10 minutos.`)
            .setFooter({ text: 'Bot de Middleman' });

        await channel.send({ embeds: [successEmbed] });
        await interaction.editReply({ content: 'Pagamento enviado com sucesso!' });

        // Chamada de log para sucesso
        await sendLog({
            color: 0x00FF00,
            title: '✅ Transação Concluída',
            fields: [
                { name: 'Ticket ID', value: `\`${ticket.ticket_id}\``, inline: true },
                { name: 'Canal', value: `<#${ticket.ticket_id}>`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: 'Comprador', value: `<@${ticket.buyer_id}>`, inline: true },
                { name: 'Vendedor', value: `<@${ticket.seller_id}>`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: 'Valor do Item', value: `R$ ${ticket.value.toFixed(2).replace('.', ',')}`, inline: true },
                { name: 'Taxa Paga Por', value: ticket.fee_payer === 'buyer' ? 'Comprador' : 'Vendedor', inline: true },
                { name: 'Valor Repassado', value: `**R$ ${payoutAmount.toFixed(2).replace('.', ',')}**`, inline: true }
            ]
        });

        setTimeout(() => channel.delete().catch(console.error), 10 * 60 * 1000);

    } catch (error) {
        let errorMessage = error.message;
        if (error.response && error.response.data) {
            console.error('Erro ao processar payout:', JSON.stringify(error.response.data, null, 2));
            errorMessage = error.response.data.message || errorMessage;
        } else {
             console.error('Erro ao processar payout:', error.message);
        }

        await channel.send('❌ Ocorreu um erro crítico ao tentar enviar o pagamento para o vendedor. Por favor, contate um administrador imediatamente para resolver o repasse manualmente.');
        await interaction.editReply({ content: 'Falha ao enviar o pagamento. Contate um administrador.' });

        // Chamada de log para falha
        await sendLog({
            color: 0xFF0000,
            title: '❌ FALHA CRÍTICA no Repasse',
            description: `Ocorreu um erro ao tentar enviar o pagamento para o vendedor. **É necessária intervenção manual!**`,
            fields: [
                { name: 'Ticket ID', value: `\`${ticket.ticket_id}\``, inline: true },
                { name: 'Canal', value: `<#${ticket.ticket_id}>`, inline: true },
                { name: '\u200B', value: '\u200B' },
                { name: 'Vendedor (a ser pago)', value: `<@${ticket.seller_id}>`, inline: true },
                { name: 'Valor a ser Repassado', value: `**R$ ${payoutAmount.toFixed(2).replace('.', ',')}**`, inline: true },
                { name: 'Erro da API', value: `\`\`\`${errorMessage}\`\`\`` }
            ]
        });
    }
}

client.login(process.env.DISCORD_TOKEN);
