/// <reference types="@seanime/extension-types" />

// Force a log at load time
console.log("[AnimeNexus] Script loaded");

class Provider {
  constructor() {
    this.base = "https://api.anime.nexus";
    this.webBase = "https://anime.nexus";
    console.log("[AnimeNexus] Constructor called");
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

    // HARDCODED – always return the known working HLS URL
    const hlsUrl = "https://api.anime.nexus/api/anime/video/9d81403c-0170-47f5-b757-0623592b6be6/stream/video.m3u8";
    console.log("[AnimeNexus] Returning HLS URL:", hlsUrl);

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
  }
}
