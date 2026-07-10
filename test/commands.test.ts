import { describe, it, expect, vi, beforeEach } from 'vitest';
import { follow, serve, getCollections, unrestrict } from '../src/database.js';
import { handleSlashCommand } from '../src/commands/gw.js';

// Mock embeds module
vi.mock('../src/embeds.js', () => ({
  errorEmbed: vi.fn((title, desc) => ({ title, description: desc, type: 'error' })),
  messageEmbed: vi.fn((title, response, avatar) => ({ title, response, avatar, type: 'message' })),
  followEmbed: vi.fn(() => ({ type: 'follow' })),
  watchEmbed: vi.fn(() => ({ type: 'watch' })),
  maxErrorEmbed: vi.fn((max, type, list, avatar) => ({ type: 'maxError', max, maxType: type })),
  removedEmbed: vi.fn((type, name, id, avatar) => ({ type: 'removed', subType: type, name, id })),
  gatekeepEmbed: vi.fn((msg) => ({ type: 'gatekeep', msg })),
  commandListEmbed: vi.fn(() => ({ type: 'commandList' })),
  followListEmbed: vi.fn((topics, boards, avatar) => ({ type: 'followList', topics, boards })),
  watchlistEmbed: vi.fn((topics, boards, avatar) => ({ type: 'watchlist', topics, boards })),
  inviteEmbed: vi.fn(() => ({ type: 'invite' })),
  topicPostEmbed: vi.fn(() => ({ type: 'topicPost' })),
  boardNewTopicEmbed: vi.fn(() => ({ type: 'boardNewTopic' })),
  confirmRow: vi.fn((customId) => ({ type: 'confirmRow', customId })),
}));

// Mock scraper module
vi.mock('../src/scraper.js', () => ({
  verify: vi.fn(),
  sort: vi.fn(),
  getTopicPage: vi.fn(),
}));

import { verify } from '../src/scraper.js';

function createMockInteraction(
  commandName: string,
  options: {
    userId?: string;
    avatarURL?: string;
    isDM?: boolean;
    isAdmin?: boolean;
    guildId?: string;
    channelId?: string;
    guildChannels?: string[];
    stringOptions?: Record<string, string>;
  } = {}
) {
  const {
    userId = 'user1',
    avatarURL = 'https://example.com/avatar.png',
    isDM = false,
    isAdmin = false,
    guildId = 'guild1',
    channelId = isDM ? 'dm1' : 'channel1',
    guildChannels = [],
    stringOptions = {},
  } = options;

  return {
    commandName,
    user: {
      id: userId,
      displayAvatarURL: () => avatarURL,
    },
    channelId,
    guild: isDM
      ? null
      : {
          id: guildId,
          channels: {
            cache: {
              filter: vi.fn().mockReturnValue({
                map: vi.fn().mockReturnValue(guildChannels),
              }),
            },
          },
        },
    member: isDM
      ? null
      : {
          permissions: {
            has: vi.fn().mockReturnValue(isAdmin),
          },
        },
    client: {
      channels: {
        cache: {
          get: vi.fn().mockReturnValue(undefined),
        },
      },
    },
    options: {
      getString: vi.fn((name: string) => stringOptions[name] ?? null),
    },
    reply: vi.fn().mockResolvedValue({}),
    followUp: vi.fn().mockResolvedValue({}),
    replied: false,
    deferred: false,
  } as unknown as import('discord.js').ChatInputCommandInteraction;
}

function getLastRepliedEmbed(interaction: any): any {
  const calls = interaction.reply.mock.calls;
  if (calls.length === 0) return null;
  return calls[calls.length - 1][0].embeds[0];
}

async function clearCollections() {
  const { following, listening, watching, serving } = getCollections();
  await following.deleteMany({});
  await listening.deleteMany({});
  await watching.deleteMany({});
  await serving.deleteMany({});
}

const TOPIC_RESPONSE: [string, number, string, string, number, string, string, string, string] = [
  'My Topic',
  12345,
  '2024-01-01',
  'OPUser',
  1,
  '',
  'https://example.com/icon.png',
  '100',
  'https://example.com/image.png',
];

describe('slash commands', () => {
  beforeEach(async () => {
    await clearCollections();
    vi.clearAllMocks();
  });

  describe('missing parameter', () => {
    it('sends error embed for follow without target', async () => {
      const interaction = createMockInteraction('follow', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));
      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Missing parameter');
    });

    it('sends error embed for unfollow without index', async () => {
      const interaction = createMockInteraction('unfollow', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));
      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Missing parameter');
    });
  });

  describe('follow topic (DM)', () => {
    it('calls verify, follow, and replies with messageEmbed', async () => {
      vi.mocked(verify).mockResolvedValue(TOPIC_RESPONSE);

      const interaction = createMockInteraction('follow', {
        isDM: true,
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      expect(verify).toHaveBeenCalledWith('12345');
      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('follow board (DM)', () => {
    it('calls verify, follow, and replies with messageEmbed', async () => {
      vi.mocked(verify).mockResolvedValue(['My Board', 5]);

      const interaction = createMockInteraction('follow', {
        isDM: true,
        stringOptions: { target: '5' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      expect(verify).toHaveBeenCalledWith('5');
      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now watching');
    });
  });

  describe('follow topic (channel, admin)', () => {
    it('works when user is admin', async () => {
      vi.mocked(verify).mockResolvedValue(TOPIC_RESPONSE);

      const interaction = createMockInteraction('follow', {
        isAdmin: true,
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('follow topic (channel, non-admin, restricted)', () => {
    it('returns permission error', async () => {
      const interaction = createMockInteraction('follow', {
        isAdmin: false,
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('No permission');
    });
  });

  describe('follow topic (channel, non-admin, unrestricted)', () => {
    it('works when channel is unrestricted', async () => {
      vi.mocked(verify).mockResolvedValue(TOPIC_RESPONSE);
      await serve('Test Server', 'guild1');
      await unrestrict('guild1', 'channel1');

      const interaction = createMockInteraction('follow', {
        isAdmin: false,
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(true));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('follow duplicate within server', () => {
    it('returns error when topic already followed in a guild channel', async () => {
      vi.mocked(verify).mockResolvedValue(TOPIC_RESPONSE);
      await follow('user2', 'My Topic', 12345, 'channel1', ['My Topic', 12345]);

      const interaction = createMockInteraction('follow', {
        isAdmin: true,
        guildChannels: ['channel1'],
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Already followed within this server');
    });
  });

  describe('following (empty)', () => {
    it('replies with followListEmbed containing "None"', async () => {
      const interaction = createMockInteraction('following', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('followList');
      expect(embed.topics).toBe('None');
      expect(embed.boards).toBe('None');
    });
  });

  describe('following (with items)', () => {
    it('replies with followListEmbed containing topics and boards', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);
      await follow('user1', 'My Board', 5, 'user1', ['My Board', 5]);

      const interaction = createMockInteraction('following', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('followList');
      expect(embed.topics).toContain('My Topic');
      expect(embed.boards).toContain('My Board');
    });
  });

  describe('unfollow by index', () => {
    it('calls unfollow and replies with removedEmbed', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);

      const interaction = createMockInteraction('unfollow', {
        isDM: true,
        stringOptions: { index: '1' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('removed');
      expect(embed.name).toBe('My Topic');
    });

    it('replies with bad-index error for out-of-range index', async () => {
      const interaction = createMockInteraction('unfollow', {
        isDM: true,
        stringOptions: { index: '7' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Bad index!');
    });
  });

  describe('unfollow all', () => {
    it('clears the list and replies with followListEmbed', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);

      const interaction = createMockInteraction('unfollow', {
        isDM: true,
        stringOptions: { index: 'all' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('followList');
    });
  });

  describe('help command', () => {
    it('replies with commandListEmbed', async () => {
      const interaction = createMockInteraction('help', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('commandList');
    });
  });

  describe('invite command', () => {
    it('replies with inviteEmbed', async () => {
      const interaction = createMockInteraction('invite', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('invite');
    });
  });

  describe('unrestrict', () => {
    it('returns error in DM (must be in channel)', async () => {
      const interaction = createMockInteraction('unrestrict', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Invalid channel');
    });

    it('returns admin-only error for non-admin', async () => {
      const interaction = createMockInteraction('unrestrict', { isAdmin: false });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Admin only');
    });

    it('stores state and replies WARNING with confirm buttons for admin', async () => {
      await serve('Test Server', 'guild1');
      const interaction = createMockInteraction('unrestrict', { isAdmin: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('gatekeep');
      expect(embed.msg).toBe('WARNING');
      const replyArg = (interaction.reply as any).mock.calls[0][0];
      expect(replyArg.components[0].type).toBe('confirmRow');
    });
  });

  describe('restrict', () => {
    it('returns error in DM (must be in channel)', async () => {
      const interaction = createMockInteraction('restrict', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Invalid channel');
    });

    it('restricts an unrestricted channel for admin', async () => {
      await serve('Test Server', 'guild1');
      await unrestrict('guild1', 'channel1');

      const interaction = createMockInteraction('restrict', { isAdmin: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('gatekeep');
      expect(embed.msg).toBe('Channel has been restricted');
    });
  });

  describe('detach', () => {
    it('allows anyone to detach in DM', async () => {
      const interaction = createMockInteraction('detach', { isDM: true });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('gatekeep');
      expect(embed.msg).toBe('dm');
    });

    it('returns admin-only error for non-admin in channel', async () => {
      const interaction = createMockInteraction('detach', { isAdmin: false });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Admin only');
    });
  });

  describe('scraper error codes', () => {
    it('returns 404 embed when verify returns 404', async () => {
      vi.mocked(verify).mockResolvedValue(404);

      const interaction = createMockInteraction('follow', {
        isDM: true,
        stringOptions: { target: '99999' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Could not locate topic or board');
    });

    it('returns 503 embed when verify returns 503', async () => {
      vi.mocked(verify).mockResolvedValue(503);

      const interaction = createMockInteraction('follow', {
        isDM: true,
        stringOptions: { target: '12345' },
      });
      await handleSlashCommand(interaction, vi.fn().mockResolvedValue(false));

      const embed = getLastRepliedEmbed(interaction);
      expect(embed.type).toBe('error');
      expect(embed.title).toBe('Connection error');
    });
  });
});
