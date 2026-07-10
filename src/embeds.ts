import { EmbedBuilder, ColorResolvable, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } from 'discord.js';
import { FOOTER_ICON, INVITE_URL } from './config.js';

const RED: ColorResolvable = 0xed4245;
const BLURPLE: ColorResolvable = 0x7289da;
const GREYPLE: ColorResolvable = 0x99aab5;
const DARK_GREEN: ColorResolvable = 0x1abc9c;
const DARK_RED: ColorResolvable = 0x992d2d;
const LIGHT_GREY: ColorResolvable = 0x6c757d;
const GOLD: ColorResolvable = 0xffd700;
const DARK_ORANGE: ColorResolvable = 0xe67e22;
const DARK_GOLD: ColorResolvable = 0xd4a017;

type ComponentRow = ActionRowBuilder<ButtonBuilder>;

export function confirmRow(customId: string): ComponentRow {
  return new ActionRowBuilder()
    .addComponents([
      new ButtonBuilder()
        .setCustomId(`${customId}:yes`)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${customId}:no`)
        .setLabel('No')
        .setStyle(ButtonStyle.Danger),
    ]) as ComponentRow;
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(RED);
}

export function followEmbed(
  topic: string,
  topicId: number,
  opName: string,
  opId: number,
  opScore: string,
  opIcon: string,
  opFlair: string,
  image: string,
  date: string,
  avatar: string,
  now: boolean
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(topic)
    .setURL(`https://geekhack.org/index.php?topic=${topicId}.0`)
    .setColor(now ? BLURPLE : RED);

  if (now) {
    embed.setDescription(`Responses from **${opName}** will be sent to this channel`);
    embed.setAuthor({
      name: `Now following: ${opName} (${opScore})`,
      url: `https://geekhack.org/index.php?action=profile;u=${opId}`,
      iconURL: avatar,
    });
    if (opIcon) embed.setThumbnail(opIcon);
    if (image) embed.setImage(image);
    embed.setFooter({ text: 'geekhack | ' + date, iconURL: FOOTER_ICON });
  } else {
    embed.setAuthor({ name: 'This topic is already being followed here' });
  }
  return embed;
}

export function watchEmbed(
  board: string,
  boardId: number,
  avatar: string,
  now: boolean
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(board)
    .setURL(`https://geekhack.org/index.php?board=${boardId}.0`)
    .setColor(now ? BLURPLE : RED);

  if (now) {
    embed.setDescription(`New submissions to **${board}** will now be sent to this channel`);
    embed.setAuthor({ name: 'Now following', iconURL: avatar });
    embed.setFooter({ text: 'geekhack', iconURL: FOOTER_ICON });
  } else {
    embed.setAuthor({ name: 'This board is already being followed here' });
  }
  return embed;
}

export function removedEmbed(
  type: 'topic' | 'board' | 'topic_all' | 'board_all' | 'mixed',
  name: string,
  id: number,
  avatar: string
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(RED);

  if (type === 'topic_all' || type === 'board_all' || type === 'mixed') {
    if (type === 'topic_all') {
      embed.setDescription('Send `.gw follow ` along with a valid topic/board number or url')
        .setAuthor({ name: 'You are no longer following any topics', iconURL: avatar });
    } else if (type === 'board_all') {
      embed.setDescription('Send `.gw follow url/board` to watch a board')
        .setAuthor({ name: 'You are no longer watching any boards', iconURL: avatar });
    }
    return embed;
  }

  const isTopic = id >= 10000;
  embed.setTitle(name)
    .setURL(`https://geekhack.org/index.php?${isTopic ? 'topic' : 'board'}=${id}.0`)
    .setAuthor({
      name: isTopic ? 'No longer following' : 'No longer watching',
      iconURL: avatar,
    });

  return embed;
}

export function watchlistEmbed(topics: string, boards: string, avatar: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BLURPLE)
    .setAuthor({ name: 'Currently following', iconURL: avatar })
    .setFooter({ text: 'geekhack', iconURL: FOOTER_ICON });

  const noTopics = !topics || topics === 'None';
  const noBoards = !boards || boards === 'None';

  embed.addFields({ name: '__Topics__', value: topics || 'None', inline: true });
  embed.addFields({ name: '__Boards__', value: boards || 'None', inline: true });

  if (noTopics && noBoards) {
    embed
      .addFields({ name: 'Want to get started?', value: 'Send `.gw follow ` along with a valid topic/board number or url', inline: false })
      .addFields({ name: 'Need help?', value: 'Send `.gw help` for a full list of commands', inline: false });
  }

  return embed;
}

export function maxErrorEmbed(
  max: number,
  type: 'topic' | 'board',
  list: string,
  avatar: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setAuthor({
      name: type === 'topic'
        ? `You are already following the maximum number of ${max} topics`
        : `You are already watching the maximum number of ${max} boards`,
      iconURL: avatar,
    });

  if (type === 'topic') {
    embed.setDescription(list + '\n\nSend `.gw unfollow #` to remove a topic from your list or `.gw unfollow all` to clear');
  } else {
    embed.setDescription(list + '\n\nSend `.gw unfollow #` to remove a board from your list or `.gw unfollow all` to clear');
  }

  return embed;
}

export function gatekeepEmbed(msg: string): EmbedBuilder {
  switch (msg) {
    case 'WARNING':
      return new EmbedBuilder()
        .setTitle('WARNING')
        .setDescription(
          'You are attempting to unrestrict this channel which will allow anyone with send permissions to call any non-admin command.\n\n **THIS FEATURE IS INTENDED FOR SMALLER PERSONAL SERVERS.**'
        )
        .setColor(RED);

    case 'Channel has been unrestricted':
      return new EmbedBuilder()
        .setTitle('Channel has been unrestricted')
        .setDescription('You can revoke this at any time with `/restrict`')
        .setColor(DARK_GREEN);

    case 'Cancelled':
      return new EmbedBuilder()
        .setTitle('Action cancelled')
        .setDescription('No changes were made')
        .setColor(LIGHT_GREY);

    case 'Channel is already unrestricted':
      return new EmbedBuilder()
        .setTitle('Channel is already unrestricted')
        .setDescription('You can revoke this at any time with `/restrict`')
        .setColor(LIGHT_GREY);

    case 'Channel has been restricted':
      return new EmbedBuilder()
        .setTitle('Channel has been restricted')
        .setColor(DARK_RED);

    case 'Channel is already restricted':
      return new EmbedBuilder()
        .setTitle('Channel is already restricted')
        .setColor(DARK_RED);

    case 'channel':
      return new EmbedBuilder()
        .setTitle('WARNING')
        .setDescription(
          'You are attempting to detach this address which will remove any follow or watch (including other users\') associated to this channel.\n\nUse the buttons below to confirm.'
        )
        .setColor(RED);

    case 'dm':
      return new EmbedBuilder()
        .setTitle('WARNING')
        .setDescription(
          'You are attempting to detach this address which will remove any follow or watch associated to your direct messages.\n\nUse the buttons below to confirm.'
        )
        .setColor(RED);

    case 'Address has been detached':
      return new EmbedBuilder()
        .setTitle('Address has been detached')
        .setColor(DARK_RED);

    default:
      return errorEmbed('Unknown', msg);
  }
}

export function commandListEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('All Commands')
    .setColor(GOLD)
    .setDescription(
      '```.gw follow url/topic/board```\nFollow a topic for post notifications or a board for newly posted topics\n\n' +
      '```.gw following```\nReturns your current follow list\n\n' +
      '```.gw unfollow #```\nUnfollow a topic or board using an index provided by .gw following\n\n' +
      '```.gw unfollow all```\nUnfollow all topics and boards\n\n' +
      '```.gw help```\nReturns the commands list\n\n' +
      '```.gw invite```\nReturns an invite link for the bot\n\n' +
      '__**ADMIN ONLY**__\n\n' +
      '```.gw unrestrict```\nLifts restrictions within a channel, allowing any user to call non-admin commands\n\n' +
      '```.gw restrict```\nRestricts channel, disallowing non-admins to call any command (all channels are restricted by default)\n\n' +
      '```.gw detach```\nRemoves all instances of channel from every list, including from other users (this can also be called via DM)'
    );
}

export function inviteEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Click to invite me into one of your servers!')
    .setURL(INVITE_URL)
    .setColor(0x2ecc71);
}

export function topicPostEmbed(
  kind: string,
  msg_href: string,
  response: string,
  topic: string,
  opName: string,
  opScore: string,
  opIcon: string,
  image: string,
  timestamp: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(kind)
    .setURL(msg_href)
    .setDescription(response)
    .setColor(GREYPLE)
    .setAuthor({ name: `${topic}\n${opName} (${opScore})`, iconURL: opIcon })
    .setFooter({ text: 'geekhack | ' + timestamp, iconURL: FOOTER_ICON });

  if (image) embed.setImage(image);
  return embed;
}

export function messageEmbed(
  title: string,
  response: [string, number, string, string, number, string, string, string, string] | [string, number],
  avatar: string
): EmbedBuilder {
  if (response.length === 2) {
    const [board, board_id] = response;
    return watchEmbed(board, board_id, avatar, title === 'Now watching');
  }

  const [topic, topic_id, date, op_name, op_id, op_flair, op_icon, op_score, image] = response;
  return followEmbed(topic, topic_id, op_name, op_id, op_score, op_icon, op_flair, image, date, avatar, title === 'Now following');
}

export function followListEmbed(topics: string, boards: string, avatar: string): EmbedBuilder {
  return watchlistEmbed(topics, boards, avatar);
}

export function boardNewTopicEmbed(
  title: string,
  url: string,
  opName: string,
  posts: string,
  opFlair: string,
  opHref: string,
  date: string,
  image: string,
  color: ColorResolvable
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(url)
    .setColor(color)
    .setAuthor({ name: `${opName} (${posts})`, iconURL: opFlair, url: opHref })
    .setFooter({ text: 'geekhack | ' + date, iconURL: FOOTER_ICON });

  if (image) embed.setImage(image);
  return embed;
}
