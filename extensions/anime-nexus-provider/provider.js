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

  /**
   * @param {Object} opts - { query: string }
   * @returns {Promise<Array<{id: string, title: string, url: string, subOrDub: string}>>}
   */
  async search(opts) {
    this._log("search called with query:", opts.query);
    try {
      const url = `${this.base}/api/anime/shows?search=${encodeURIComponent(opts.query)}&sortBy=name+asc&page=1&includes[]=poster&includes[]=genres&hasVideos=1`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._log("search response:", data);
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

  /**
   * @param {string} animeId - UUID from search result
   * @returns {Promise<Array<{id: string, number: number, url: string}>>}
   */
  async findEpisodes(animeId) {
    this._log("findEpisodes called with animeId:", animeId);
    try {
      const url = `${this.base}/api/anime/details/episodes?id=${animeId}&page=1&perPage=100&order=asc`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._log("findEpisodes response:", data);
      if (!data.data || !data.data.length) return [];
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

  /**
   * @param {Object} episode - { id, number, url }
   * @param {string} server - ignored (only one server)
   * @returns {Promise<{server: string, headers: Object, videoSources: Array}>}
   */
  async findEpisodeServer(episode, server) {
    this._log("findEpisodeServer called with episode ID:", episode.id);
    try {
      const url = `${this.base}/api/anime/details/episode/stream?id=${episode.id}`;
      this._log("Fetching stream from:", url);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": this.webBase + "/",
          "Origin": this.webBase
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      this._log("Stream response:", data);
      const hlsUrl = data.data?.hls;
      if (!hlsUrl) {
        this._log("No HLS URL found, using fallback test stream");
        // Return a test stream so we know the extension is working
        return this._testStream(server);
      }
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
      // Return a test stream to at least see if playback works
      return this._testStream(server);
    }
  }

  // ---------- Helper methods ----------
  _log(...args) {
    // Try to use $debug if available (Seanime's built-in logger)
    if (typeof $debug !== 'undefined' && $debug.info) {
      $debug.info(...args);
    } else {
      // Fallback to console.log – these will appear in logcat
      console.log("[AnimeNexus]", ...args);
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

// Must export the class as 'Provider'
