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

  // ---- Simplified episode parser: find ANY episode link ----
  async findEpisodes(animeId) {
    const url = `${this.baseUrl}/anime/${animeId}`;
    const res = await fetch(url);
    const html = await res.text();

    const episodes = [];

    // 1) Find all <a> tags
    const linkRegex = /<a\s+([^>]+)>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const attrs = match[1];
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      let href = hrefMatch[1].trim();

      // Build absolute URL
      if (!href.startsWith('http')) {
        href = href.startsWith('/') ? this.baseUrl + href : this.baseUrl + '/' + href;
      }

      // Only keep links that are likely episode links
      const lowerHref = href.toLowerCase();
      if (!lowerHref.includes('watch') && !lowerHref.includes('episode')) continue;

      // Extract episode number from href or link text
      let number = 0;
      const numFromUrl = href.match(/episode[-_]?(\d+)/i) || href.match(/ep[-_]?(\d+)/i) || href.match(/\/(\d+)(?:\/|$)/);
      if (numFromUrl) number = parseInt(numFromUrl[1]);

      // If not, try from link text
      if (!number) {
        const fullTag = match[0];
        const closingIndex = html.indexOf('</a>', match.index + fullTag.length);
        if (closingIndex !== -1) {
          const text = html.substring(match.index + fullTag.length, closingIndex).trim();
          const numFromText = text.match(/(\d+)/);
          if (numFromText) number = parseInt(numFromText[1]);
        }
      }

      if (number) {
        episodes.push({ number, url: href });
      }
    }

    // Deduplicate by URL
    const unique = new Map();
    for (const ep of episodes) {
      if (!unique.has(ep.url)) unique.set(ep.url, ep);
    }

    const result = Array.from(unique.values());
    result.sort((a, b) => a.number - b.number);

    return result.map(ep => ({
      id: ep.url.split('/').pop() || `${animeId}-episode-${ep.number}`,
      number: ep.number,
      url: ep.url
    }));
  }

  // ---- Stream extraction (unchanged) ----
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
