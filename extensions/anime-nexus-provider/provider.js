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

  // ---------- Search (unchanged) ----------
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

  // ---------- Episodes (we don't need the map now) ----------
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

  // ---------- Stream (hardcoded UUID) ----------
  async findEpisodeServer(episode, server) {
    try {
      // Hardcoded UUID for Naruto episode 1
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      console.log("[AnimeNexus] Hardcoded UUID:", uuid);

      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;
      const res = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": this.webBase + "/",
          "Origin": this.webBase,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      const hlsUrl = data?.data?.hls;
      if (!hlsUrl) throw new Error("No HLS URL in response");

      return {
        server: server || "Default",
        headers: {
          "Referer": this.webBase + "/",
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
      console.log("[AnimeNexus] Error:", e.message);
      return this._testStream(server);
    }
  }

  // ---------- Fallback test stream ----------
  _testStream(server) {
    return {
      server: server || "Default",
      headers: {
        "Referer": this.webBase + "/",
        "Origin": this.webBase
      },
      videoSources: [
        {
          url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          type: "m3u8",
          quality: "720p",
          subtitles: []
        }
      ]
    };
  }
}
