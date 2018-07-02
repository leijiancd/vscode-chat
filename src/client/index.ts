import { WebClient } from "@slack/client";
import { SlackUsers, SlackChannel, SlackMessages } from "../interfaces";

const HISTORY_LIMIT = 50;

export const getMessage = (raw: any) => {
  const { file, ts, user, text, edited, subtype } = raw;
  let parsed = {};

  if (subtype === "bot_message") {
    const { bot_id } = raw;
    parsed[ts] = {
      userId: bot_id,
      timestamp: ts,
      // Handles just one attachment -- need to see examples that have >1
      text: raw.attachments ? raw.attachments[0].text : "",
      color: raw.attachments ? raw.attachments[0].color : ""
    };
  } else {
    const attachment = file
      ? { name: file.name, permalink: file.permalink }
      : null;
    parsed[ts] = {
      userId: user,
      timestamp: ts,
      text: text,
      isEdited: !!edited,
      attachment
    };
  }

  return parsed;
};

export default class SlackAPIClient {
  client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  getConversationHistory = (channel: string): Promise<SlackMessages> => {
    return this.client
      .apiCall("conversations.history", { channel, limit: HISTORY_LIMIT })
      .then((response: any) => {
        const { messages, ok } = response;
        let result = {};

        if (ok) {
          messages.forEach(message => {
            result = {
              ...result,
              ...getMessage(message)
            };
          });
        }

        return result;
      });
  };

  getAllUsers(): Promise<SlackUsers> {
    // TODO(arjun): This might need some pagination?
    return this.client.apiCall("users.list", {}).then((response: any) => {
      const { members, ok } = response;
      let users = {};

      if (ok) {
        members.forEach(member => {
          users[member.id] = {
            id: member.id,
            name: member.name,
            imageUrl: member.profile.image_72
          };
        });

        return users;
      }
    });
  }

  getBotInfo(botId: string): Promise<SlackUsers> {
    return this.client
      .apiCall("bots.info", { bot: botId })
      .then((response: any) => {
        const { bot, ok } = response;
        let users = {};

        if (ok) {
          const { id, name, icons } = bot;
          users[bot.id] = {
            id,
            name,
            imageUrl: icons.image_72,
            isBot: true
          };
        }

        return users;
      });
  }

  getChannels(users: SlackUsers): Promise<SlackChannel[]> {
    const channels = this.client
      .apiCall("channels.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, channels } = response;
        if (ok) {
          return channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            type: "channel"
          }));
        }
      });
    const groups = this.client
      .apiCall("groups.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, groups } = response;
        if (ok) {
          // TODO(arjun): Handle is_mpim case, for private groups
          return groups.map(group => ({
            id: group.id,
            name: group.name,
            type: "group"
          }));
        }
      });
    const directs = this.client.apiCall("im.list", {}).then((response: any) => {
      const { ok, ims } = response;
      if (ok) {
        return ims.map(im => ({
          id: im.id,
          name: users[im.user].name,
          type: "im"
        }));
      }
    });
    return Promise.all([channels, groups, directs]).then(
      (values: SlackChannel[][]) => {
        return [].concat(...values);
      }
    );
  }

  sendMessage = ({ channel, text }): Promise<any> => {
    return this.client.chat.postMessage({
      channel,
      text,
      as_user: true
    });
  };
}
