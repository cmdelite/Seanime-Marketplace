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

  // Hardcode search to Naruto (for testing)
  async search(opts) {
    return [
      {
        id: "998f3c18-365d-4e07-bbfc-f904eacd7a7a",
        title: "Naruto",
        url: "https://anime.nexus/series/998f3c18-365d-4e07-bbfc-f904eacd7a7a",
        subOrDub: "sub"
      }
    ];
  }

  // Hardcode episodes to only episode 1
  async findEpisodes(animeId) {
    return [
      {
        id: "998f50fc-dc39-4557-9e6e-34b4e5a712f1",
        number: 1,
        url: "https://anime.nexus/watch/998f50fc-dc39-4557-9e6e-34b4e5a712f1/episode-1"
      }
    ];
  }

  async findEpisodeServer(episode, server) {
    try {
      // The UUID of episode 1
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      const streamApiUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;

      // Fetch a fresh HLS URL from the API
      const res = await fetch(streamApiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus",
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("[AnimeNexus] API error:", res.status, body);
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const hlsUrl = data?.data?.hls;
      if (!hlsUrl) throw new Error("No HLS URL in API response");

      console.log("[AnimeNexus] Fresh HLS URL:", hlsUrl);

      // Return the fresh URL with the necessary headers for the player
      return {
        server: server || "Default",
        headers: {
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
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
      console.error("[AnimeNexus] Error in findEpisodeServer:", e.message);
      // Fallback to test stream (if all fails, you'll see Big Buck Bunny)
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
