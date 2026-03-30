const { Client, GatewayIntentBits, EmbedBuilder, Colors, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { Shoukaku, Connectors } = require("shoukaku");
const prettyMilliseconds = require("pretty-ms");
const playedTracks = new Map();

const dns = require('node:dns');
// 1. Force IPv4 only - No more "guessing" IPv6
dns.setDefaultResultOrder('ipv4first'); 

// 2. Increase the "Happy Eyeballs" timeout so it doesn't kill the IPv4 attempt
const net = require('node:net');
if (net.setDefaultAutoSelectFamilyAttemptTimeout) {
    net.setDefaultAutoSelectFamilyAttemptTimeout(5000); 
}

// Volume DB START
const fs = require('fs');
const DATA_FILE = './guildData.json';

let guildData = {};
if (fs.existsSync(DATA_FILE)) {
    try {
        guildData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading JSON file, starting fresh.");
        guildData = {};
    }
}

function saveGuildData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(guildData, null, 4));
}
// VOLUME DB END

// ================= CONFIG =================

const TOKEN = "BOT_TOKEN";
const PREFIX = "?";
const BOT_STATUS = "🎻 playing your soul's rhythm";
const STREAM_URL = "https://www.twitch.tv/directory";

const nodes = [
  {
    name: "Localhost",
    url: "130.62.52.133:2333",
    auth: "youshallnotpass",
	secure: false
  }
];

// ==========================================


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client), 
    nodes, 
    {
        resume: true,
        resumeTimeout: 60,
        reconnectTries: 1000, 
        reconnectInterval: 10,
        restTimeout: 10000
    }
);

shoukaku.on('error', (name, error) => {
    console.error(`⚠️ Lavalink Node "${name}" error: Connection lost. Retrying...`);
});

shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink Node "${name}" is now connected and ready.`);
});

shoukaku.on('close', (name, code, reason) => {
    console.warn(`❌ Lavalink Node "${name}" closed. Code: ${code}. Reason: ${reason || 'No reason provided'}`);
});

// DEBUG
//shoukaku.on('error', (name, error) => console.error(`Lavalink ${name} error:`, error));
//shoukaku.on('debug', (name, info) => console.log(`Lavalink ${name} debug:`, info));
//shoukaku.on('trackStart', (player, track) => console.log(`🎵 Playing: ${track.info.title}`));
//shoukaku.on('trackException', (player, error) => console.error(`❌ Track Error:`, error));

function ranc() {
    const colors = [
        "#1ABC9C","#57F287","#3498DB","#9B59B6",
        "#E91E63","#F1C40F","#E67E22","#ED4245"
    ];
    return colors[Math.floor(Math.random()*colors.length)];
}

client.once("clientReady", () => {

    console.log(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
        status: "idle",
        activities: [{
            name: BOT_STATUS,
            type: ActivityType.Listening
        }]
    });

});


const queue = new Map();

// FIRST JOIN WELCOME XD
client.on("guildCreate", async (guild) => {
    // Finds the system channel or the first available text channel
    const channel = guild.systemChannel || 
                    guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(client.user).has("SendMessages"));

    if (!channel) return;

    const botName = client.user.username;
    const welcomeEmbed = new EmbedBuilder()
        .setAuthor({ 
            name: `Rhythm Connected | ${guild.name}`, 
            iconURL: client.user.displayAvatarURL() 
        })
        .setTitle(`🎧 The Professional Setup of ${botName}`)
        .setDescription(`
Thanks for adding me! I am optimized for high-performance audio across global nodes. Here is your dashboard to get the rhythm started:

**🚀 Playback Control**
\`${PREFIX}play [query]\` — Play your favorite tracks
\`${PREFIX}search [query]\` — Find and choose a specific track
\`${PREFIX}pause\` — Pause the current rhythm
\`${PREFIX}resume\` — Resume the current rhythm
\`${PREFIX}skip\` — Skip to the next track
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
\`${PREFIX}disconnect\` — Leave the voice channel

**📚 Documentation**
Use **\`${PREFIX}help\`** or **\`${PREFIX}h\`** anytime to pull up this dashboard again.

**✨ Tip:** Be in a voice channel so the rhythm can find you. 🎧`)
        .setColor("#5865F2") 
        .setFooter({ text: `${botName} • High-Performance Music Bot` })

    try {
        await channel.send({ embeds: [welcomeEmbed] });
    } catch (err) {
        console.log(`Log: Could not send full welcome to ${guild.name}`);
    }
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const voice = message.member.voice.channel;
    let serverQueue = queue.get(message.guild.id);
	
    // --- PERMISSION CHECK ---
	const botPerms = message.channel.permissionsFor(message.guild.members.me);
    if (!botPerms || !botPerms.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
        console.error(`[PERMISSION ERROR] Missing perms in ${message.guild.name} (#${message.channel.name})`);
        return; 
    }

    // --- PLAY COMMAND ---
    if (cmd === "play" || cmd === "p") {
		if (!voice) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ You must be in a voice channel!')
			    .setColor(ranc())
		    return message.channel.send({ embeds: [embed] });
		}
		
		
        const query = args.join(" ");
		if (!query) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ **Please Provide a Valid Song name or Link!**')
				.setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
		}

        let result;
        try {
            const node = shoukaku.nodes.get("Localhost");
            
            // Check if node exists AND is actually connected (state 1)
            if (!node || node.state !== 1) {
                const errEmbed = new EmbedBuilder()
                    .setTitle('❌ Connection Error')
                    .setDescription('The music server is currently reconnecting. Please wait 5 seconds and try again.')
                    .setColor(Colors.Red);
                return message.channel.send({ embeds: [errEmbed] });
            }
            
            result = await node.rest.resolve(query.startsWith("http") ? query : `ytsearch:${query}`);
        } catch (err) {
            console.error("Lavalink Search Error:", err.message);
            const errEmbed = new EmbedBuilder()
            .setTitle('❌ Connection Error')
            .setDescription('The music server is currently busy. Please try again in a few seconds.')
            .setColor(Colors.Red);
            return message.channel.send({ embeds: [errEmbed] });
        }
		
		// --- SMART DATA CAPTURE (Confirmation Logic) ---
        let track;
        if (result.loadType === "track") {
            track = result.data; 
        } else if (result.loadType === "search") {
            track = result.data[0]; 
        } else if (result.loadType === "playlist") {
            track = result.data.tracks[0]; 
        }

        if (!track) {
            const noResEmbed = new EmbedBuilder()
                .setTitle('❌ **No results found in the void!**')
                .setColor(Colors.Red);
            return message.channel.send({ embeds: [noResEmbed] });
        }
		
        // --- QUEUE MANAGEMENT ---
        if (!serverQueue) {
            serverQueue = {
                textChannel: message.channel,
                player: null,
                songs: [],
                loop: false,
                autoQueue: false,
                lastTrack: null
            };
            queue.set(message.guild.id, serverQueue);
        }

        // Store the requester's mention inside the track object
        track.requester = message.author; 
		const tracksToAdd = result.loadType === "playlist" ? result.data.tracks : [track];
        for (const t of tracksToAdd) {
            t.requester = message.author;
            serverQueue.songs.push(t);
        }
        //serverQueue.songs.push(track);

        if (!serverQueue.player) {
            try {
                serverQueue.player = await shoukaku.joinVoiceChannel({
                    guildId: message.guild.id,
					channelId: voice.id,
					shardId: message.guild.shardId,
					deaf: true
                });
				
				// --- APPLY SAVED VOLUME FROM JSON ---
				const savedVol = guildData[message.guild.id]?.volume || 100;
                serverQueue.player.setGlobalVolume(savedVol);
				// ------------------------------------
				
                playTrack(message.guild.id, serverQueue.songs[0]);
            } catch (err) {
                queue.delete(message.guild.id);
                return message.reply("❌ Could not join VC");
            }
        } else {
            const addEmbed = new EmbedBuilder()
                .setAuthor({ name: "Added to Queue", iconURL: 'https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif' })
				.setDescription(`**[${track.info.title}](${track.info.uri})**`)
                .addFields(
                    //{ name: '📍 **Position**', value: `\`#${serverQueue.songs.length}\``, inline: true },
					{ name: '📍 **Position**', value: `\`#${serverQueue.songs.length - 1}\``, inline: true },
                    { name: '⏳ **Duration**', value: `\`${prettyMilliseconds(track.info.length, { colonNotation: true })}\``, inline: true },
					{ name: '🌸 **Senpai**', value: `${track.requester}`, inline: true },
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setColor(ranc());
            return message.channel.send({ embeds: [addEmbed] });
        }
    }
	
	// --- QUEUE COMMAND ---
	if (cmd === "queue" || cmd === "q") {
		if (!serverQueue || !serverQueue.songs.length) {
            const embed = new EmbedBuilder()
                .setDescription('❌ | **The queue is empty!**')
                .setColor(Colors.Red);
            return message.channel.send({ embeds: [embed] });
        }

        const currentSong = serverQueue.songs[0];
        // Get up to 10 next songs (skipping index 0 which is currently playing)
        const upcoming = serverQueue.songs.slice(1, 11); 

        const queueEmbed = new EmbedBuilder()
            .setAuthor({ name: `Queue for ${message.guild.name}`, iconURL: message.guild.iconURL({ dynamic: true }) })
            .setColor("#2B2D31")
            .setDescription(`**Now Playing:**\n[${currentSong.info.title}](${currentSong.info.uri})\n\n${upcoming.length > 0 
                ? '**Upcoming:**\n' + upcoming.map((t, i) => `\`${i + 1}.\` [${t.info.title}](${t.info.uri})`).join('\n') 
                : 'No more songs in queue.'}`)
            .setFooter({ text: `${serverQueue.songs.length} songs in total • Loop: ${serverQueue.loop ? 'ON' : 'OFF'}` });

        message.channel.send({ embeds: [queueEmbed] });
    }
	
	// --- MOVE COMMAND ---
	if (cmd === "move" || cmd === "m") {
        if (!voice) return message.react("❌");
        if (message.guild.members.me.voice.channelId && voice.id !== message.guild.members.me.voice.channelId) return message.react("❌");
        if (!serverQueue || serverQueue.songs.length < 3) return message.react("❌");

        const index = parseInt(args[0]);
        // Validating the index (can't move song 0 or 1 as they are playing/next)
        if (isNaN(index) || index <= 1 || index >= serverQueue.songs.length) {
            return message.reply("❌ Provide a valid song number from the queue (starting from 2).");
        }

        // Remove the song from its position and store it
        const song = serverQueue.songs.splice(index, 1)[0];
        
        // Insert it at index 1 (right after the currently playing song)
        serverQueue.songs.splice(1, 0, song);
		
		serverQueue.player.stopTrack();

        const moveEmbed = new EmbedBuilder()
            .setDescription(`✅ Moved **${song.info.title}** to the top of the queue.`)
            .setColor(ranc());
        message.channel.send({ embeds: [moveEmbed] });
    }
	
	// --- GOTO (TIME SHIFT / REWIND) ---
    if (cmd === "goto") {
		const botChannel = message.guild.members.me.voice.channelId;
        if (!voice || !serverQueue || !serverQueue.player) return message.react("❌");
		if (botChannel && voice.id !== botChannel) return message.react("❌");

        let time = args[0];
        if (!time) {
            const usageEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setTitle('⚙️ Timeline Shift')
                .setDescription(
                    `> Use \`${PREFIX}goto 1:30\` to seek a specific point.\n` +
                    `> Use \`${PREFIX}goto 0\` to rewind the melody.`
                );
            return message.channel.send({ embeds: [usageEmbed] });
        }

        // Convert MM:SS or Seconds to Milliseconds
        let ms = 0;
        if (time.includes(':')) {
            const [min, sec] = time.split(':').map(Number);
            ms = (min * 60 + (sec || 0)) * 1000;
        } else {
            ms = parseInt(time) * 1000;
        }

        const totalLength = serverQueue.songs[0].info.length;

        if (isNaN(ms) || ms < 0 || ms > totalLength) {
            const errEmbed = new EmbedBuilder()
                .setDescription(`❌ **Invalid position.** Song length is \`${prettyMilliseconds(totalLength, { colonNotation: true })}\`.`)
                .setColor(Colors.Red);
            return message.channel.send({ embeds: [errEmbed] });
        }

        serverQueue.player.seekTo(ms);
        
        const successEmbed = new EmbedBuilder()
            .setDescription(`⏳ **Timeline shifted to** \`${time.includes(':') ? time : prettyMilliseconds(ms, { colonNotation: true })}\`.`)
            .setColor(Colors.Blue);
        message.channel.send({ embeds: [successEmbed] });
    }

    // --- SKIP COMMAND ---
    if (cmd === "skip" || cmd === "s") {
		const botChannel = message.guild.members.me.voice.channelId;
		
        if (!voice) return message.react("❌");
        if (botChannel && voice.id !== botChannel) return message.react("❌");
		if (!serverQueue || !serverQueue.songs.length) return message.react("❌");
		
        serverQueue.player.stopTrack();
        message.react("✅");
    }
	
    // --- VOLUME COMMAND ---
	if (cmd === "volume" || cmd === "vol" || cmd === "v") {
        if (!voice) return message.react("❌");
        if (message.guild.members.me.voice.channelId && voice.id !== message.guild.members.me.voice.channelId) return message.react("❌");
        if (!serverQueue || !serverQueue.player) return message.reply("❌ Nothing is playing right now.");

        // If no arguments, show the current volume
        if (!args[0]) {
            const embed = new EmbedBuilder()
                .setDescription(`🔉 | Current volume is: **${serverQueue.player.volume}%**`)
                .setColor(ranc());
            return message.channel.send({ embeds: [embed] });
        }

        const vol = parseInt(args[0]);

        if (isNaN(vol) || vol < 1 || vol > 100) {
            const embed = new EmbedBuilder()
                .setDescription("❌ | **Please choose a number between `1 - 100`**")
                .setColor(Colors.Red);
            return message.channel.send({ embeds: [embed] });
        }

        // 1. Update the Player
        serverQueue.player.setGlobalVolume(vol);
        
        // 2. SAVE to our Ledger
        if (!guildData[message.guild.id]) guildData[message.guild.id] = {};
        guildData[message.guild.id].volume = vol;
        saveGuildData();

        const embed = new EmbedBuilder()
            .setDescription(`🔉 | **Volume set to** \`${vol}%\` (Saved for this server)`)
            .setColor(Colors.Green);
        message.channel.send({ embeds: [embed] });
    }
		

    // --- PAUSE / RESUME ---
    if (cmd === "pause") {
		const botChannel = message.guild.members.me.voice.channelId;
		if (botChannel && voice.id !== botChannel) return message.react("❌");
        if (!serverQueue) return;
		
		if (serverQueue.player.paused) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ Music is already paused!')
				.setColor(ranc());
			return message.channel.send({ embeds: [embed] });
		}
		
        serverQueue.player.setPaused(true);
        const embed = new EmbedBuilder()
		    .setTitle('⏸️ Paused')
			.setDescription(`Type \`${PREFIX}resume\` to continue playing!`)
			.setColor(ranc())
		message.channel.send({ embeds: [embed] });	
    }

    if (cmd === "resume") {
		const botChannel = message.guild.members.me.voice.channelId;
		if (botChannel && voice.id !== botChannel) return message.react("❌");
        if (!serverQueue) return;
        serverQueue.player.setPaused(false);
        message.react("▶️");
    }
	
    // --- CLEAR COMMAND ---
	if (cmd === "clear" || cmd === "cl" || cmd === "cls") {
		if (message.guild.members.me.voice.channelId && voice.id !== message.guild.members.me.voice.channelId) {
            const embed = new EmbedBuilder()
			    .setDescription('**❌ | You must be in a voice channel use this command**')
				.setColor(ranc())
			return message.channel.send({ embeds: [embed] });
        }
		
		if (!serverQueue || !serverQueue.songs.length) {
            const embed = new EmbedBuilder()
                .setDescription('❌ | **Nothing is playing right now...**')
                .setColor(Colors.Red);
            return message.channel.send({ embeds: [embed] });
        }
		
		serverQueue.songs = [serverQueue.songs[0]];
		
		const embed = new EmbedBuilder()
            .setTitle('🧹 Queue Cleared')
            .setDescription('**All upcoming songs have been removed.**')
            .setColor(Colors.Green);
		message.channel.send({ embeds: [embed] });
    }
	
    // --- PREVIOUS ---
	if (cmd === "previous") {
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

    // --- STOP / DISCONNECT ---
    if (cmd === "dc" || cmd === "disconnect") {
		if (message.guild.members.me.voice.channelId && voice.id !== message.guild.members.me.voice.channelId) {
            const embed = new EmbedBuilder()
			    .setDescription('**❌ | You must be in a voice channel use this command**')
				.setColor(ranc())
			return message.channel.send({ embeds: [embed] });
        }
				
        if (!serverQueue) return;
		
        const guildId = message.guild.id;
        queue.delete(guildId);
		playedTracks.delete(guildId);
		
		try {
			shoukaku.leaveVoiceChannel(guildId);
			
			// 🎯 MANUAL RESET: Re-aligning the status since we bypassed the auto-event
			client.user.setPresence({
                status: "idle",
                activities: [{
                    name: BOT_STATUS, 
                    type: ActivityType.Listening
                }]
            });
		} catch (e) {
			console.error("Error leaving channel:", e);
		}
		
        const embed = new EmbedBuilder()
		    .setDescription('**🎶 | Disconnected!**')
			.setColor(ranc())
			
		message.channel.send({ embeds: [embed] });
		
    }
	
    // --- SEARCH COMMAND ---
	if (cmd === "search") {
        if (!voice) return message.reply("❌ You must be in a voice channel!");
        const query = args.join(" ");
        if (!query) return message.reply("❌ Please provide a search query!");

        const node = shoukaku.nodes.get("Localhost");
        const result = await node.rest.resolve(`ytsearch:${query}`);

        if (!result || !result.data.length) return message.reply("❌ No results found.");

        // Grab top 5 results
        const tracks = result.data.slice(0, 5);
        const description = tracks.map((t, i) => `\`${i + 1}.\` [${t.info.title}](${t.info.uri})`).join('\n');

        const searchEmbed = new EmbedBuilder()
            .setAuthor({ name: "Search Results", iconURL: client.user.displayAvatarURL() })
            .setDescription(`${description}\n\n**Reply with a number (1-5) to play, or \`cancel\` to stop.**`)
            .setColor("#2B2D31")
            .setFooter({ text: "Selection expires in 30 seconds" });

        const searchMsg = await message.channel.send({ embeds: [searchEmbed] });

        // --- COLLECTOR LOGIC ---
        const filter = (m) => m.author.id === message.author.id && (/^[1-5]$/.test(m.content) || m.content.toLowerCase() === 'cancel');
        const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async (m) => {
            if (m.content.toLowerCase() === 'cancel') return m.reply("Search cancelled.");
            
            const selection = tracks[parseInt(m.content) - 1];
            
            // Re-use your existing play logic
			if (!serverQueue) {
				serverQueue = {
					textChannel: message.channel,
					player: null,
					songs: [],
					loop: false,
					autoQueue: true,
					lastTrack: null,
					previousTrack: null
				};
				queue.set(message.guild.id, serverQueue);
			}

            serverQueue.songs.push(selection);

            if (!serverQueue.player) {
                serverQueue.player = await shoukaku.joinVoiceChannel({
                    guildId: message.guild.id,
                    channelId: voice.id,
                    shardId: message.guild.shardId,
                    deaf: true
                });
                const savedVol = guildData[message.guild.id]?.volume || 100;
                serverQueue.player.setGlobalVolume(savedVol);
                playTrack(message.guild.id, serverQueue.songs[0]);
            } else {
                const addEmbed = new EmbedBuilder()
                    .setAuthor({ name: "Added to Queue", iconURL: 'https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif' })
                    .setDescription(`**[${selection.info.title}](${selection.info.uri})**`)
                    .setColor(ranc());
                message.channel.send({ embeds: [addEmbed] });
            }
            
            if (searchMsg.deletable) searchMsg.delete().catch(() => null);
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') message.reply("**⏱️ Search timed out.**");
        });
    }
	
	// --- KEEP (INFINITE RADIO) ---
	if (cmd === "keep" || cmd === "k") {
		if (!voice) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ You must be in a voice channel!')
				.setColor(ranc());
			return message.channel.send({ embeds: [embed] });
		}
		
		const query = args.join(" ");
        if (!query) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ **Please provide a song name or link!**')
				.setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
		}
		
		let result;
		try {
			const node = shoukaku.nodes.get("Localhost");
			if (!node || node.state !== 1) {
				const embed = new EmbedBuilder()
				    .setTitle('❌ Connection Error')
					.setDescription('The music server is currently reconnecting. Please wait and try again.')
					.setColor(Colors.Red);
				return message.channel.send({ embeds: [embed] });
			}
			result = await node.rest.resolve(query.startsWith("http") ? query : `ytsearch:${query}`);
		} catch (err) {
			console.error("Lavalink Search Error:", err.message);
			const embed = new EmbedBuilder()
			    .setTitle('❌ Connection Error')
				.setDescription('The music server is currently busy. Please try again.')
				.setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
		}
		
		let track;
		if (result.loadType === "track") track = result.data;
   		else if (result.loadType === "search") track = result.data[0];
   		else if (result.loadType === "playlist") track = result.data.tracks[0];
		
		if (!track) {
			const embed = new EmbedBuilder()
			    .setTitle('❌ **No results found!**')
				.setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
	    }
		
		if (!serverQueue) {
			serverQueue = {
				textChannel: message.channel,
				player: null,
				songs: [],
				loop: false,
				autoQueue: true,
				lastTrack: null,
				previousTrack: null
			};
			queue.set(message.guild.id, serverQueue);
		} else {
			serverQueue.autoQueue = true;
		}
		
		if (!playedTracks.has(message.guild.id)) playedTracks.set(message.guild.id, new Set());
		playedTracks.get(message.guild.id).add(track.info.identifier);
		
		track.requester = message.author;
        serverQueue.songs.push(track);
		
		if (!serverQueue.player) {
			try {
				serverQueue.player = await shoukaku.joinVoiceChannel({
					guildId: message.guild.id,
					channelId: voice.id,
					shardId: message.guild.shardId,
					deaf: true
				});
				const savedVol = guildData[message.guild.id]?.volume || 100;
				serverQueue.player.setGlobalVolume(savedVol);
				playTrack(message.guild.id, serverQueue.songs[0]);
			} catch (err) {
				queue.delete(message.guild.id);
				return message.reply("❌ Could not join VC");
			}
		} else {
			const addEmbed = new EmbedBuilder()
			    .setAuthor({ name: "Radio Started 📻", iconURL: 'https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif' })
			    .setDescription(`**[${track.info.title}](${track.info.uri})**\nInfinite radio mode is now active.`)
			    .setThumbnail(track.info.artworkUrl || null)
			    .setColor(ranc());
			return message.channel.send({ embeds: [addEmbed] });
		}
	}
		 

    // --- LOOP ---
    if (cmd === "loop") {
        if (!serverQueue || !serverQueue.songs.length) {
			const embed = new EmbedBuilder()
			    .setDescription('**❌ | Nothing is playing right now...**')
			    .setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
		}
		     	
        serverQueue.loop = !serverQueue.loop;
        const embed = new EmbedBuilder()
		    .setTitle(serverQueue.loop ? '🔂 Loop Enabled' : '🔁 Loop Disabled')
			.setDescription(
			    serverQueue.loop
				    ? '**The current song will now repeat.**'
					: '**Loop has been turned off.**'
			)
			.setColor(serverQueue.loop ? Colors.Green : Colors.Red);
			
		message.channel.send({ embeds: [embed] });
		
    }
	
    // --- FILTER SYSTEM ---
    if (cmd === "filter" || cmd === "f") {
        if (!voice || !serverQueue || !serverQueue.player) return message.react("❌");

        const choice = args[0]?.toLowerCase();

        // 1. Reset/Normal (The "Clear" Logic)
        if (choice === "normal" || choice === "reset" || choice === "off") {
            serverQueue.player.setFilters({}); 
            const resetEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("🍃 **Mode:** Normal — Track reset to original state.");
            return message.channel.send({ embeds: [resetEmbed] });
        }

        // 2. Nightcore (Fast)
        if (choice === "nightcore" || choice === "fast") {
            serverQueue.player.setFilters({}); // Reset First
            serverQueue.player.setFilters({
                timescale: { speed: 1.3, pitch: 1.3 }
            });
            const ncEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("🚀 **Mode:** Nightcore — Rhythm accelerated.");
            return message.channel.send({ embeds: [ncEmbed] });
        }

        // 3. Lo-Fi (Slowed)
        if (choice === "lofi" || choice === "slow") {
            serverQueue.player.setFilters({}); // Reset First
			
            serverQueue.player.setFilters({
                timescale: { speed: 0.8, pitch: 0.8 }
            });
			
            const lofiEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("☕ **Mode:** Lo-Fi — Rhythm slowed for focus.");
            return message.channel.send({ embeds: [lofiEmbed] });
        }

        // 4. Bass Boost (Heavy)
        if (choice === "bass" || choice === "heavy") {
            serverQueue.player.setFilters({}); // Reset First
            serverQueue.player.setFilters({
                equalizer: [
                    { band: 0, gain: 0.25 },
                    { band: 1, gain: 0.25 },
                    { band: 2, gain: 0.25 },
					{ band: 3, gain: 0.1 }
                ]
            });
            const bassEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("🔉 **Mode:** Bass — Low frequencies boosted.");
            return message.channel.send({ embeds: [bassEmbed] });
        }
		
		// 5. Turbo Bass (Fast + Bass)
        if (choice === "turbo") {
            serverQueue.player.setFilters({});
			serverQueue.player.setFilters({
                timescale: { speed: 1.3, pitch: 1.15 },
                equalizer: [
                    { band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.25 }, { band: 3, gain: 0.1 }
                ]
            });
            const turboEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("🔥 **Mode:** Turbo — Fast rhythm with heavy bass.");
            return message.channel.send({ embeds: [turboEmbed] });
        }

        // 6. Chill Bass (Slow + Bass)
        if (choice === "chill") {
            serverQueue.player.setFilters({});
			serverQueue.player.setFilters({
                timescale: { speed: 0.82, pitch: 0.85 },
                equalizer: [
                    { band: 0, gain: 0.25 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.25 }, { band: 3, gain: 0.1 }
                ]
            });
            const chillEmbed = new EmbedBuilder()
                .setColor(ranc())
                .setDescription("🌊 **Mode:** Chill — Slowed rhythm with deep bass.");
            return message.channel.send({ embeds: [chillEmbed] });
        }

        // --- USAGE (Option 2 Style) ---
        const filterUsage = new EmbedBuilder()
            .setColor(ranc())
            .setTitle('⚙️ Rhythm Filtering')
            .setDescription(
                `> Use \`${PREFIX}f fast\` for Nightcore energy.\n` +
                `> Use \`${PREFIX}f slow\` for Lo-Fi focus.\n` +
                `> Use \`${PREFIX}f bass\` for heavy output.\n` +
                `> Use \`${PREFIX}f turbo\` for Fast + Bass.\n` +
                `> Use \`${PREFIX}f chill\` for Slow + Bass.\n` +
                `> Use \`${PREFIX}f normal\` to reset the track.`
            );
        return message.channel.send({ embeds: [filterUsage] });
    }

    // --- SHUFFLE ---
    if (cmd === "shuffle") {
        if (!serverQueue || serverQueue.songs.length < 2) {
			const embed = new EmbedBuilder()
			.setDescription('❌ | **Not enough songs in the queue to shuffle!**')
			.setColor(Colors.Red);
			return message.channel.send({ embeds: [embed] });
		}
        const current = serverQueue.songs.shift();
        for (let i = serverQueue.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [serverQueue.songs[i], serverQueue.songs[j]] = [serverQueue.songs[j], serverQueue.songs[i]];
        }
        serverQueue.songs.unshift(current);
        
		const embed = new EmbedBuilder()
		    .setTitle('🔀 Queue Shuffled')
			.setDescription('**The queue has been shuffled successfully!**')
			.setColor(Colors.Green);
		
		message.channel.send({ embeds: [embed] });	
    }
	
    // --- PING COMMAND ---
    if (cmd === "ping") {
		const botName = client.user.username;
        const msg = await message.channel.send("📡 Scanning connection...");
        
        const botLatency = msg.createdTimestamp - message.createdTimestamp;
		const apiLatency = client.ws.ping <= 0 ? "⚡ Initializing..." : `${Math.round(client.ws.ping)}ms`;

        const node = shoukaku.nodes.get("Localhost");
        let lavaPing = "Offline";

        if (node) {
            const start = performance.now();
            try {
                await fetch(`http://${nodes[0].url}`, { method: 'HEAD' }).catch(() => null);
                lavaPing = `${Math.round(performance.now() - start)}ms`;
            } catch (e) {
                lavaPing = "Stable (N/A)";
            }
        }
		
		// 2. Voice Ping (Actual Audio Connection)
        const player = shoukaku.players.get(message.guild.id);
        const voicePing = player ? `${player.ping}ms` : "Not in VC";

        const embed = new EmbedBuilder()
            .setAuthor({ 
                name: `${botName} System Diagnostics`, 
                iconURL: client.user.displayAvatarURL() 
            })
            .addFields(
                { name: '💻 System Speed', value: `\`${botLatency}ms\``, inline: true },
                { name: '🌐 Discord API', value: `\`${apiLatency}\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // Invisible Spacer
                { name: '🔥 Music Node', value: `\`${lavaPing}\``, inline: true },
                { name: '🎙️ Voice Feed', value: `\`${voicePing}\``, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }  // Invisible Spacer
            )
            .setColor("#2B2D31")
			.setFooter({ text: `${botName} • Made with ❤️` });
            //.setFooter({ text: `Target: sg1-nodelink.nyxbot.app` });

        return msg.edit({ content: null, embeds: [embed] });
    }
	
	// INVITE AND ADD
	if (cmd === "invite") {
        const botId = client.user.id;
        // Optimized Permissions: 37013568 (Voice, Messaging, Embeds)
        const permissions = "37013568"; 
        const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=${permissions}&scope=bot%20applications.commands`;

        const inviteEmbed = new EmbedBuilder()
            .setTitle(`Add ${client.user.username} to your server`)
            .setDescription("A high-performance audio and management node.")
            .addFields(
                { 
                    name: "", 
                    value: `**[Authorize ${client.user.username}](${inviteLink})**`,
                    inline: false 
                }
            )
            .setColor("#2F3136") 
            .setThumbnail(client.user.displayAvatarURL());

        message.channel.send({ embeds: [inviteEmbed] });
    }
	
	// --- SAY COMMAND ---
    if (cmd === "say") {
        if (!voice) {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle("❌ You must be in a voice channel!")
                    .setColor(Colors.Red)
            ]});
        }

        if (serverQueue && serverQueue.player) {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle("❌ Already Playing!")
                    .setDescription("Something is already playing. Use `?clear` and `?stop` first before using this command.")
                    .setColor(Colors.Red)
            ]});
        }

        const text = args.join(" ");
        if (!text) {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle("❌ No text provided!")
                    .setDescription(`Usage: \`${PREFIX}say [your message]\``)
                    .setColor(Colors.Red)
            ]});
        }

        if (text.length > 200) {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setDescription("❌ | **Text too long. Keep it under 200 characters.**")
                    .setColor(Colors.Red)
            ]});
        }

        const node = shoukaku.nodes.get("Localhost");
        if (!node || node.state !== 1) {
            return message.channel.send({ embeds: [
                new EmbedBuilder()
                    .setTitle("❌ Connection Error")
                    .setDescription("The music server is currently reconnecting. Please wait and try again.")
                    .setColor(Colors.Red)
            ]});
        }

		const chunks = text.match(/.{1,150}(\s|$)/g) || [text]
		
		try {
			const ttsPlayer = await shoukaku.joinVoiceChannel({
                guildId: message.guild.id,
                channelId: voice.id,
                shardId: message.guild.shardId,
                deaf: true
            });
			
			const sayEmbed = new EmbedBuilder()
                .setAuthor({ name: "Voice Announcement", iconURL: client.user.displayAvatarURL() })
                .setDescription(`🔊 **Speaking in** ${voice.name}\n\n> ${text}`)
                .addFields(
                    { name: "🌸 Requested by", value: `${message.author}`, inline: true },
                    { name: "📢 Channel", value: `\`${voice.name}\``, inline: true }
                )
                .setColor(ranc())
                .setFooter({ text: `${client.user.username} • Voice Announcement` });

            await message.channel.send({ embeds: [sayEmbed] });
			
			for (const chunk of chunks) {
				let fixedChunk = chunk.toLowerCase()
                // --- CORE GRAMMAR & PRONUNCIATION ---
                .replace(/\bthora\b/g, "to-ra")
                .replace(/\bmasla\b/g, "muss-la")
                .replace(/\bkar\b/g, "kurr")
                .replace(/\bkya\b/g, "ki-ya")
                .replace(/\bhai\b/g, "hayy")
                .replace(/\btheek\b/g, "teek")
                .replace(/\bmere\b/g, "may-ray")
                .replace(/\bkaro\b/g, "ka-ro")
                .replace(/\btum\b/g, "toom")
                .replace(/\bloog\b/g, "loh-g")
                .replace(/\bnahi\b/g, "na-hee")
                .replace(/\bacha\b/g, "uh-cha")
                .replace(/\bkaam\b/g, "ka-m")
                .replace(/\bbaat\b/g, "baa-t")
                .replace(/\byaar\b/g, "yaa-r")
                .replace(/\bkhelo\b/g, "khay-lo")
                .replace(/\bpehle\b/g, "peh-lay")
                .replace(/\bsharam\b/g, "shu-rum")

                // --- VALORANT TOXICITY & ABUSE ---
                .replace(/\bgandu\b/g, "gaan-doo")
                .replace(/\bchutiya\b/g, "choo-tee-ya")
                .replace(/\bsaale\b/g, "saa-lay")
                .replace(/\bkamine\b/g, "ka-mee-nay")
                .replace(/\bbsdk\b/g, "bo-sun-dee-kay")
                .replace(/\blowda\b/g, "loh-da")
                .replace(/\bharaami\b/g, "ha-raa-mee")
                .replace(/\bkanjar\b/g, "kun-jur")
                .replace(/\bganda\b/g, "gun-dah")

                // --- GAME CALLOUTS ---
                .replace(/\bpiche\b/g, "pee-chay")
                .replace(/\bdekh\b/g, "day-kh")
                .replace(/\bjao\b/g, "jaa-o")
                .replace(/\bao\b/g, "aa-o")
                .replace(/\brush\b/g, "ru-shh")
                .replace(/\brevive\b/g, "re-waa-eev")
                .replace(/\baim\b/g, "ay-m")
                .replace(/\bnoob\b/g, "noo-b")
				.replace(/\baim\b/g, "aim")
				.replace(/\baym\b/g, "aim")
				.replace(/\bnoob\b/g, "noob")
                .replace(/\bbot\b/g, "bought");
					
				
                const randomSpeed = (Math.random() * (1.1 - 0.9) + 0.9).toFixed(2);
                const voiceVariants = ["hi", "hi-IN"];
                const randomTL = voiceVariants[Math.floor(Math.random() * voiceVariants.length)];
                
                const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(fixedChunk.trim())}&tl=${randomTL}&client=tw-ob&ttsspeed=${randomSpeed}`;
                
                const result = await node.rest.resolve(ttsUrl);
                const track = result?.data;
                
                if (track?.encoded) {
                    await ttsPlayer.setFilters({
                        timescale: { pitch: 0.96, rate: 1.04, speed: 1.0 }
                    });

                    await ttsPlayer.playTrack({ track: { encoded: track.encoded } });
                    
                    await new Promise((resolve) => {
                        ttsPlayer.once("end", () => {
                            const breath = Math.floor(Math.random() * (800 - 300) + 300);
                            setTimeout(resolve, breath); 
                        });
                        setTimeout(resolve, 15000); 
                    });
                }
            }
			
			setTimeout(async () => {
                try {
                    await shoukaku.leaveVoiceChannel(message.guild.id);
                } catch (e) {}
            }, 1000);

        } catch (err) {
            console.error("TTS Error:", err);
            try { await shoukaku.leaveVoiceChannel(message.guild.id); } catch (e) {}
            return message.reply("❌ Error playing TTS.");
        }
    }

    // --- HELP ---
    if (cmd === "help" || cmd === "h") {
		const botName = client.user.username;
        const helpEmbed = new EmbedBuilder()
            .setAuthor({
				name: `The Rhythm of ${client.user.username}`,
				iconURL: client.user.displayAvatarURL()
			})
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
Be in a voice channel so the rhythm can find you. 🎧`
        )
            .setColor(Colors.Blurple)
			.setFooter({ text: `${botName} • Made with ❤️` });
        message.channel.send({ embeds: [helpEmbed] });
    }
});

// --- CORE PLAY FUNCTION ---
async function playTrack(guildId, track) {
    const serverQueue = queue.get(guildId);
	if (!serverQueue || !serverQueue.player) return;
	
    if (!track) {
		if (serverQueue.autoQueue && serverQueue.lastTrack) {
			const node = shoukaku.nodes.get("Localhost");
			if (node && node.state === 1) {
				try {
					//spotify keep fix if remove so uncommnet next line and remove if function 
					//const identifier = serverQueue.lastTrack.info.identifier;
					let identifier = serverQueue.lastTrack.info.identifier;
					if (serverQueue.lastTrack.info.sourceName === 'spotify') {
						const search = await node.rest.resolve(`ytsearch:${serverQueue.lastTrack.info.title} ${serverQueue.lastTrack.info.author} audio`);
						if (search.data?.[0]) identifier = search.data[0].info.identifier;
					}
					
					const radioUrl = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
                    const res = await node.rest.resolve(radioUrl);
					
					if (!playedTracks.has(guildId)) playedTracks.set(guildId, new Set());
                    const history = playedTracks.get(guildId);
					
					const nextTrack = res?.data?.tracks?.find(t => !history.has(t.info.identifier));

                    if (nextTrack) {
						nextTrack.requester = { toString: () => `<@${client.user.id}>` };
						history.add(nextTrack.info.identifier);
						if (history.size > 50) history.delete(history.values().next().value);
						serverQueue.songs.push(nextTrack);
						return playTrack(guildId, serverQueue.songs[0])
					}
				} catch (err) {
					console.error("Radio auto-queue failed:", err.message);
				}
			}
		}
		
		client.user.setPresence({
			status: "idle",
			activities: [{ name: BOT_STATUS, type: ActivityType.Listening }]
		});
		
		shoukaku.leaveVoiceChannel(guildId); // anti 247 vc
		queue.delete(guildId);               // anti 247 vc
		playedTracks.delete(guildId);
		
		const endEmbed = new EmbedBuilder()
		    .setAuthor({
				name: 'The queue has ended', 
                iconURL: 'https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif' 
            })
			.setColor(ranc());
			
			try {
				return await serverQueue.textChannel.send({ embeds: [endEmbed] });
			} catch (err) {
				console.error(`Failed to send endEmbed in guild ${guildId}: Missing Access.`);
				return;
			}
	}

    // 1. Start the music
    await serverQueue.player.playTrack({ track: { encoded: track.encoded } });
	serverQueue.lastTrack = track;
	
	// 2. Set Dynamic Status
    client.user.setPresence({
        activities: [{
            name: `${track.info.title}`,
            type: ActivityType.Streaming,
			url: track.info.uri
        }],
        status: "online"
    });

    // Handle song end
    serverQueue.player.once('end', (data) => {
        if (data.reason === "REPLACED") return;
        if (!serverQueue.loop) {
			serverQueue.previousTrack = serverQueue.songs[0];
			serverQueue.songs.shift();
		}
        playTrack(guildId, serverQueue.songs[0]);
    });

    const validDuration = track.info.length && isFinite(track.info.length) ? track.info.length : 0;
	
    const fields = [
        { name: '🎙️ Artist', value: `\`${track.info.author}\``, inline: true },
        { name: '⏳ Duration', value: `\`${prettyMilliseconds(validDuration, { colonNotation: true })}\``, inline: true },
		{ name: '🌸 **Senpai**', value: `${track.requester}`, inline: true },
    ];

    if (serverQueue.songs[1]) {
        fields.push({ name: '📋 Up Next', value: `\`${serverQueue.songs[1].info.title}\``, inline: false });
    }

    const playEmbed = new EmbedBuilder()
        .setAuthor({ 
            name: '🎶 Now playing ♪', 
            iconURL: 'https://cdn.discordapp.com/attachments/1113847977048543357/1216129891863629824/music.gif' 
        })
        .setTitle(track.info.title)
        .setURL(track.info.uri)
        .setColor(ranc())
        .setThumbnail(track.info.artworkUrl || null)
        .addFields(fields);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary)
    );

    serverQueue.textChannel.send({ embeds: [playEmbed], components: [row] });
}

// --- LOAD SLASH COMMANDS ---
const slashManager = require("./slash.js");
slashManager(client, shoukaku, queue, playedTracks, playTrack, ranc, guildData, saveGuildData, PREFIX);

client.login(TOKEN);

// --- HEARTBEAT MONITOR ---
setInterval(() => {
    const node = shoukaku.nodes.get("Localhost");
    if (node && node.state === 1) { 
        console.log("💓 Heartbeat: Localhost node is healthy.");
    }
}, 600000);

// BUTTONS 
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue || !serverQueue.player) {
        return interaction.reply({ content: "❌ Nothing is playing right now.", flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId) {
        return interaction.reply({ content: "❌ You must be in my voice channel!", flags: [MessageFlags.Ephemeral] });
    }

    switch (interaction.customId) {
        case "previous":
            if (!serverQueue.previousTrack) {
                return interaction.reply({ content: "❌ No previous track found.", flags: [MessageFlags.Ephemeral] });
            }
            const prev = serverQueue.previousTrack;
            const current = serverQueue.songs[0];
            serverQueue.songs.shift();
            serverQueue.songs.unshift(prev);
            serverQueue.songs.unshift(current);
            serverQueue.previousTrack = null;
            serverQueue.player.stopTrack();
            await interaction.reply({ content: "⏮️ Playing previous track...", flags: [MessageFlags.Ephemeral] });
            break;

        case "pause":
            const isPaused = !serverQueue.player.paused;
            serverQueue.player.setPaused(isPaused);
            await interaction.reply({ content: isPaused ? "⏸️ Paused." : "▶️ Resumed.", flags: [MessageFlags.Ephemeral] });
            break;

        case "stop":
            const gId = interaction.guildId;
            queue.delete(gId);
            playedTracks.delete(gId);
            
            try {
                shoukaku.leaveVoiceChannel(gId);
                
                client.user.setPresence({
                    status: "idle",
                    activities: [{
                        name: BOT_STATUS, 
                        type: ActivityType.Listening
                    }]
                });
            } catch (e) {
                console.error("Error leaving channel via button:", e);
            }

            await interaction.reply({ 
                content: "⏹️ Queue cleared and stopped.", 
                flags: [MessageFlags.Ephemeral] 
            });
            break;

        case "loop":
            serverQueue.loop = !serverQueue.loop;
            await interaction.reply({ 
                content: serverQueue.loop ? "🔂 Loop: On" : "🔁 Loop: Off", 
                flags: [MessageFlags.Ephemeral] 
            });
            break;

        case "skip":
            serverQueue.player.stopTrack();
            await interaction.reply({ content: "⏭️ Skipping track...", flags: [MessageFlags.Ephemeral] });
            break;
    }
});