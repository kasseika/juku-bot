import { Client, Collection, ApplicationCommandOptionType } from "discord.js";
import type {ApplicationCommand, ApplicationCommandData, Snowflake,} from "discord.js";


/**
 * コマンドを登録する関数
 * @param client Discord.jsのクライアントインスタンス
 * @param commands 登録するアプリケーションコマンドのデータ
 * @param guildID ギルドID（省略可能）
 * @returns 登録されたコマンドのコレクション
 */
async function register(
  client: Client,
  commands: ApplicationCommandData[],
  guildID?: Snowflake
): Promise<Collection<string, ApplicationCommand>> {
  if (guildID == null) {
    return client.application?.commands.set(commands) || new Collection();
  }
  return client.application?.commands.set(commands, guildID) || new Collection();
}

const ping: ApplicationCommandData = {
  name: "ping",
  description: "pong!",
};

const summarize: ApplicationCommandData = {
  name: "summarize",
  description: "チャンネルの内容を要約します。個別チャンネルで振り返りを行うことを想定しています。",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "period",
      description: "要約する期間を指定してください。",
      required: true,
      choices: [
        {
          name: "1週間",
          value: "week",
        },
        {
          name: "全期間",
          value: "all",
        },
      ],
    },
  ],
};

const commands: ApplicationCommandData[] = [ping, summarize];

const client = new Client({
  intents: []
});

client.token = Bun.env.DISCORD_TOKEN || "";

async function main() {
  if (!client.token) {
    console.error("Discord トークンが設定されていません。");
    return;
  }

  client.once("ready", async () => {
    try {
      if (!client.application) {
        console.error("Client application is not available.");
        return;
      }

      await client.application.fetch();
      const guildID = Bun.env.guild_id as Snowflake | undefined;
      await register(client, commands, guildID);
      console.log("registration succeed!");
    } catch (err) {
      console.error("Error during command registration:", err);
    }
  });

  await client.login(client.token);
}

main().catch((err) => console.error("Error in main function:", err));