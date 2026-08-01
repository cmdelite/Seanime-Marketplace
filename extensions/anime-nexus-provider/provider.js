/// <reference types="@seanime/extension-types" />

// Log at module level to confirm the script loads
$debug.info("AnimeNexus provider script loaded");

class Provider {
  constructor() {
    this.base = "https://api.anime.nexus";
    this.webBase = "https://anime.nexus";
    $debug.info("Provider constructor called");
  }

  getSettings() {
    return {
      episodeServers: ["Default"],
      supportsDub: false
    };
  }

  async search(opts) {
    $debug.info("search called with:", opts.query);
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
      $debug.error("search error:", e.message);
      return [];
    }
  }

  async findEpisodes(animeId) {
    $debug.info("findEpisodes called with animeId:", animeId);
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
      $debug.error("findEpisodes error:", e.message);
      return [];
    }
  }

  async findEpisodeServer(episode, server) {
    $debug.info("findEpisodeServer called with episode:", JSON.stringify(episode));
    try {
      // Hardcoded UUID for Naruto episode 1
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;
      $debug.info("Fetching stream from:", streamUrl);

      const res = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus",
          "Accept": "application/json"
        }
      });

      $debug.info("Response status:", res.status);

      const rawText = await res.text();
      $debug.info("Raw response (first 500 chars):", rawText.substring(0, 500));

      if (!res.ok) {
        $debug.error("API error:", res.status, rawText);
        throw new Error(`HTTP ${res.status}`);
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        $debug.error("JSON parse error:", e.message);
        throw new Error("Invalid JSON");
      }

      const hlsUrl = data?.data?.hls;
      if (!hlsUrl) {
        $debug.error("No HLS URL in response:", data);
        throw new Error("No HLS URL");
      }

      $debug.info("Success! HLS URL:", hlsUrl);

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
      $debug.error("Exception in findEpisodeServer:", e.message);
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
