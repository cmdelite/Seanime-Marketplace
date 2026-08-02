/// <reference types="@seanime/extension-types" />

class Provider {
  constructor() {
    this.baseUrl = "https://animexin.dev";
    this.name = "AnimeXin";
  }

  getSettings() {
    return {
      episodeServers: [
        "English", "Indonesian", "Thai", "Arabic",
        "Bangla", "Turkish", "Spanish", "Italian",
        "German", "Portuguese", "Polish"
      ],
      supportsDub: false
    };
  }

  _atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  }

  async search(opts) {
    const results = [];
    const url = `${this.baseUrl}/?s=${encodeURIComponent(opts.query)}`;
    const res = await fetch(url);
    const html = await res.text();
    const regex = /<article class="bs"[^>]*>.*?<a href="([^"]+)"[^>]*>.*?<img src="([^"]+)"[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/gs;
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        id: match[1].trim().split('/').pop() || '',
        title: match[3].trim(),
        url: match[1].trim(),
        subOrDub: "sub"
      });
    }
    return results;
  }

  async findEpisodes(animeId) {
    // Step 1: fetch the main page
    const url = `${this.baseUrl}/anime/${animeId}`;
    const res = await fetch(url);
    const html = await res.text();

    // Step 2: try to find total episode count from the page
    let totalEpisodes = 0;
    const totalMatch = html.match(/Total\s*(?:Episodes?|EP)\s*[:;]?\s*(\d+)/i) ||
                       html.match(/<span[^>]*class\s*=\s*["'][^"']*eps-total[^"']*["'][^>]*>(\d+)<\/span>/i) ||
                       html.match(/Episodes?\s*(\d+)/i);
    if (totalMatch) totalEpisodes = parseInt(totalMatch[1]);

    // Step 3: parse the episode list (with pagination support)
    const allEpisodes = await this._parseAllPages(html, url, totalEpisodes, animeId);

    if (allEpisodes.length === 0) {
      // Step 4: fallback to generic link search
      return this._fallbackEpisodeSearch(html, animeId);
    }

    return allEpisodes;
  }

  // ---- Recursive pagination parser ----
  async _parseAllPages(html, currentUrl, totalEpisodes, animeId) {
    const items = [];
    // Try to find the container with episodes
    const container = this._extractContainer(html);
    if (!container) return [];

    // Extract all <li data-index> from this page
    const liRegex = /<li[^>]*data-index\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    let pageItems = [];
    while ((match = liRegex.exec(container)) !== null) {
      const index = parseInt(match[1]);
      const liContent = match[2];
      const urlMatch = liContent.match(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i);
      if (!urlMatch) continue;
      const epUrl = urlMatch[1].trim();
      // Build absolute URL if needed
      const fullUrl = epUrl.startsWith('http') ? epUrl : `${this.baseUrl}${epUrl.startsWith('/') ? '' : '/'}${epUrl}`;
      const titleMatch = liContent.match(/<div[^>]*class\s*=\s*["'][^"']*eps-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      pageItems.push({ index, url: fullUrl, title });
    }

    if (pageItems.length === 0) return [];

    // Check for "Next" page link
    let nextUrl = null;
    const nextMatch = html.match(/<a[^>]*href\s*=\s*["']([^"']*page[^"']*|\/\d+|\?page=\d+)[^"']*["'][^>]*>.*?(?:Next|下一|→|»).*?<\/a>/i);
    if (nextMatch) {
      let nextHref = nextMatch[1].trim();
      if (nextHref.startsWith('/')) nextHref = this.baseUrl + nextHref;
      else if (!nextHref.startsWith('http')) nextHref = this.baseUrl + '/' + nextHref;
      if (nextHref !== currentUrl) nextUrl = nextHref;
    }

    // If there's a next page, fetch it recursively
    let nextItems = [];
    if (nextUrl) {
      const nextRes = await fetch(nextUrl);
      const nextHtml = await nextRes.text();
      nextItems = await this._parseAllPages(nextHtml, nextUrl, totalEpisodes, animeId);
    }

    // Merge current and next items
    const allItems = [...pageItems, ...nextItems];

    // Deduplicate by URL
    const unique = new Map();
    for (const item of allItems) {
      if (!unique.has(item.url)) unique.set(item.url, item);
    }
    const uniqueItems = Array.from(unique.values());

    // If we have a totalEpisodes, use it; otherwise use the max index + 1
    const total = totalEpisodes > 0 ? totalEpisodes : uniqueItems.length;

    // Map reversed index to actual episode number
    const results = [];
    for (const item of uniqueItems) {
      const epNumber = total - item.index;
      if (epNumber < 1) continue;
      results.push({
        id: item.url.split('/').pop() || `${animeId}-episode-${epNumber}`,
        number: epNumber,
        url: item.url
      });
    }

    results.sort((a, b) => a.number - b.number);
    return results;
  }

  // ---- Extract container with episodes ----
  _extractContainer(html) {
    const patterns = [
      /<div[^>]*class\s*=\s*["'][^"']*eplister[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/i,
      /<div[^>]*class\s*=\s*["'][^"']*ep-list[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/i,
      /<div[^>]*class\s*=\s*["'][^"']*episodes[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    // Fallback: search for <ul> containing data-index
    const ulMatch = html.match(/<ul[^>]*>([\s\S]*?data-index[\s\S]*?)<\/ul>/i);
    if (ulMatch) return ulMatch[1];
    return null;
  }

  // ---- Fallback: generic link search ----
  async _fallbackEpisodeSearch(html, animeId) {
    const results = [];
    const linkRegex = /<a\s+([^>]+)>/gi;
    let match;
    const links = [];
    while ((match = linkRegex.exec(html)) !== null) {
      const attrs = match[1];
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      const fullTag = match[0];
      const closingIndex = html.indexOf('</a>', match.index + fullTag.length);
      let text = '';
      if (closingIndex !== -1) {
        text = html.substring(match.index + fullTag.length, closingIndex).trim();
      }
      const lowerHref = href.toLowerCase();
      const lowerText = text.toLowerCase();
      if (lowerHref.includes('episode') || lowerText.includes('episode') || href.match(/\/(\d+)(?:\/|$)/)) {
        if (!lowerText.includes('previous') && !lowerText.includes('next')) {
          links.push({ href, text });
        }
      }
    }
    for (const link of links) {
      let number = 0;
      const numText = link.text.match(/(\d+)/);
      if (numText) number = parseInt(numText[1]);
      if (!number) {
        const urlNum = link.href.match(/episode[-_]?(\d+)/i) ||
                       link.href.match(/ep[-_]?(\d+)/i) ||
                       link.href.match(/\/(\d+)(?:\/|$)/);
        if (urlNum) number = parseInt(urlNum[1]);
      }
      if (number) {
        const exists = results.some(ep => ep.number === number);
        if (!exists) {
          let fullUrl = link.href;
          if (!fullUrl.startsWith('http')) fullUrl = this.baseUrl + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
          results.push({
            id: fullUrl.split('/').pop() || `${animeId}-episode-${number}`,
            number: number,
            url: fullUrl
          });
        }
      }
    }
    results.sort((a, b) => a.number - b.number);
    return results;
  }

  // ---- Stream (unchanged) ----
  async findEpisodeServer(episode, server) {
    const url = episode.url;
    const res = await fetch(url);
    const html = await res.text();

    const optionRegex = /<option value="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/option>/g;
    const options = [];
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
      const value = match[1].trim();
      const label = match[2].trim();
      if (!value) continue;
      const langMatch = label.match(/(English|Indonesian|Thai|Arabic|Bangla|Turkish|Spanish|Italian|German|Portuguese|Polish)/i);
      const language = langMatch ? langMatch[0].toLowerCase() : null;
      options.push({ value, label, language });
    }

    let filtered = options;
    if (server && server !== "Default") {
      const selectedLang = server.toLowerCase();
      filtered = options.filter(opt => opt.language === selectedLang);
    }
    if (filtered.length === 0) filtered = options;

    for (const opt of filtered) {
      try {
        const stream = await this._extractAny(opt.value, opt.label);
        if (stream) return stream;
      } catch (e) {
        continue;
      }
    }
    throw new Error("No working stream found");
  }

  async _extractAny(url, label) {
    if (url.includes("dailymotion.com")) return await this._extractDailymotion(url, label);
    if (url.includes("ok.ru")) return await this._extractOkru(url, label);
    try {
      const pageRes = await fetch(url);
      const pageHtml = await pageRes.text();
      const iframeMatch = pageHtml.match(/<iframe.*?src="([^"]+)".*?>/);
      if (iframeMatch) return await this._extractAny(iframeMatch[1], label);
      const srcMatch = pageHtml.match(/<source.*?src="([^"]+)".*?>/);
      if (srcMatch) return this._makeVideoSource(srcMatch[1], label, []);
    } catch (e) {}
    throw new Error("Unsupported host");
  }

  async _extractDailymotion(url, label) {
    const videoId = url.match(/video\/([a-zA-Z0-9]+)/)?.[1] || url.match(/embed\/video\/([a-zA-Z0-9]+)/)?.[1];
    if (!videoId) throw new Error("No Dailymotion ID");
    const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
    const metaJson = await metaRes.json();
    const hlsLink = metaJson.qualities?.auto?.[0]?.url;
    if (!hlsLink) throw new Error("No HLS");
    const bestHls = await this._getBestHls(hlsLink);
    const subs = (metaJson.subtitles || []).map(sub => ({ lang: sub.label || "Unknown", url: sub.url }));
    return this._makeVideoSource(bestHls, label, subs);
  }

  async _extractOkru(url, label) {
    const res = await fetch(url);
    const html = await res.text();
    const fileMatch = html.match(/file\s*:\s*"([^"]+)"/);
    if (fileMatch) return this._makeVideoSource(fileMatch[1], label, []);
    const srcMatch = html.match(/<source.*?src="([^"]+)".*?>/);
    if (srcMatch) return this._makeVideoSource(srcMatch[1], label, []);
    throw new Error("No Ok.ru video");
  }

  async _getBestHls(hlsUrl) {
    try {
      const res = await fetch(hlsUrl);
      const text = await res.text();
      const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
      const streams = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        streams.push({ height: parseInt(match[2]), url: match[3] });
      }
      if (streams.length === 0) return hlsUrl;
      streams.sort((a, b) => b.height - a.height);
      return streams[0].url;
    } catch { return hlsUrl; }
  }

  _makeVideoSource(url, label, subs) {
    return {
      server: label,
      headers: { "Referer": this.baseUrl + "/", "Origin": this.baseUrl },
      videoSources: [{
        url: url,
        type: url.endsWith('.m3u8') ? "m3u8" : "mp4",
        quality: "1080p",
        subtitles: subs || []
      }]
    };
  }
}
