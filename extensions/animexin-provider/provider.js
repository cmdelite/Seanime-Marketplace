/// <reference types="@seanime/extension-types" />

class Provider {
  constructor() {
    this.baseUrl = "https://animexin.dev";
    this.name = "AnimeXin";
  }

  // ---- Language options (appear in server dropdown) ----
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

  // ---- Base64 decode (for Dailymotion) ----
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

  // ---- Episodes ----
  async findEpisodes(animeId) {
    const results = [];
    const url = `${this.baseUrl}/anime/${animeId}`;
    const res = await fetch(url);
    const html = await res.text();

    const regex = /<a href="([^"]+)">\s*<div class="epl-num">([\d.]+)<\/div>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const epUrl = match[1].trim();
      results.push({
        id: epUrl.split('/').pop() || '',
        number: parseInt(match[2], 10),
        url: epUrl
      });
    }
    results.reverse();
    return results;
  }

  // ---- Stream ----
  async findEpisodeServer(episode, server) {
    const url = episode.url;
    const res = await fetch(url);
    const html = await res.text();

    // Parse all option values
    const optionRegex = /<option value="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/option>/g;
    const options = [];
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
      const value = match[1].trim();
      const label = match[2].trim();
      if (!value) continue;
      // Extract language from label (case‑insensitive)
      const langMatch = label.match(/(English|Indonesian|Thai|Arabic|Bangla|Turkish|Spanish|Italian|German|Portuguese|Polish)/i);
      const language = langMatch ? langMatch[0].toLowerCase() : null;
      options.push({ value, label, language });
    }

    // Filter by selected language (if provided)
    let filtered = options;
    if (server && server !== "Default") {
      const selectedLang = server.toLowerCase();
      filtered = options.filter(opt => opt.language === selectedLang);
    }

    // If no options match, use all options as fallback
    if (filtered.length === 0) filtered = options;

    // Try each option in order
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
    if (url.includes("dailymotion.com")) {
      return await this._extractDailymotion(url, label);
    }
    if (url.includes("ok.ru")) {
      return await this._extractOkru(url, label);
    }
    // For other platforms (Odysee, Rumble, etc.)
    try {
      const pageRes = await fetch(url);
      const pageHtml = await pageRes.text();
      const iframeMatch = pageHtml.match(/<iframe.*?src="([^"]+)".*?>/);
      if (iframeMatch) {
        return await this._extractAny(iframeMatch[1], label);
      }
      const srcMatch = pageHtml.match(/<source.*?src="([^"]+)".*?>/);
      if (srcMatch) {
        return this._makeVideoSource(srcMatch[1], label, []);
      }
    } catch (e) {}
    throw new Error("Unsupported host");
  }

  // ---- Dailymotion ----
  async _extractDailymotion(url, label) {
    const videoId = url.match(/video\/([a-zA-Z0-9]+)/)?.[1] ||
                    url.match(/embed\/video\/([a-zA-Z0-9]+)/)?.[1];
    if (!videoId) throw new Error("No Dailymotion ID");
    const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
    const metaJson = await metaRes.json();
    const hlsLink = metaJson.qualities?.auto?.[0]?.url;
    if (!hlsLink) throw new Error("No HLS");
    const bestHls = await this._getBestHls(hlsLink);

    // Extract soft subtitles
    const subs = (metaJson.subtitles || []).map(sub => ({
      lang: sub.label || "Unknown",
      url: sub.url
    }));

    return this._makeVideoSource(bestHls, label, subs);
  }

  // ---- Ok.ru ----
  async _extractOkru(url, label) {
    const res = await fetch(url);
    const html = await res.text();
    const fileMatch = html.match(/file\s*:\s*"([^"]+)"/);
    if (fileMatch) {
      return this._makeVideoSource(fileMatch[1], label, []);
    }
    const srcMatch = html.match(/<source.*?src="([^"]+)".*?>/);
    if (srcMatch) {
      return this._makeVideoSource(srcMatch[1], label, []);
    }
    throw new Error("No Ok.ru video");
  }

  // ---- Helper: parse HLS master for best quality ----
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
