const { REST, Routes, SlashCommandBuilder, EmbedBuilder, Colors, ActivityType } = require("discord.js");
const prettyMilliseconds = require("pretty-ms");

module.exports = function(client, shoukaku, queue, playedTracks, playTrack, ranc, guildData, saveGuildData, PREFIX) {

    const commands = [
        new SlashCommandBuilder().setName("play").setDescription("Play a song").addStringOption(o => o.setName("query").setDescription("Song name or URL").setRequired(true)),
        new SlashCommandBuilder().setName("search").setDescription("Search and pick a track").addStringOption(o => o.setName("query").setDescription("Search query").setRequired(true)),
        new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
        new SlashCommandBuilder().setName("pause").setDescription("Pause the current track"),
        new SlashCommandBuilder().setName("resume").setDescription("Resume the current track"),
        new SlashCommandBuilder().setName("stop").setDescription("Stop music and clear queue"),
        new SlashCommandBuilder().setName("disconnect").setDescription("Disconnect from voice channel"),
        new SlashCommandBuilder().setName("loop").setDescription("Toggle loop for current track"),
        new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue"),
        new SlashCommandBuilder().setName("clear").setDescription("Clear all upcoming songs from queue"),
        new SlashCommandBuilder().setName("queue").setDescription("View the current queue"),
        new SlashCommandBuilder().setName("volume").setDescription("Set or view volume").addIntegerOption(o => o.setName("level").setDescription("Volume level (1-100)").setRequired(false)),
        new SlashCommandBuilder().setName("move").setDescription("Move a song to the front of the queue").addIntegerOption(o => o.setName("position").setDescription("Queue position to move (starting from 2)").setRequired(true)),
        new SlashCommandBuilder().setName("goto").setDescription("Seek to a specific time in the track").addStringOption(o => o.setName("time").setDescription("Time in seconds or MM:SS format").setRequired(true)),
        new SlashCommandBuilder().setName("filter").setDescription("Apply an audio filter").addStringOption(o => o.setName("mode").setDescription("Filter mode").setRequired(true).addChoices(
            { name: "fast (Nightcore)", value: "fast" },
            { name: "slow (Lo-Fi)", value: "slow" },
            { name: "bass (Heavy)", value: "bass" },
            { name: "turbo (Fast + Bass)", value: "turbo" },
            { name: "chill (Slow + Bass)", value: "chill" },
            { name: "normal (Reset)", value: "normal" }
        )),
        new SlashCommandBuilder().setName("keep").setDescription("Start infinite radio mode from a seed track").addStringOption(o => o.setName("query").setDescription("Song name or URL").setRequired(true)),
        new SlashCommandBuilder().setName("ping").setDescription("Check bot and node latency"),
        new SlashCommandBuilder().setName("invite").setDescription("Get the bot invite link"),
		new SlashCommandBuilder().setName("previous").setDescription("Go back to the previous song."),
        new SlashCommandBuilder().setName("help").setDescription("Show all available commands"),
    ].map(c => c.toJSON());

    client.once("clientReady", async () => {
        const rest = new REST({ version: "10" }).setToken(client.token);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log("✅ Slash commands registered globally.");
        } catch (err) {
            console.error("❌ Failed to register slash commands:", err);
        }
    });

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const { commandName, guild, member, channel } = interaction;
        const voice = member.voice?.channel;
        let serverQueue = queue.get(guild.id);

        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms || !botPerms.has(["ViewChannel", "SendMessages", "EmbedLinks"])) return;

        await interaction.deferReply();

        if (commandName === "play") {
            if (!voice) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ You must be in a voice channel!").setColor(ranc())] });
            }

            const query = interaction.options.getString("query");

            let result;
            try {
                const node = shoukaku.nodes.get("Localhost");
                if (!node || node.state !== 1) {
                    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Connection Error").setDescription("The music server is currently reconnecting. Please wait 5 seconds and try again.").setColor(Colors.Red)] });
                }
                result = await node.rest.resolve(query.startsWith("http") ? query : `ytsearch:${query}`);
            } catch (err) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Connection Error").setDescription("The music server is currently busy. Please try again in a few seconds.").setColor(Colors.Red)] });
            }

            let track;
            if (result.loadType === "track") track = result.data;
            else if (result.loadType === "search") track = result.data[0];
            else if (result.loadType === "playlist") track = result.data.tracks[0];

            if (!track) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ **No results found in the void!**").setColor(Colors.Red)] });
            }

            if (!serverQueue) {
                serverQueue = { textChannel: channel, player: null, songs: [], loop: false, autoQueue: false, lastTrack: null };
                queue.set(guild.id, serverQueue);
            }

            const tracksToAdd = result.loadType === "playlist" ? result.data.tracks : [track];
            for (const t of tracksToAdd) {
                t.requester = member.user;
                serverQueue.songs.push(t);
            }

            if (!serverQueue.player) {
                try {
                    serverQueue.player = await shoukaku.joinVoiceChannel({
                        guildId: guild.id,
                        channelId: voice.id,
                        shardId: guild.shardId,
                        deaf: true
                    });
                    const savedVol = guildData[guild.id]?.volume || 100;
                    serverQueue.player.setGlobalVolume(savedVol);
                    playTrack(guild.id, serverQueue.songs[0]);
                    await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`▶️ Starting **[${track.info.title}](${track.info.uri})**`).setColor(ranc())] });
                } catch (err) {
                    queue.delete(guild.id);
                    return interaction.editReply("❌ Could not join VC");
                }
            } else {
                const addEmbed = new EmbedBuilder()
                    .setAuthor({ name: "Added to Queue", iconURL: "https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif" })
                    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
                    .addFields(
                        { name: "📍 **Position**", value: `\`#${serverQueue.songs.length - 1}\``, inline: true },
                        { name: "⏳ **Duration**", value: `\`${prettyMilliseconds(track.info.length, { colonNotation: true })}\``, inline: true },
                        { name: "🌸 **Senpai**", value: `${member.user}`, inline: true }
                    )
                    .setThumbnail(track.info.artworkUrl || null)
                    .setColor(ranc());
                return interaction.editReply({ embeds: [addEmbed] });
            }
        }

        if (commandName === "search") {
            if (!voice) return interaction.editReply("❌ You must be in a voice channel!");

            const query = interaction.options.getString("query");
            const node = shoukaku.nodes.get("Localhost");
            const result = await node.rest.resolve(`ytsearch:${query}`);

            if (!result || !result.data.length) return interaction.editReply("❌ No results found.");

            const tracks = result.data.slice(0, 5);
            const description = tracks.map((t, i) => `\`${i + 1}.\` [${t.info.title}](${t.info.uri})`).join("\n");

            const searchEmbed = new EmbedBuilder()
                .setAuthor({ name: "Search Results", iconURL: client.user.displayAvatarURL() })
                .setDescription(`${description}\n\n**Reply with a number (1-5) to play, or \`cancel\` to stop.**`)
                .setColor("#2B2D31")
                .setFooter({ text: "Selection expires in 30 seconds" });

            await interaction.editReply({ embeds: [searchEmbed] });

            const filter = (m) => m.author.id === member.id && (/^[1-5]$/.test(m.content) || m.content.toLowerCase() === "cancel");
            const collector = channel.createMessageCollector({ filter, time: 30000, max: 1 });

            collector.on("collect", async (m) => {
                if (m.content.toLowerCase() === "cancel") return m.reply("Search cancelled.");

                const selection = tracks[parseInt(m.content) - 1];
                selection.requester = member.user;

                if (!serverQueue) {
                    serverQueue = { textChannel: channel, player: null, songs: [], loop: false, autoQueue: false, lastTrack: null };
                    queue.set(guild.id, serverQueue);
                }

                serverQueue.songs.push(selection);

                if (!serverQueue.player) {
                    serverQueue.player = await shoukaku.joinVoiceChannel({
                        guildId: guild.id,
                        channelId: voice.id,
                        shardId: guild.shardId,
                        deaf: true
                    });
                    const savedVol = guildData[guild.id]?.volume || 100;
                    serverQueue.player.setGlobalVolume(savedVol);
                    playTrack(guild.id, serverQueue.songs[0]);
                } else {
                    const addEmbed = new EmbedBuilder()
                        .setAuthor({ name: "Added to Queue", iconURL: "https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif" })
                        .setDescription(`**[${selection.info.title}](${selection.info.uri})**`)
                        .setColor(ranc());
                    channel.send({ embeds: [addEmbed] });
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "time") channel.send("**⏱️ Search timed out.**");
            });
        }

        if (commandName === "skip") {
            const botChannel = guild.members.me.voice.channelId;
            if (!voice) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in a voice channel.").setColor(Colors.Red)] });
            if (botChannel && voice.id !== botChannel) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
            if (!serverQueue || !serverQueue.songs.length) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });

            serverQueue.player.stopTrack();
            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("✅ Skipped.").setColor(ranc())] });
        }

        if (commandName === "pause") {
            const botChannel = guild.members.me.voice.channelId;
            if (botChannel && voice?.id !== botChannel) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
            if (!serverQueue) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });

            if (serverQueue.player.paused) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Music is already paused!").setColor(ranc())] });
            }

            serverQueue.player.setPaused(true);
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("⏸️ Paused").setDescription(`Type \`${PREFIX}resume\` or use \`/resume\` to continue playing!`).setColor(ranc())] });
        }

        if (commandName === "resume") {
            const botChannel = guild.members.me.voice.channelId;
            if (botChannel && voice?.id !== botChannel) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
            if (!serverQueue) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });

            serverQueue.player.setPaused(false);
            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("▶️ Resumed.").setColor(ranc())] });
        }

        if (commandName === "stop") {
            if (guild.members.me.voice.channelId && voice?.id !== guild.members.me.voice.channelId) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**❌ | You must be in a voice channel to use this command**").setColor(ranc())] });
            }
            if (!serverQueue) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });

            const guildId = guild.id;
            queue.delete(guildId);
            playedTracks.delete(guildId);

            try {
                shoukaku.leaveVoiceChannel(guildId);
                client.user.setPresence({ status: "idle", activities: [{ name: client.user.username, type: ActivityType.Listening }] });
            } catch (e) {}

            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**🎶 | Stopped and disconnected!**").setColor(ranc())] });
        }

        if (commandName === "disconnect") {
            if (guild.members.me.voice.channelId && voice?.id !== guild.members.me.voice.channelId) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**❌ | You must be in a voice channel to use this command**").setColor(ranc())] });
            }
            if (!serverQueue) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Not connected.").setColor(Colors.Red)] });

            const guildId = guild.id;
            queue.delete(guildId);
            playedTracks.delete(guildId);

            try {
                shoukaku.leaveVoiceChannel(guildId);
                client.user.setPresence({ status: "idle", activities: [{ name: client.user.username, type: ActivityType.Listening }] });
            } catch (e) {}

            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**🎶 | Disconnected!**").setColor(ranc())] });
        }

        if (commandName === "loop") {
            if (!serverQueue || !serverQueue.songs.length) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**❌ | Nothing is playing right now...**").setColor(Colors.Red)] });
            }

            serverQueue.loop = !serverQueue.loop;
            return interaction.editReply({ embeds: [new EmbedBuilder()
                .setTitle(serverQueue.loop ? "🔂 Loop Enabled" : "🔁 Loop Disabled")
                .setDescription(serverQueue.loop ? "**The current song will now repeat.**" : "**Loop has been turned off.**")
                .setColor(serverQueue.loop ? Colors.Green : Colors.Red)] });
        }

        if (commandName === "shuffle") {
            if (!serverQueue || serverQueue.songs.length < 2) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **Not enough songs in the queue to shuffle!**").setColor(Colors.Red)] });
            }

            const current = serverQueue.songs.shift();
            for (let i = serverQueue.songs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
            }
            serverQueue.songs.unshift(current);

            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🔀 Queue Shuffled").setDescription("**The queue has been shuffled successfully!**").setColor(Colors.Green)] });
        }

        if (commandName === "clear") {
            if (guild.members.me.voice.channelId && voice?.id !== guild.members.me.voice.channelId) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("**❌ | You must be in a voice channel to use this command**").setColor(ranc())] });
            }
            if (!serverQueue || !serverQueue.songs.length) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **Nothing is playing right now...**").setColor(Colors.Red)] });
            }

            serverQueue.songs = [serverQueue.songs[0]];
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🧹 Queue Cleared").setDescription("**All upcoming songs have been removed.**").setColor(Colors.Green)] });
        }
		
		if (commandName === "previous") {
			const botChannel = message.guild.members.me.voice.channelId;
			if (!voice) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in a voice channel.").setColor(Colors.Red)] });
			if (botChannel && voice.id !== botChannel) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
			if (!serverQueue || !serverQueue.player) {
				return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **Nothing is playing right now.**").setColor(Colors.Red)] });
			}
			if (!serverQueue.previousTrack) {
				return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **There is no previous song for this session.**").setColor(Colors.Red)] });
			}
			
			const prev = serverQueue.previousTrack;
			const current = serverQueue.songs[0];
		
			serverQueue.songs.shift();
			serverQueue.songs.unshift(prev);
			serverQueue.songs.unshift(current);
		
			serverQueue.previousTrack = null;
			serverQueue.player.stopTrack();
			
			message.channel.send({ embeds: [new EmbedBuilder()
			        .setDescription(`⏮ | Previous song: **[${prev.info.title}](${prev.info.uri})**`)
					.setColor(ranc())]
			});
		}	

        if (commandName === "queue") {
            if (!serverQueue || !serverQueue.songs.length) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **The queue is empty!**").setColor(Colors.Red)] });
            }

            const currentSong = serverQueue.songs[0];
            const upcoming = serverQueue.songs.slice(1, 11);

            const queueEmbed = new EmbedBuilder()
                .setAuthor({ name: `Queue for ${guild.name}`, iconURL: guild.iconURL({ dynamic: true }) })
                .setColor("#2B2D31")
                .setDescription(`**Now Playing:**\n[${currentSong.info.title}](${currentSong.info.uri})\n\n${upcoming.length > 0
                    ? "**Upcoming:**\n" + upcoming.map((t, i) => `\`${i + 1}.\` [${t.info.title}](${t.info.uri})`).join("\n")
                    : "No more songs in queue."}`)
                .setFooter({ text: `${serverQueue.songs.length} songs in total • Loop: ${serverQueue.loop ? "ON" : "OFF"}` });

            return interaction.editReply({ embeds: [queueEmbed] });
        }

        if (commandName === "volume") {
            if (!voice) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in a voice channel.").setColor(Colors.Red)] });
            if (guild.members.me.voice.channelId && voice.id !== guild.members.me.voice.channelId) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
            if (!serverQueue || !serverQueue.player) return interaction.editReply("❌ Nothing is playing right now.");

            const level = interaction.options.getInteger("level");

            if (level === null) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`🔉 | Current volume is: **${serverQueue.player.volume}%**`).setColor(ranc())] });
            }

            if (level < 1 || level > 100) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ | **Please choose a number between `1 - 100`**").setColor(Colors.Red)] });
            }

            serverQueue.player.setGlobalVolume(level);
            if (!guildData[guild.id]) guildData[guild.id] = {};
            guildData[guild.id].volume = level;
            saveGuildData();

            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`🔉 | **Volume set to** \`${level}%\` (Saved for this server)`).setColor(Colors.Green)] });
        }

        if (commandName === "move") {
            if (!voice) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in a voice channel.").setColor(Colors.Red)] });
            if (guild.members.me.voice.channelId && voice.id !== guild.members.me.voice.channelId) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });
            if (!serverQueue || serverQueue.songs.length < 3) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Not enough songs in the queue.").setColor(Colors.Red)] });

            const index = interaction.options.getInteger("position");
            if (isNaN(index) || index <= 1 || index >= serverQueue.songs.length) {
                return interaction.editReply("❌ Provide a valid song number from the queue (starting from 2).");
            }

            const song = serverQueue.songs.splice(index, 1)[0];
            serverQueue.songs.splice(1, 0, song);
            serverQueue.player.stopTrack();

            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Moved **${song.info.title}** to the top of the queue.`).setColor(ranc())] });
        }

        if (commandName === "goto") {
            const botChannel = guild.members.me.voice.channelId;
            if (!voice || !serverQueue || !serverQueue.player) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });
            if (botChannel && voice.id !== botChannel) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ You must be in the same voice channel.").setColor(Colors.Red)] });

            const time = interaction.options.getString("time");

            let ms = 0;
            if (time.includes(":")) {
                const [min, sec] = time.split(":").map(Number);
                ms = (min * 60 + (sec || 0)) * 1000;
            } else {
                ms = parseInt(time) * 1000;
            }

            const totalLength = serverQueue.songs[0].info.length;

            if (isNaN(ms) || ms < 0 || ms > totalLength) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ **Invalid position.** Song length is \`${prettyMilliseconds(totalLength, { colonNotation: true })}\`.`).setColor(Colors.Red)] });
            }

            serverQueue.player.seekTo(ms);
            return interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`⏳ **Timeline shifted to** \`${time.includes(":") ? time : prettyMilliseconds(ms, { colonNotation: true })}\`.`).setColor(Colors.Blue)] });
        }

        if (commandName === "filter") {
            if (!voice || !serverQueue || !serverQueue.player) return interaction.editReply({ embeds: [new EmbedBuilder().setDescription("❌ Nothing is playing.").setColor(Colors.Red)] });

            const choice = interaction.options.getString("mode");

            if (choice === "normal") {
                serverQueue.player.setFilters({});
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("🍃 **Mode:** Normal — Track reset to original state.")] });
            }
            if (choice === "fast") {
                serverQueue.player.setFilters({});
                serverQueue.player.setFilters({ timescale: { speed: 1.3, pitch: 1.3 } });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("🚀 **Mode:** Nightcore — Rhythm accelerated.")] });
            }
            if (choice === "slow") {
                serverQueue.player.setFilters({});
                serverQueue.player.setFilters({ timescale: { speed: 0.8, pitch: 0.8 } });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("☕ **Mode:** Lo-Fi — Rhythm slowed for focus.")] });
            }
            if (choice === "bass") {
                serverQueue.player.setFilters({});
                serverQueue.player.setFilters({ equalizer: [{ band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.25 }, { band: 3, gain: 0.1 }] });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("🔉 **Mode:** Bass — Low frequencies boosted.")] });
            }
            if (choice === "turbo") {
                serverQueue.player.setFilters({});
                serverQueue.player.setFilters({ timescale: { speed: 1.3, pitch: 1.15 }, equalizer: [{ band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.25 }, { band: 3, gain: 0.1 }] });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("🔥 **Mode:** Turbo — Fast rhythm with heavy bass.")] });
            }
            if (choice === "chill") {
                serverQueue.player.setFilters({});
                serverQueue.player.setFilters({ timescale: { speed: 0.82, pitch: 0.85 }, equalizer: [{ band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.25 }, { band: 3, gain: 0.1 }] });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(ranc()).setDescription("🌊 **Mode:** Chill — Slowed rhythm with deep bass.")] });
            }
        }

        if (commandName === "keep") {
            if (!voice) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ You must be in a voice channel!").setColor(ranc())] });
            }

            const query = interaction.options.getString("query");
            let result;
            try {
                const node = shoukaku.nodes.get("Localhost");
                if (!node || node.state !== 1) {
                    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Connection Error").setDescription("The music server is currently reconnecting. Please wait and try again.").setColor(Colors.Red)] });
                }
                result = await node.rest.resolve(query.startsWith("http") ? query : `ytsearch:${query}`);
            } catch (err) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ Connection Error").setDescription("The music server is currently busy. Please try again.").setColor(Colors.Red)] });
            }

            let track;
            if (result.loadType === "track") track = result.data;
            else if (result.loadType === "search") track = result.data[0];
            else if (result.loadType === "playlist") track = result.data.tracks[0];

            if (!track) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("❌ **No results found!**").setColor(Colors.Red)] });
            }

            if (!serverQueue) {
                serverQueue = { textChannel: channel, player: null, songs: [], loop: false, autoQueue: true, lastTrack: null };
                queue.set(guild.id, serverQueue);
            } else {
                serverQueue.autoQueue = true;
            }

            if (!playedTracks.has(guild.id)) playedTracks.set(guild.id, new Set());
            playedTracks.get(guild.id).add(track.info.identifier);

            track.requester = member.user;
            serverQueue.songs.push(track);

            if (!serverQueue.player) {
                try {
                    serverQueue.player = await shoukaku.joinVoiceChannel({
                        guildId: guild.id,
                        channelId: voice.id,
                        shardId: guild.shardId,
                        deaf: true
                    });
                    const savedVol = guildData[guild.id]?.volume || 100;
                    serverQueue.player.setGlobalVolume(savedVol);
                    playTrack(guild.id, serverQueue.songs[0]);
                    return interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: "Radio Started 📻", iconURL: "https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif" }).setDescription(`**[${track.info.title}](${track.info.uri})**\nInfinite radio mode is now active.`).setThumbnail(track.info.artworkUrl || null).setColor(ranc())] });
                } catch (err) {
                    queue.delete(guild.id);
                    return interaction.editReply("❌ Could not join VC");
                }
            } else {
                return interaction.editReply({ embeds: [new EmbedBuilder().setAuthor({ name: "Radio Started 📻", iconURL: "https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif" }).setDescription(`**[${track.info.title}](${track.info.uri})**\nInfinite radio mode is now active.`).setThumbnail(track.info.artworkUrl || null).setColor(ranc())] });
            }
        }

        if (commandName === "ping") {
            const botName = client.user.username;
            const botLatency = Date.now() - interaction.createdTimestamp;
            const apiLatency = client.ws.ping <= 0 ? "⚡ Initializing..." : `${Math.round(client.ws.ping)}ms`;

            const node = shoukaku.nodes.get("Localhost");
            let lavaPing = "Offline";
            if (node) {
                const start = performance.now();
                try {
                    await fetch(`http://lavalinkv4.serenetia.com:80`, { method: "HEAD" }).catch(() => null);
                    lavaPing = `${Math.round(performance.now() - start)}ms`;
                } catch (e) {
                    lavaPing = "Stable (N/A)";
                }
            }

            const player = shoukaku.players.get(guild.id);
            const voicePing = player ? `${player.ping}ms` : "Not in VC";

            const embed = new EmbedBuilder()
                .setAuthor({ name: `${botName} System Diagnostics`, iconURL: client.user.displayAvatarURL() })
                .addFields(
                    { name: "💻 System Speed", value: `\`${botLatency}ms\``, inline: true },
                    { name: "🌐 Discord API", value: `\`${apiLatency}\``, inline: true },
                    { name: "\u200B", value: "\u200B", inline: true },
                    { name: "🔥 Music Node", value: `\`${lavaPing}\``, inline: true },
                    { name: "🎙️ Voice Feed", value: `\`${voicePing}\``, inline: true },
                    { name: "\u200B", value: "\u200B", inline: true }
                )
                .setColor("#2B2D31")
                .setFooter({ text: `${botName} • Made with ❤️` });

            return interaction.editReply({ embeds: [embed] });
        }

        if (commandName === "invite") {
            const botId = client.user.id;
            const permissions = "37013504";
            const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=${permissions}&scope=bot%20applications.commands`;

            const inviteEmbed = new EmbedBuilder()
                .setTitle(`Add ${client.user.username} to your server`)
                .setDescription("A high-performance audio and management node.")
                .addFields({ name: "", value: `**[Authorize ${client.user.username}](${inviteLink})**`, inline: false })
                .setColor("#2F3136")
                .setThumbnail(client.user.displayAvatarURL());

            return interaction.editReply({ embeds: [inviteEmbed] });
        }

        if (commandName === "help") {
            const botName = client.user.username;
            const helpEmbed = new EmbedBuilder()
                .setAuthor({ name: `The Rhythm of ${botName}`, iconURL: client.user.displayAvatarURL() })
                .setDescription(`
\`${PREFIX}play [query]\` — Play your favorite tracks
\`${PREFIX}search [query]\` — Find and choose a specific track
\`${PREFIX}pause\` — Pause the current rhythm
\`${PREFIX}resume\` — Resume the current rhythm
\`${PREFIX}skip\` — Skip to the next track
\`${PREFIX}previous\` — Go back to the previous track
\`${PREFIX}move [num]\` — Bring a specific song from queue to the front
\`${PREFIX}goto [time]\` — Shift the timeline of the track
\`${PREFIX}stop\` — End the rhythm and clear queue

**⚙️ Rhythm Filtering**
\`${PREFIX}f fast\` — Nightcore mode for high energy
\`${PREFIX}f slow\` — Lo-Fi mode for deep focus
\`${PREFIX}f bass\` — Heavy output for a premium feel
\`${PREFIX}f turbo\` — Fast rhythm + Heavy bass
\`${PREFIX}f chill\` — Slow rhythm + Deep bass
\`${PREFIX}f normal\` — Reset track to its original rhythm

**📊 System & Queue**
\`${PREFIX}keep\` — Toggle infinite related tracks
\`${PREFIX}volume\` — Set the output volume
\`${PREFIX}loop\` — Loop the current track
\`${PREFIX}shuffle\` — Shuffle upcoming tracks
\`${PREFIX}queue\` — View the upcoming rhythm
\`${PREFIX}clear\` — Wipe all upcoming songs
\`${PREFIX}ping\` — Check the heartbeat of the connection
\`${PREFIX}invite\` — Get the bot invite link
\`${PREFIX}disconnect\` — Leave the voice channel 

**✨ Tip:**  
Be in a voice channel so the rhythm can find you. 🎧`)
                .setColor(Colors.Blurple)
                .setFooter({ text: `${botName} • Made with ❤️` });

            return interaction.editReply({ embeds: [helpEmbed] });
        }
    });
};