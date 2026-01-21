const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const http = require('http');
const { QuickDB } = require("quick.db");
const db = new QuickDB();
require('dotenv').config();

// Servidor HTTP para a Render
http.createServer((req, res) => {
    res.write("Bot Multi-Tools VIP Online!");
    res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers
    ]
});

const OWNER_ID = '1225647692458229860'; // <--- SEU ID
const LOG_CHANNEL_ID = ''; // <--- COLOQUE O ID DO CANAL DE LOGS SE QUISER

// Definição dos Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('addvip')
        .setDescription('👑 [DONO] Adiciona um usuário ao VIP.')
        .addUserOption(option => option.setName('usuario').setDescription('O usuário a ser adicionado').setRequired(true))
        .addIntegerOption(option => option.setName('dias').setDescription('Quantidade de dias (0 para permanente)').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('delvip')
        .setDescription('❌ [DONO] Remove um usuário do VIP.')
        .addUserOption(option => option.setName('usuario').setDescription('O usuário a ser removido').setRequired(true)),

    new SlashCommandBuilder()
        .setName('painel')
        .setDescription('📊 [DONO] Veja a lista de clientes VIP ativos.'),

    new SlashCommandBuilder()
        .setName('tools')
        .setDescription('🛠️ Abre a central de ferramentas VIP.'),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('📡 Verifica o status do bot e latência.'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🚀 Bot Multi-Tools logado como ${client.user.tag}!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos (/) registrados!');
    } catch (error) {
        console.error(error);
    }

    setInterval(async () => {
        const allVips = await db.get("vips") || {};
        const now = Date.now();
        let changed = false;
        for (const userId in allVips) {
            if (allVips[userId].expiresAt !== -1 && now > allVips[userId].expiresAt) {
                delete allVips[userId];
                changed = true;
            }
        }
        if (changed) await db.set("vips", allVips);
    }, 3600000);
});

async function sendLog(title, description, color = '#5865F2') {
    if (!LOG_CHANNEL_ID) return;
    const channel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(() => {});
    }
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, user, options } = interaction;

        if (['addvip', 'delvip', 'painel'].includes(commandName) && user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ Acesso negado.', ephemeral: true });
        }

        if (commandName === 'status') {
            const embed = new EmbedBuilder()
                .setTitle('📡 Status do Sistema')
                .addFields(
                    { name: 'Ping Bot', value: `\`${client.ws.ping}ms\``, inline: true },
                    { name: 'Uptime', value: `<t:${Math.floor(client.readyTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Servidores', value: `\`${client.guilds.cache.size}\``, inline: true }
                )
                .setColor('#00FF00');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'addvip') {
            const targetUser = options.getUser('usuario');
            const days = options.getInteger('dias');
            const expiresAt = days === 0 ? -1 : Date.now() + (days * 24 * 60 * 60 * 1000);
            
            await db.set(`vips.${targetUser.id}`, {
                id: targetUser.id,
                tag: targetUser.tag,
                addedAt: Date.now(),
                expiresAt: expiresAt
            });

            sendLog('👑 Novo VIP Adicionado', `**Usuário:** ${targetUser.tag}\n**Duração:** ${days === 0 ? 'Permanente' : days + ' dias'}\n**Por:** ${user.tag}`, '#00FF00');
            return interaction.reply({ content: `✅ **${targetUser.tag}** agora é VIP!`, ephemeral: false });
        }

        if (commandName === 'delvip') {
            const targetUser = options.getUser('usuario');
            await db.delete(`vips.${targetUser.id}`);
            sendLog('❌ VIP Removido', `**Usuário:** ${targetUser.tag}\n**Por:** ${user.tag}`, '#FF0000');
            return interaction.reply({ content: `✅ VIP de **${targetUser.tag}** removido.`, ephemeral: true });
        }

        if (commandName === 'painel') {
            const allVips = await db.get("vips") || {};
            const vipsList = Object.values(allVips);
            const embed = new EmbedBuilder()
                .setTitle('📊 Gestão de Clientes VIP')
                .setColor('#5865F2')
                .setThumbnail(client.user.displayAvatarURL());

            if (vipsList.length === 0) {
                embed.setDescription('Nenhum cliente ativo.');
            } else {
                let list = vipsList.map((v, i) => `**${i+1}.** \`${v.tag}\` - ${v.expiresAt === -1 ? '♾️' : `<t:${Math.floor(v.expiresAt/1000)}:R>`}`).join('\n');
                embed.setDescription(`**Total:** ${vipsList.length} clientes\n\n${list}`);
            }
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'tools') {
            const isVip = await db.get(`vips.${user.id}`);
            if (!isVip && user.id !== OWNER_ID) {
                return interaction.reply({ content: '❌ Você não possui VIP.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🛠️ Central de Ferramentas VIP')
                .setDescription('Escolha uma ferramenta abaixo para começar.')
                .addFields(
                    { name: '📂 Clonagem', value: 'Replique servidores.', inline: true },
                    { name: '🧹 Limpeza', value: 'Limpeza de DM.', inline: true },
                    { name: '🚀 Extras', value: 'Auto-Nick e DM All.', inline: true }
                )
                .setColor('#2F3136');

            const rowSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_tool')
                    .setPlaceholder('Selecione...')
                    .addOptions([
                        { label: 'Clonar (Via Conta)', value: 'tool_clone_self', emoji: '👤' },
                        { label: 'Clonar (Via Bot)', value: 'tool_clone_bot', emoji: '🤖' },
                        { label: 'Limpar Mensagens DM', value: 'tool_clear_dm', emoji: '🧹' },
                        { label: 'Auto-Nick', value: 'tool_autonick', emoji: '🏷️' },
                        { label: 'DM All', value: 'tool_dmall', emoji: '📢' },
                    ]),
            );

            await interaction.reply({ embeds: [embed], components: [rowSelect], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_tool') {
            const tool = interaction.values[0];
            if (tool.startsWith('tool_clone')) {
                const modal = new ModalBuilder().setCustomId(tool === 'tool_clone_self' ? 'modal_clone_self' : 'modal_clone_bot').setTitle('Configurar Clonagem');
                const rows = [
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('source').setLabel('ID do Servidor de ORIGEM').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('ID do Servidor de DESTINO').setStyle(TextInputStyle.Short).setRequired(true))
                ];
                if (tool === 'tool_clone_self') rows.unshift(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('token').setLabel('Token da Conta').setStyle(TextInputStyle.Short).setRequired(true)));
                modal.addComponents(rows);
                await interaction.showModal(modal);
            } else if (tool === 'tool_clear_dm') {
                const modal = new ModalBuilder().setCustomId('modal_clear_dm').setTitle('Limpeza de DM');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('token').setLabel('Token da Conta').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID do Canal da DM').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await interaction.showModal(modal);
            } else if (tool === 'tool_autonick') {
                const modal = new ModalBuilder().setCustomId('modal_autonick').setTitle('Auto-Nick VIP');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel('Novo Apelido').setStyle(TextInputStyle.Short).setRequired(true)));
                await interaction.showModal(modal);
            } else if (tool === 'tool_dmall') {
                const modal = new ModalBuilder().setCustomId('modal_dmall').setTitle('DM All VIP');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal);
            }
        }
    }

    if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        if (interaction.customId.startsWith('modal_clone')) {
            const sourceId = interaction.fields.getTextInputValue('source');
            const targetId = interaction.fields.getTextInputValue('target');
            const token = interaction.customId === 'modal_clone_self' ? interaction.fields.getTextInputValue('token') : null;
            
            await interaction.reply({ content: '🔍 Analisando servidores...', ephemeral: true });
            
            try {
                let sourceName, targetName;
                if (token) {
                    const self = new SelfClient({ checkUpdate: false });
                    await self.login(token);
                    const sourceGuild = await self.guilds.fetch(sourceId).catch(() => null);
                    sourceName = sourceGuild?.name;
                    self.destroy();
                } else {
                    const sourceGuild = await client.guilds.fetch(sourceId).catch(() => null);
                    sourceName = sourceGuild?.name;
                }
                const targetGuild = await client.guilds.fetch(targetId).catch(() => null);
                targetName = targetGuild?.name;

                if (!sourceName || !targetName) return interaction.followUp({ content: '❌ Servidor não encontrado.', ephemeral: true });

                globalCloneData[`key_${userId}`] = { sourceId, targetId, token, selections: {} };

                const embed = new EmbedBuilder()
                    .setTitle('⚙️ Personalizar Clonagem')
                    .setDescription(`**Origem:** ${sourceName}\n**Destino:** ${targetName}`)
                    .setColor('#5865F2');

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('opt_channels').setLabel('Canais').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('opt_roles').setLabel('Cargos').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('opt_emojis').setLabel('Emojis').setStyle(ButtonStyle.Secondary),
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('opt_info').setLabel('Nome/Ícone').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('confirm_clone').setLabel('INICIAR').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_clone').setLabel('CANCELAR').setStyle(ButtonStyle.Danger),
                );

                await interaction.followUp({ embeds: [embed], components: [row1, row2], ephemeral: true });
            } catch (e) { 
                await interaction.followUp({ content: '❌ Erro de conexão.', ephemeral: true }); 
            }
        }

        if (interaction.customId === 'modal_autonick') {
            const nick = interaction.fields.getTextInputValue('nickname');
            await interaction.reply({ content: `🏷️ Alterando apelidos...`, ephemeral: true });
            const members = await interaction.guild.members.fetch();
            let count = 0;
            for (const member of members.values()) {
                try { if (member.manageable) { await member.setNickname(nick); count++; } } catch (e) {}
            }
            await interaction.followUp({ content: `✅ Alterado em ${count} membros!`, ephemeral: true });
        }

        if (interaction.customId === 'modal_dmall') {
            const msg = interaction.fields.getTextInputValue('message');
            await interaction.reply({ content: '📢 Enviando mensagens...', ephemeral: true });
            const members = await interaction.guild.members.fetch();
            let count = 0;
            for (const member of members.values()) {
                if (member.user.bot) continue;
                try { await member.send(msg); count++; await new Promise(r => setTimeout(r, 1500)); } catch (e) {}
            }
            await interaction.followUp({ content: `✅ Enviado para ${count} membros!`, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const cloneKey = `key_${interaction.user.id}`;
        const data = globalCloneData[cloneKey];

        if (interaction.customId.startsWith('opt_')) {
            if (!data) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const option = interaction.customId.replace('opt_', '');
            data.selections[option] = !data.selections[option];
            const rows = interaction.message.components.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(button => {
                    if (button.data.custom_id === interaction.customId) button.setStyle(data.selections[option] ? ButtonStyle.Primary : ButtonStyle.Secondary);
                });
                return newRow;
            });
            return await interaction.update({ components: rows });
        }

        if (interaction.customId === 'confirm_clone') {
            if (!data) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            await interaction.update({ content: '🚀 Clonagem iniciada...', embeds: [], components: [] });
            
            try {
                const { sourceId, targetId, token, selections } = data;
                let sourceGuild;
                if (token) {
                    const self = new SelfClient({ checkUpdate: false });
                    await self.login(token);
                    sourceGuild = await self.guilds.fetch(sourceId);
                    await executeClone(sourceGuild, client.guilds.cache.get(targetId), selections);
                    self.destroy();
                } else {
                    sourceGuild = await client.guilds.fetch(sourceId);
                    await executeClone(sourceGuild, client.guilds.cache.get(targetId), selections);
                }
                sendLog('📂 Clonagem Realizada', `**Usuário:** ${interaction.user.tag}\n**Origem:** ${sourceId}\n**Destino:** ${targetId}`, '#5865F2');
                await interaction.followUp({ content: '✅ **Clonagem concluída!**', ephemeral: true });
            } catch (err) { 
                await interaction.followUp({ content: '❌ Erro na clonagem.', ephemeral: true }); 
            }
            delete globalCloneData[cloneKey];
        }

        if (interaction.customId === 'cancel_clone') {
            delete globalCloneData[cloneKey];
            await interaction.update({ content: '❌ Cancelado.', embeds: [], components: [] });
        }
    }
});

const globalCloneData = {};

async function executeClone(sourceGuild, targetGuild, opts) {
    if (opts.info) {
        await targetGuild.setName(sourceGuild.name).catch(() => {});
        if (sourceGuild.iconURL()) await targetGuild.setIcon(sourceGuild.iconURL()).catch(() => {});
    }
    if (opts.channels) {
        const channels = await targetGuild.channels.fetch();
        for (const c of channels.values()) await c.delete().catch(() => {});
    }
    const roleMap = new Map();
    if (opts.roles) {
        const roles = await targetGuild.roles.fetch();
        for (const r of roles.values()) if (r.editable && r.name !== '@everyone' && !r.managed) await r.delete().catch(() => {});
        const sRoles = Array.from((await sourceGuild.roles.fetch()).values()).sort((a, b) => a.position - b.position);
        for (const r of sRoles) {
            if (r.name === '@everyone') { await targetGuild.roles.everyone.setPermissions(r.permissions); roleMap.set(r.id, targetGuild.roles.everyone.id); }
            else if (!r.managed) { const nr = await targetGuild.roles.create({ name: r.name, color: r.color, permissions: r.permissions, hoist: r.hoist, mentionable: r.mentionable }); roleMap.set(r.id, nr.id); }
        }
    }
    if (opts.channels) {
        const sChannels = await sourceGuild.channels.fetch();
        const catMap = new Map();
        const cats = Array.from(sChannels.filter(c => c.type === ChannelType.GuildCategory || c.type === 'GUILD_CATEGORY').values()).sort((a, b) => a.position - b.position);
        for (const c of cats) { const nc = await targetGuild.channels.create({ name: c.name, type: ChannelType.GuildCategory, permissionOverwrites: c.permissionOverwrites.cache.map(o => ({ id: roleMap.get(o.id) || o.id, allow: o.allow, deny: o.deny, type: o.type })) }); catMap.set(c.id, nc.id); }
        const others = Array.from(sChannels.filter(c => c.type !== ChannelType.GuildCategory && c.type !== 'GUILD_CATEGORY').values()).sort((a, b) => a.position - b.position);
        for (const c of others) { if ([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, 'GUILD_TEXT', 'GUILD_VOICE'].includes(c.type)) { await targetGuild.channels.create({ name: c.name, type: c.type === 'GUILD_TEXT' ? ChannelType.GuildText : (c.type === 'GUILD_VOICE' ? ChannelType.GuildVoice : c.type), parent: catMap.get(c.parentId), permissionOverwrites: c.permissionOverwrites.cache.map(o => ({ id: roleMap.get(o.id) || o.id, allow: o.allow, deny: o.deny, type: o.type })) }); } }
    }
    if (opts.emojis) {
        const sEmojis = await sourceGuild.emojis.fetch();
        for (const e of sEmojis.values()) await targetGuild.emojis.create({ attachment: e.url, name: e.name }).catch(() => {});
    }
}

client.login(process.env.TOKEN);
