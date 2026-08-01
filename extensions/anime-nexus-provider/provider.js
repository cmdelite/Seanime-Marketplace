/// <reference types="@seanime/extension-types" />

class Provider {
  constructor() {
    this.base = "https://api.anime.nexus";
    this.webBase = "https://anime.nexus";
    this.uuidMap = {}; // episode number -> UUID
  }

  getSettings() {
    return {
      episodeServers: ["Default"],
      supportsDub: false
    };
  }

  _log(...args) {
    console.log("[AnimeNexus]", ...args);
  }

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

  async findEpisodes(animeId) {
    this._log("findEpisodes called with animeId:", animeId);
    try {
      const url = `${this.base}/api/anime/details/episodes?id=${animeId}&page=1&perPage=100&order=asc`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data || !data.data.length) return [];
      
      // Build map: episode number -> UUID
      this.uuidMap = {};
      data.data.forEach(ep => {
        this.uuidMap[ep.number] = ep.id;
      });
      this._log("UUID map built:", this.uuidMap);

      return data.data.map(ep => ({
        id: ep.id,          // the UUID
        number: ep.number,
        url: `${this.webBase}/watch/${ep.id}/episode-${ep.number}`
      }));
    } catch (e) {
      this._log("findEpisodes error:", e.message);
      return [];
    }
  }

  async findEpisodeServer(episode, server) {
    this._log("findEpisodeServer called with episode object:", JSON.stringify(episode));
    try {
      const epNumber = episode.number;
      this._log("Episode number:", epNumber);
      
      const uuid = this.uuidMap[epNumber];
      if (!uuid) {
        this._log("UUID not found in map for episode", epNumber, "map keys:", Object.keys(this.uuidMap));
        throw new Error(`UUID not found for episode ${epNumber}`);
      }
      this._log("Found UUID:", uuid);

      const url = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;
      this._log("stream URL:", url);
      const res = await fetch(url, {
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
      this._log("stream response:", JSON.stringify(data));
      
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
            quality: "1080p",  // master playlist includes 1080p
            subtitles: []
          }
        ]
      };
    } catch (e) {
      this._log("findEpisodeServer error:", e.message);
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
