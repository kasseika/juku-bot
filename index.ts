import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai'


const DISCORD_TOKEN = Bun.env.DISCORD_TOKEN;
const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY;
const questionChannelId = Bun.env.question_channel_id;

// Gemini 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY as string)

async function askGemini(prompt:string) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' })
        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()
        return text
    } catch(e) {
        console.error(e);
        return 'エラーが発生しました。'
    }
}

// 過去ログを取得する関数
const fetchChannelLogs = async (
    channel: TextChannel,
    period: 'week' | 'all'
  ): Promise<string> => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000; // 過去1週間
    const allLogs: string[] = [];
    let lastMessageId: string | undefined;
  
    while (true) {
      const options: { limit: number; before?: string } = { limit: 100 };
      if (lastMessageId) options.before = lastMessageId;
  
      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;
  
      for (const msg of messages.values()) {
        if (
          period === 'all' ||
          (period === 'week' && msg.createdTimestamp > oneWeekAgo)
        ) {
          allLogs.push(`[${msg.author.tag}] ${msg.content}`);
        }
      }
  
      lastMessageId = messages.last()?.id;
    }
  
    return allLogs.join('\n');
  };

// Discordクライアントの初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 過去ログをすべて取得する再帰関数
const fetchAllMessages = async (channel: TextChannel): Promise<string[]> => {
  let lastMessageId: string | undefined;
  const allMessages: string[] = [];

  while (true) {
    const options = { limit: 100, before: lastMessageId };
    const messages = await channel.messages.fetch(options);

    if (messages.size === 0) break;

    for (const msg of messages.values()) {
        allMessages.push(`[${msg.author.tag}]: ${msg.content}`);
      }
    lastMessageId = messages.last()?.id;
  }

  return allMessages;
};

// ボットが準備完了時に呼び出される
client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
});


// メッセージ受信時に呼び出される
client.on('messageCreate', async (message) => {
    console.log(`メッセージを受信: ${message.channel.id}, ${message.content}`);

    if (message.content === '!fetchLogs') {
        try {
        if (message.channel.isTextBased() && message.channel.type === 0) {
            const channel = message.channel as TextChannel; // テキストチャンネルとしてキャスト
            const logs = await fetchAllMessages(channel);

            console.log(`取得したメッセージ数: ${logs.length}`);
            message.reply(`過去ログを取得しました！ メッセージ数: ${logs.length}`);
        } else {
            message.reply('このコマンドはテキストチャンネルでのみ使用可能です。');
        }
        } catch (error) {
        console.error('エラー:', error);
        message.reply('過去ログの取得に失敗しました。');
        }
    }

    // 何でも質問チャンネルでの質疑応答
    if (
        message.channel.id === questionChannelId && // チャンネルIDが一致するか
        client.user && message.mentions.has(client.user) && // メッセージ内にボットがメンションされているか
        !message.author.bot // 投稿者がボットでないか
        ) {
        try {
            // 返信メッセージ
            const question = message.content;
            const prompt = `あなたはIT活用塾のAI塾長です。Discord上の質問チャンネル上で、以下のことを考慮して質問に回答せよ。
            ## 制約条件
            - 塾生からの質問に対してわかりやすい答えを提供すること
            - 調べたほうがいいこと(Webの検索ワード等も添える)、次に取るべきアクションの提案
            - 倫理的に反することには回答しない
            - 結果はDiscordのマークダウン形式でわかりやすく提供せよ

            ## 質問内容
            ${question}`;
            
            const reply = await askGemini(prompt);
            console.log('thinking...');
            await message.reply(reply);
        } catch (error) {
            console.error('エラーが発生しました:', error);
        }
        }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
  
    if (interaction.commandName === 'ping') {
      await interaction.reply('Pong!');
    }

    if (interaction.commandName === 'summarize') {
        try {
            const period = interaction.options.getString('period') as 'week' | 'all';
            if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
                await interaction.reply('このコマンドはテキストチャンネルでのみ使用できます。');
                return;
            }
            await interaction.deferReply(); // 時間のかかる処理を行うため応答を遅延
            const log = await fetchChannelLogs(interaction.channel, period);
            const prompt = `あなたはIT活用塾のAI塾長です。Discord上の個別の活動チャンネルに対して、以下のことを考慮して内容をまとめよ。
            ## 制約条件
            - あなたの目的は塾生の活動ログをわかりやすくまとめ、塾生の振り返りの質を高めることです。
            - 活動ログの期間は${period === 'week' ? "1週間" : "全期間"}
            - 塾生の活動に対してあなたの評価を述べてください。
            - 調べたほうがいいこと(Webの検索ワード等も添える)、次に取るべきアクションの提案
            - 倫理的に反することには回答しない
            - 結果はDiscordのマークダウン形式でわかりやすく提供せよ
            
            ## 活動ログ
            ${log}`;
            
            const summary = await askGemini(prompt);
            
            await interaction.editReply(summary);
        } catch (e) {
            console.error('エラー:', e);
            await interaction.reply('要約中にエラーが発生しました。');
        }
      }
  });

// ボットのログイン
client.login(DISCORD_TOKEN);
