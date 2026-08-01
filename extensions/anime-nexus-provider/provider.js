/// <reference types="@seanime/extension-types" />

// Persistent storage across calls
const _state = {
  animeUuid: null,        // UUID of the current anime
  uuidMap: {},            // episode number -> episode UUID
};

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

  // ---------- Helper to log (appears in logcat) ----------
  _log(...args) {
    console.log("[AnimeNexus]", ...args);
  }

  // ---------- Search ----------
  async search(opts) {
    this._log("search called with:", opts.query);
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
      this._log("search error:", e.message);
      return [];
    }
  }

  // ---------- Episodes ----------
  async findEpisodes(animeId) {
    this._log("findEpisodes called with animeId:", animeId);
    try {
      // Store the anime UUID globally
      _state.animeUuid = animeId;

      const url = `${this.base}/api/anime/details/episodes?id=${animeId}&page=1&perPage=100&order=asc`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data || !data.data.length) return [];

      // Build the persistent map
      _state.uuidMap = {};
      data.data.forEach(ep => {
        _state.uuidMap[ep.number] = ep.id;
      });
      this._log("UUID map built:", _state.uuidMap);

      return data.data.map(ep => ({
        id: ep.id,
        number: ep.number,
        url: `${this.webBase}/watch/${ep.id}/episode-${ep.number}`
      }));
    } catch (e) {
      this._log("findEpisodes error:", e.message);
      return [];
    }
  }

  // ---------- Stream ----------
  async findEpisodeServer(episode, server) {
    this._log("findEpisodeServer called with episode:", JSON.stringify(episode));
    try {
      const epNumber = episode.number;
      this._log("Episode number:", epNumber);

      // Try to get UUID from the map
      let uuid = _state.uuidMap[epNumber];

      // If not found, try to fetch the episode list again using the stored anime UUID
      if (!uuid && _state.animeUuid) {
        this._log("UUID not in map, fetching episode list again...");
        const url = `${this.base}/api/anime/details/episodes?id=${_state.animeUuid}&page=1&perPage=100&order=asc`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data && data.data.length) {
            // Rebuild the map
            _state.uuidMap = {};
            data.data.forEach(ep => {
              _state.uuidMap[ep.number] = ep.id;
            });
            uuid = _state.uuidMap[epNumber];
            this._log("UUID map rebuilt, found:", uuid);
          }
        }
      }

      if (!uuid) {
        this._log("UUID still not found for episode", epNumber);
        throw new Error(`UUID not found for episode ${epNumber}`);
      }
      this._log("Using UUID:", uuid);

      // Fetch the stream
      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;
      this._log("Fetching stream from:", streamUrl);
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

      this._log("Final HLS URL:", hlsUrl);
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
      this._log("findEpisodeServer error:", e.message);
      // Fallback to test stream
      return this._testStream(server);
    }
  }

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
