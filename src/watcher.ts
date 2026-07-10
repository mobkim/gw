import { Client, TextChannel, User } from 'discord.js';
import { watches, watched, clean } from './database.js';
import { log } from './logger.js';
import { GEEKHACK_BASE, FOOTER_ICON } from './config.js';
import { boardNewTopicEmbed } from './embeds.js';

import * as cheerio from 'cheerio';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.87 Safari/537.36' };

async function fetchPage(url: string): Promise<cheerio.CheerioAPI | null> {
  try {
    const signal = AbortSignal.timeout(5000);
    const resp = await fetch(url, { headers: HEADERS, signal });
    if (!resp.ok) return null;
    const text = await resp.text();
    return cheerio.load(text);
  } catch {
    return null;
  }
}

async function processBoard(client: Client, board: Awaited<ReturnType<typeof watches>>[number]): Promise<void> {
  const boardId = board.board_id;
  const latest = board.last;

  const $ = await fetchPage(`${GEEKHACK_BASE}/index.php?board=${boardId}.0;sort=last_post;desc`);
  if (!$) return;

  const front: number[] = [];
  $('td.subject.windowbg2').each((_, el) => {
    const href = $(el).find('a').attr('href') || '';
    const match = href.match(/topic=(\d+)/);
    if (match) front.push(parseInt(match[1], 10));
  });
  front.sort((a, b) => a - b);

  // A freshly-watched board has last: 0 — set the baseline silently instead of
  // announcing every topic on the front page
  if (latest === 0) {
    if (front.length > 0) {
      await watched(boardId, front[front.length - 1]);
    }
    return;
  }

  for (const tid of front) {
    if (tid <= latest) continue;

    const url = `${GEEKHACK_BASE}/index.php?topic=${tid}.0`;
    const page$ = await fetchPage(url);
    if (!page$) continue;

    const opDiv = page$('div.poster').first();
    if (opDiv.length === 0) continue;

    const opName = opDiv.find('a').text().trim();
    const opHref = opDiv.find('a').attr('href') || '';
    const uMatch = opHref.match(/u=(\d+)/);
    const profileUrl = uMatch ? `${GEEKHACK_BASE}/index.php?action=profile;u=${uMatch[1]}` : '';

    const smalltext = page$('div.keyinfo div.smalltext').text().trim();
    const date = smalltext.slice(7, smalltext.length - 2);
    const posts = opDiv.find('li.postcount').text().replace('Posts: ', '');
    const title = page$('div.keyinfo a').text().trim();

    try {
      const opFlair = opDiv.find('li.membergroup img').attr('src') || '';
      const highspins = page$('a.highslide');
      let image = '';
      if (highspins.length > 1) {
        image = highspins[1].attribs.href || '';
      } else if (highspins.length > 0) {
        image = highspins[0].attribs.href || '';
      } else {
        image = `${GEEKHACK_BASE}/Themes/Nostalgia/images/banner.png`;
      }
      if (image && image.includes('https://geekhack.org/index.php?')) {
        image = `${GEEKHACK_BASE}/index.php?${image.slice(image.indexOf('action'))}`;
      }

      let color = 0xd4a017;
      if (title.includes('IC')) {
        color = 0xe67e22;
      } else if (title.includes('GB')) {
        color = 0x1abc9c;
      }

      const embed = boardNewTopicEmbed(title, url, opName, posts, opFlair, profileUrl, date, image, color);

      if (board.to.channel && board.to.channel.length > 0) {
        for (const address of board.to.channel.map(String)) {
          try {
            const channel = client.channels.cache.get(address);
            if (!channel || !(channel instanceof TextChannel)) {
              clean('channel', address);
              continue;
            }
            await channel.send({ embeds: [embed] }).catch(() => {});
          } catch {
            clean('channel', address);
          }
        }
      }

      if (board.to.dm && board.to.dm.length > 0) {
        for (const address of board.to.dm.map(String)) {
          try {
            const user = await client.users.fetch(address);
            await user.send({ embeds: [embed] }).catch(() => {
              clean('dm', address);
            });
          } catch {
            clean('dm', address);
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Update last
  if (front.length > 0) {
    await watched(boardId, front[front.length - 1]);
  }
}

export function startWatcher(client: Client): void {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      const boards = await watches();
      const tasks: Promise<void>[] = [];

      for (const board of boards) {
        tasks.push(processBoard(client, board));
      }

      await Promise.all(tasks);
    } catch (err) {
      log(`Watcher error: ${err}`);
    } finally {
      running = false;
    }
  }

  setInterval(tick, 60000);
  log('Watcher started');
}
