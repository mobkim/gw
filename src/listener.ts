import { Client, TextChannel, User } from 'discord.js';
import { listens, listened, clean } from './database.js';
import { log } from './logger.js';
import { GEEKHACK_BASE, FOOTER_ICON } from './config.js';
import { topicPostEmbed } from './embeds.js';

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

async function processTopic(client: Client, topic_id: number, post: number, topic_title: string): Promise<void> {
  const $ = await fetchPage(`${GEEKHACK_BASE}/index.php?topic=${topic_id}.${post}`);
  if (!$) return;

  // Determine page number for pagination
  let page = 1;
  try {
    const pagelinks = $('div.pagelinks.floatleft');
    if (pagelinks.length > 0) {
      const contents = pagelinks.contents();
      const lastText = contents.last().text().trim();
      page = parseInt(lastText, 10);
    }
  } catch {
    page = 1;
  }

  let pi = 0;
  if (page !== 1) {
    pi = (page * 50) - 50;
  }

  const infoDivs = $('div.keyinfo');
  const startIndex = post - pi;

  for (let i = startIndex; i < infoDivs.length; i++) {
    const postWrapper = infoDivs.eq(i).closest('div.post_wrapper').length > 0
      ? infoDivs.eq(i).closest('div.post_wrapper')
      : infoDivs.eq(i).parent().closest('div.post_wrapper');

    if (postWrapper.length === 0) continue;

    const posterDiv = postWrapper.find('div.poster').first();
    if (posterDiv.length === 0) continue;

    const threadStarter = posterDiv.find('li.threadstarter');
    if (threadStarter.length === 0) continue;

    const innerDiv = postWrapper.find('div.inner').first();
    if (innerDiv.length === 0) continue;

    // Remove blockquotes from text
    const tempInner = innerDiv.clone();
    tempInner.find('blockquote').remove();
    tempInner.find('div.topslice_quote').remove();
    let response = tempInner.text().trim();
    response = response.replace(/\n{3,}/g, '\n\n');

    // Find replied-to users
    const replyList: string[] = [];
    innerDiv.find('div.topslice_quote').each((_, qEl) => {
      const text = $(qEl).text();
      const onIdx = text.indexOf('on');
      if (onIdx > 12) {
        replyList.push(text.slice(12, onIdx - 1));
      }
    });

    const quoted = replyList.length > 0 ? replyList.join(' & ') : '';
    const kind = quoted ? `Response to ${quoted}` : 'Direct Post';

    let image = '';
    try {
      const highslide = postWrapper.find('a.highslide').first();
      if (highslide.length > 0) {
        image = highslide.attr('href') || '';
      }
    } catch {
      image = '';
    }

    let opIcon = '';
    try {
      const avatar = postWrapper.find('li.avatar img.avatar').first();
      if (avatar.length > 0) {
        opIcon = avatar.attr('src') || '';
      }
    } catch {
      opIcon = '';
    }

    const opScore = posterDiv.find('li.postcount').text().replace('Posts: ', '');
    const opName = posterDiv.find('a').text().trim();

    const smalltext = posterDiv.find('div.smalltext').text();
    const cleanTime = smalltext.replace('« ', '').replace(' »', '');
    const replyNumIdx = cleanTime.indexOf(' on: ');
    const datePart = replyNumIdx !== -1 ? cleanTime.slice(replyNumIdx + 5) : cleanTime;
    const replyNumPart = replyNumIdx !== -1 ? cleanTime.slice(0, replyNumIdx + 5).replace(' on: ', '').replace('Reply ', '') : '';
    const timestamp = `${datePart} | ${replyNumPart}`;

    let msgHref = '';
    try {
      const msgLink = posterDiv.find('h5 a').first();
      if (msgLink.length > 0) {
        const msg = msgLink.attr('href') || '';
        const hashIdx = msg.indexOf('#');
        if (hashIdx !== -1) {
          const msgn = msg.slice(hashIdx + 1);
          msgHref = `${GEEKHACK_BASE}/index.php?topic=${topic_id}.${msgn}#${msgn}`;
        }
      }
    } catch {
      // ignore
    }

    if (!msgHref) {
      msgHref = `${GEEKHACK_BASE}/index.php?topic=${topic_id}.${post}`;
    }

    const embed = topicPostEmbed(kind, msgHref, response, topic_title, opName, opScore, opIcon, image, timestamp);

    const listeningDocs = await listens();
    const matchedDoc = listeningDocs.find(l => l.topic_id === topic_id);
    if (!matchedDoc) continue;

    if (matchedDoc.to.channel && matchedDoc.to.channel.length > 0) {
      for (const address of matchedDoc.to.channel.map(String)) {
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

    if (matchedDoc.to.dm && matchedDoc.to.dm.length > 0) {
      for (const address of matchedDoc.to.dm.map(String)) {
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

    break;
  }
}

export function startListener(client: Client): void {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      const recent$ = await fetchPage(`${GEEKHACK_BASE}/index.php?action=recenttopics`);
      if (!recent$) {
        running = false;
        return;
      }

      const recentTopics: Array<{ topic: string; topic_id: number; op_id: number; poster_id: number; post: number }> = [];

      recent$('tr[class*="windowbg"]').each((_, el) => {
        const links = recent$(el).find('a');
        if (links.length < 5) return;

        const t = links[2].attribs.href || '';
        const op = links[4].attribs.href || '';
        const lp = links[1].attribs.href || '';

        const topic = links[2].children[0]?.toString() || '';
        const topicMatch = t.match(/topic=(\d+)/);
        if (!topicMatch) return;
        const topic_id = parseInt(topicMatch[1], 10);

        const opIdMatch = op.match(/u=(\d+)/);
        const op_id = opIdMatch ? parseInt(opIdMatch[1], 10) : 0;

        const posterIdMatch = lp.match(/u=(\d+)/);
        const poster_id = posterIdMatch ? parseInt(posterIdMatch[1], 10) : 0;

        const smalltexts = recent$(el).find('td.smalltext');
        const postText = smalltexts.first().text().trim();
        const post = parseInt(postText, 10) || 0;

        if (post === 0) return;

        recentTopics.push({ topic, topic_id, op_id, poster_id, post });
      });

      recentTopics.reverse();

      const listeningDocs = await listens();
      const tasks: Promise<void>[] = [];

      for (const rt of recentTopics) {
        const matched = listeningDocs.find(l => l.topic_id === rt.topic_id);
        if (!matched) continue;

        if (rt.post !== matched.last) {
          tasks.push(listened(rt.topic_id, rt.post).catch(() => {}));

          if (rt.poster_id !== rt.op_id) continue;

          tasks.push(processTopic(client, rt.topic_id, rt.post, rt.topic));
        }
      }

      await Promise.all(tasks);
    } catch (err) {
      log(`Listener error: ${err}`);
    } finally {
      running = false;
    }
  }

  setInterval(tick, 60000);
  log('Listener started');
}
