import { describe, it, expect, vi, beforeEach } from 'vitest';
import { follow, follows, unfollow, serve, getCollections, unrestrict } from '../src/database.js';
import { handleCommand } from '../src/commands/gw.js';

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
import * as embeds from '../src/embeds.js';

const mockMessages = new Map<string, { content: string; embeds: unknown[] }>();

function createMockMessage(
  content: string,
  options: {
    authorId?: string;
    authorName?: string;
    avatarURL?: string;
    isDM?: boolean;
    isAdmin?: boolean;
    guildId?: string;
    channelId?: string;
    guildChannels?: string[];
  } = {}
) {
  const {
    authorId = 'user1',
    authorName = 'TestUser',
    avatarURL = 'https://example.com/avatar.png',
    isDM = false,
    isAdmin = false,
    guildId = 'guild1',
    channelId = isDM ? 'dm1' : 'channel1',
    guildChannels = [],
  } = options;

  return {
    content,
    author: {
      id: authorId,
      username: authorName,
      displayAvatarURL: () => avatarURL,
      dmChannel: null as unknown,
      send: vi.fn().mockResolvedValue({}),
    },
    channel: {
      id: channelId,
      type: isDM ? 1 : 0,
      send: vi.fn().mockResolvedValue({}),
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
    },
    member: {
      permissions: {
        has: vi.fn().mockReturnValue(isAdmin),
      },
    },
    guild: isDM
      ? null
      : {
          id: guildId,
        },
    delete: vi.fn().mockResolvedValue({}),
    send: vi.fn().mockResolvedValue({}),
  } as unknown as import('discord.js').Message;
}

function getSentEmbeds(message: any): unknown[] {
  const sentCalls = message.author.send.mock.calls;
  if (sentCalls.length > 0) {
    return sentCalls[0][0].embeds;
  }
  const chanCalls = message.channel.send?.mock.calls;
  if (chanCalls && chanCalls.length > 0) {
    return chanCalls[0][0].embeds;
  }
  return [];
}

function getLastSentEmbed(message: any): unknown {
  const sentCalls = message.author.send.mock.calls;
  if (sentCalls.length > 0) {
    return sentCalls[sentCalls.length - 1][0].embeds[0];
  }
  const chanCalls = message.channel.send?.mock.calls;
  if (chanCalls && chanCalls.length > 0) {
    return chanCalls[chanCalls.length - 1][0].embeds[0];
  }
  return null;
}

async function clearCollections() {
  const { following, listening, watching, serving } = getCollections();
  await following.deleteMany({});
  await listening.deleteMany({});
  await watching.deleteMany({});
  await serving.deleteMany({});
}

describe('commands', () => {
  beforeEach(async () => {
    await clearCollections();
    vi.clearAllMocks();
  });

  function checkEmbedType(message: any, expectedType: string): boolean {
    const embed = getLastSentEmbed(message);
    return embed && (embed as any).type === expectedType;
  }

  function checkEmbedTitle(message: any, expectedTitle: string): boolean {
    const embed = getLastSentEmbed(message);
    return embed && (embed as any).title === expectedTitle;
  }

  describe('unknown command', () => {
    it('sends error embed via DM', async () => {
      const message = createMockMessage('.gw foobar', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));
      expect(checkEmbedType(message, 'error')).toBe(true);
      const embed = getLastSentEmbed(message) as any;
      expect(embed.title).toBe('Unrecognized command');
    });
  });

  describe('missing parameter', () => {
    it('sends error embed for follow without parameter', async () => {
      const message = createMockMessage('.gw follow', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));
      expect(checkEmbedType(message, 'error')).toBe(true);
    });

    it('sends error embed for unfollow without parameter', async () => {
      const message = createMockMessage('.gw unfollow', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));
      expect(checkEmbedType(message, 'error')).toBe(true);
    });
  });

  describe('follow topic (DM)', () => {
    it('calls verify, follow, and sends messageEmbed', async () => {
      vi.mocked(verify).mockResolvedValue([
        'My Topic',
        12345,
        '2024-01-01',
        'OPUser',
        1,
        '',
        'https://example.com/icon.png',
        '100',
        'https://example.com/image.png',
      ]);

      const message = createMockMessage('.gw follow 12345', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(verify).toHaveBeenCalledWith('12345');
      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('follow board (DM)', () => {
    it('calls verify, follow, and sends messageEmbed', async () => {
      vi.mocked(verify).mockResolvedValue(['My Board', 5]);

      const message = createMockMessage('.gw follow 5', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(verify).toHaveBeenCalledWith('5');
      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now watching');
    });
  });

  describe('follow topic (channel, admin)', () => {
    it('works when user is admin', async () => {
      vi.mocked(verify).mockResolvedValue([
        'My Topic',
        12345,
        '2024-01-01',
        'OPUser',
        1,
        '',
        'https://example.com/icon.png',
        '100',
        'https://example.com/image.png',
      ]);

      const message = createMockMessage('.gw follow 12345', {
        isDM: false,
        isAdmin: true,
        channelId: 'channel1',
        guildId: 'guild1',
      });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('follow topic (channel, non-admin, restricted)', () => {
    it('returns permission error', async () => {
      const message = createMockMessage('.gw follow 12345', {
        isDM: false,
        isAdmin: false,
        channelId: 'channel1',
        guildId: 'guild1',
      });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(checkEmbedType(message, 'error')).toBe(true);
      const embed = getLastSentEmbed(message) as any;
      expect(embed.title).toBe('No permission');
    });
  });

  describe('follow topic (channel, non-admin, unrestricted)', () => {
    it('works when channel is unrestricted', async () => {
      vi.mocked(verify).mockResolvedValue([
        'My Topic',
        12345,
        '2024-01-01',
        'OPUser',
        1,
        '',
        'https://example.com/icon.png',
        '100',
        'https://example.com/image.png',
      ]);
      await serve('Test Server', 'guild1');
      await unrestrict('guild1', 'channel1');

      const message = createMockMessage('.gw follow 12345', {
        isDM: false,
        isAdmin: false,
        channelId: 'channel1',
        guildId: 'guild1',
      });
      await handleCommand(message, vi.fn().mockResolvedValue(true));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('message');
      expect(embed.title).toBe('Now following');
    });
  });

  describe('following (empty)', () => {
    it('returns followListEmbed with "None"', async () => {
      const message = createMockMessage('.gw following', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('followList');
      expect(embed.topics).toBe('None');
      expect(embed.boards).toBe('None');
    });
  });

  describe('following (with items)', () => {
    it('returns followListEmbed with topics and boards', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);
      await follow('user1', 'My Board', 5, 'user1', ['My Board', 5]);

      const message = createMockMessage('.gw following', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('followList');
      expect(embed.topics).toContain('My Topic');
      expect(embed.boards).toContain('My Board');
    });
  });

  describe('unfollow by index', () => {
    it('calls unfollow and sends removedEmbed', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);

      const message = createMockMessage('.gw unfollow 1', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('removed');
      expect(embed.name).toBe('My Topic');
    });
  });

  describe('unfollow all', () => {
    it('calls unfollow with "all"', async () => {
      await follow('user1', 'My Topic', 12345, 'user1', ['My Topic', 12345]);

      const message = createMockMessage('.gw unfollow all', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('followList');
    });
  });

  describe('help command', () => {
    it('sends commandListEmbed', async () => {
      const message = createMockMessage('.gw help', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('commandList');
    });

    it('commands subcommand also sends help', async () => {
      const message = createMockMessage('.gw commands', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('commandList');
    });
  });

  describe('invite command', () => {
    it('sends inviteEmbed', async () => {
      const message = createMockMessage('.gw invite', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('invite');
    });
  });

  describe('unrestrict', () => {
    it('returns error in DM (must be in channel)', async () => {
      const message = createMockMessage('.gw unrestrict', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(checkEmbedType(message, 'error')).toBe(true);
    });

    it('returns admin-only error for non-admin', async () => {
      const message = createMockMessage('.gw unrestrict', {
        isDM: false,
        isAdmin: false,
        channelId: 'channel1',
        guildId: 'guild1',
      });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(checkEmbedType(message, 'error')).toBe(true);
    });

    it('stores state and sends WARNING for admin', async () => {
      await serve('Test Server', 'guild1');
      const message = createMockMessage('.gw unrestrict', {
        isDM: false,
        isAdmin: true,
        channelId: 'channel1',
        guildId: 'guild1',
      });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      const embed = getLastSentEmbed(message) as any;
      expect(embed.type).toBe('gatekeep');
      expect(embed.msg).toBe('WARNING');
    });
  });

  describe('scraper error codes', () => {
    it('returns 404 embed when verify returns 404', async () => {
      vi.mocked(verify).mockResolvedValue(404);

      const message = createMockMessage('.gw follow 99999', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(checkEmbedType(message, 'error')).toBe(true);
      const embed = getLastSentEmbed(message) as any;
      expect(embed.title).toBe('Could not locate topic or board');
    });

    it('returns 503 embed when verify returns 503', async () => {
      vi.mocked(verify).mockResolvedValue(503);

      const message = createMockMessage('.gw follow 12345', { isDM: true });
      await handleCommand(message, vi.fn().mockResolvedValue(false));

      expect(checkEmbedType(message, 'error')).toBe(true);
      const embed = getLastSentEmbed(message) as any;
      expect(embed.title).toBe('Connection error');
    });
  });
});
