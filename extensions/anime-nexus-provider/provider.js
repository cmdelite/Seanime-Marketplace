/// <reference types="@seanime/extension-types" />

class Provider {
  constructor() {
    this.base = "https://api.anime.nexus";
    this.webBase = "https://anime.nexus";
  }

  getSettings() {
    return {
      episodeServers: ["Default"],
      supportsDub: false
    };
  }

  async search(opts) {
    try {
      const url = `${this.base}/api/anime/shows?search=${encodeURIComponent(opts.query)}&sortBy=name+asc&page=1&includes[]=poster&includes[]=genres&hasVideos=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data || !data.data.length) return [];
      return data.data.map(item => ({
        id: item.id,
        title: item.name,
        url: `${this.webBase}/series/${item.id}`,
        subOrDub: "sub"
      }));
    } catch (e) {
      return [];
    }
  }

  async findEpisodes(animeId) {
    try {
      const url = `${this.base}/api/anime/details/episodes?id=${animeId}&page=1&perPage=100&order=asc`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data || !data.data.length) return [];
      return data.data.map(ep => ({
        id: ep.id,
        number: ep.number,
        url: `${this.webBase}/watch/${ep.id}/episode-${ep.number}`
      }));
    } catch (e) {
      return [];
    }
  }

  async findEpisodeServer(episode, server) {
    try {
      // Hardcoded UUID for Naruto episode 1
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;

      // Use the episode watch URL as the Referer
      const referer = episode.url || `${this.webBase}/watch/${uuid}`;

      const res = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": referer,
          "Origin": this.webBase,
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      const rawText = await res.text();

      if (!res.ok) {
        // Log the error (visible with adb logcat)
        console.error("[AnimeNexus] API Error:", res.status, rawText);
        return this._errorStream("HTTP " + res.status + ": " + rawText.slice(0, 200));
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("[AnimeNexus] JSON parse error:", e.message, rawText);
        return this._errorStream("Invalid JSON: " + rawText.slice(0, 200));
      }

      const hlsUrl = data?.data?.hls;
      if (!hlsUrl) {
        console.error("[AnimeNexus] No HLS URL in response:", data);
        return this._errorStream("No HLS URL");
      }

      console.log("[AnimeNexus] Success, HLS URL:", hlsUrl);

      return {
        server: server || "Default",
        headers: {
          "Referer": referer,
          "Origin": this.webBase
        },
        videoSources: [
          {
            url: hlsUrl,
            type: "m3u8",
            quality: "1080p",
            subtitles: []
          }
        ]
      };
    } catch (e) {
      console.error("[AnimeNexus] Exception:", e.message);
      return this._errorStream(e.message);
    }
  }

  // ---------- Error fallback (still plays a test stream, but adds a subtitle with the error) ----------
  _errorStream(message) {
    // Create a VTT subtitle with the error
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:10.000
Error: ${message}
Check adb logcat for details.`;

    const vttBase64 = btoa(vttContent);

    return {
      server: "Default",
      headers: {},
      videoSources: [
        {
          url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          type: "m3u8",
          quality: "720p",
          subtitles: [
            {
              lang: "en",
              label: "Error",
              url: "data:text/vtt;base64," + vttBase64
            }
          ]
        }
      ]
    };
  }
}a
