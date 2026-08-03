/// <reference types="@seanime/extension-types" />

class Provider {
  constructor() {
    this.baseUrl = "https://animekhor.org";
    this.name = "AnimeKhor";
  }

  getSettings() {
    return {
      episodeServers: ["English", "Indonesian", "Multi Sub"],
      supportsDub: false
    };
  }

  // ---- Base64 decode (for Dailymotion options) ----
  _atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  }

  // ---- Search ----
  async search(opts) {
    const results = [];
    const url = `${this.baseUrl}/?s=${encodeURIComponent(opts.query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
    });
    const html = await res.text();
    const regex = /<article class="bs"[^>]*>.*?<a href="([^"]+)"[^>]*>.*?<img src="([^"]+)"[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/gs;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const urlPart = match[1].trim();
      const id = urlPart.split('/').pop() || '';
      results.push({
        id: id,
        title: match[3].trim(),
        url: urlPart,
        subOrDub: "sub"
      });
    }
    return results;
  }

  // ---- Episodes (direct from epl-num) ----
  async findEpisodes(animeId) {
    const url = `${this.baseUrl}/anime/${animeId}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
    });
    const html = await res.text();

    const episodes = [];
    const epRegex = /<a href="([^"]+)"><div class="epl-num">([^<]+)<\/div><div class="epl-title">([^<]*)<\/div>/g;
    let match;
    while ((match = epRegex.exec(html)) !== null) {
      const url = match[1];
      const epNumRaw = match[2].trim();
      const title = match[3].trim();

      const numMatch = epNumRaw.match(/(\d+(?:\.\d+)?)/);
      const number = numMatch ? parseFloat(numMatch[1]) : episodes.length + 1;

      episodes.push({
        id: url,
        number,
        title,
        url
      });
    }

    episodes.sort((a, b) => a.number - b.number);

    if (!episodes.length) {
      return this._fallbackEpisodeSearch(html, animeId);
    }
    return episodes;
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
      let href = hrefMatch[1].trim();
      if (!href.startsWith('http')) {
        href = href.startsWith('/') ? this.baseUrl + href : this.baseUrl + '/' + href;
      }
      const fullTag = match[0];
      const closingIndex = html.indexOf('</a>', match.index + fullTag.length);
      let text = '';
      if (closingIndex !== -1) {
        text = html.substring(match.index + fullTag.length, closingIndex).trim();
      }
      const lowerHref = href.toLowerCase();
      const lowerText = text.toLowerCase();
      if (lowerHref.includes('watch') || lowerText.includes('episode') || href.match(/\/(\d+)(?:\/|$)/)) {
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
          results.push({
            id: `${animeId}-episode-${number}`,
            number: number,
            url: link.href
          });
        }
      }
    }
    results.sort((a, b) => a.number - b.number);
    return results;
  }

  // ---- Stream extraction ----
  async findEpisodeServer(episode, server) {
    const url = episode.url;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
    });
    const html = await res.text();

    const optionRegex = /<option value="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/option>/g;
    const options = [];
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
      const value = match[1].trim();
      const label = match[2].trim();
      if (!value) continue;

      let language = null;
      if (server === "English") {
        if (label.match(/\[ENGLISH\]/i)) language = "english";
      } else if (server === "Indonesian") {
        if (label.match(/\[INDONESIAN\]/i)) language = "indonesian";
      } else if (server === "Multi Sub") {
        if (label.match(/\[MULTI SUB\]/i)) language = "multi sub";
      }

      if (!language && server !== "Default") {
        if (label.match(/\[ENGLISH\]/i)) language = "english";
        else if (label.match(/\[INDONESIAN\]/i)) language = "indonesian";
        else if (label.match(/\[MULTI SUB\]/i)) language = "multi sub";
      }

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

  // ---- Generic extractor ----
  async _extractAny(url, label) {
    if (url.includes("dailymotion.com")) return await this._extractDailymotion(url, label);
    if (url.includes("ok.ru")) return await this._extractOkru(url, label);
    if (url.includes("streamwish")) return await this._extractStreamWish(url, label);
    try {
      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
      });
      const pageHtml = await pageRes.text();
      const iframeMatch = pageHtml.match(/<iframe.*?src="([^"]+)".*?>/);
      if (iframeMatch) return await this._extractAny(iframeMatch[1], label);
      const srcMatch = pageHtml.match(/<source.*?src="([^"]+)".*?>/);
      if (srcMatch) return this._makeVideoSource(srcMatch[1], label, []);
    } catch (e) {}
    throw new Error("Unsupported host");
  }

  // ---- Dailymotion ----
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

  // ---- Ok.ru ----
  async _extractOkru(url, label) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
    });
    const html = await res.text();
    const fileMatch = html.match(/file\s*:\s*"([^"]+)"/);
    if (fileMatch) return this._makeVideoSource(fileMatch[1], label, []);
    const srcMatch = html.match(/<source.*?src="([^"]+)".*?>/);
    if (srcMatch) return this._makeVideoSource(srcMatch[1], label, []);
    throw new Error("No Ok.ru video");
  }

  // ---- StreamWish ----
  async _extractStreamWish(url, label) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' }
    });
    const html = await res.text();
    const fileMatch = html.match(/file\s*:\s*"([^"]+)"/);
    if (fileMatch) return this._makeVideoSource(fileMatch[1], label, []);
    const srcMatch = html.match(/<source.*?src="([^"]+)".*?>/);
    if (srcMatch) return this._makeVideoSource(srcMatch[1], label, []);
    const iframeMatch = html.match(/<iframe.*?src="([^"]+)".*?>/);
    if (iframeMatch) return await this._extractStreamWish(iframeMatch[1], label);
    throw new Error("No StreamWish video");
  }

  // ---- Helper: get best quality from HLS master ----
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

  // ---- Helper: build video source ----
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
