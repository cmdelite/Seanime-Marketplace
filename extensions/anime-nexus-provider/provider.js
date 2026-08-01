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
    console.log("[AnimeNexus] search called with:", opts.query);
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
      console.error("[AnimeNexus] search error:", e.message);
      return [];
    }
  }

  async findEpisodes(animeId) {
    console.log("[AnimeNexus] findEpisodes called with animeId:", animeId);
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
      console.error("[AnimeNexus] findEpisodes error:", e.message);
      return [];
    }
  }

  async findEpisodeServer(episode, server) {
    console.log("[AnimeNexus] findEpisodeServer called with episode:", JSON.stringify(episode));
    try {
      // Use the hardcoded UUID (Episode 1 of Naruto)
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;
      console.log("[AnimeNexus] Fetching stream from:", streamUrl);

      const res = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus",
          "Accept": "application/json"
        }
      });

      console.log("[AnimeNexus] Response status:", res.status);

      const rawText = await res.text();
      console.log("[AnimeNexus] Raw response (first 500 chars):", rawText.substring(0, 500));

      if (!res.ok) {
        console.error("[AnimeNexus] API returned error:", res.status, rawText);
        throw new Error(`HTTP ${res.status}: ${rawText.substring(0, 200)}`);
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("[AnimeNexus] JSON parse error:", e.message);
        throw new Error("Invalid JSON");
      }

      const hlsUrl = data?.data?.hls;
      if (!hlsUrl) {
        console.error("[AnimeNexus] No HLS URL in response:", data);
        throw new Error("No HLS URL");
      }

      console.log("[AnimeNexus] Success! HLS URL:", hlsUrl);

      return {
        server: server || "Default",
        headers: {
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus"
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
      console.error("[AnimeNexus] Exception in findEpisodeServer:", e.message);
      // Fallback to test stream (so we know the extension is called)
      return {
        server: server || "Default",
        headers: {},
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
}
