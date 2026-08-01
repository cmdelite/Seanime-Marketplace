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
    const url = `${this.base}/api/anime/shows?search=${encodeURIComponent(opts.query)}&sortBy=name+asc&page=1&includes[]=poster&includes[]=genres&hasVideos=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    if (!data.data || !data.data.length) return [];
    return data.data.map(item => ({
      id: item.id,
      title: item.name,
      url: `${this.webBase}/series/${item.id}`,
      subOrDub: "sub"
    }));
  }

  /**
   * @param {string} animeId - UUID from search result
   * @returns {Promise<Array<{id: string, number: number, url: string}>>}
   */
  async findEpisodes(animeId) {
    const url = `${this.base}/api/anime/details/episodes?id=${animeId}&page=1&perPage=100&order=asc`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) throw new Error(`Episode fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.data || !data.data.length) return [];
    return data.data.map(ep => ({
      id: ep.id,
      number: ep.number,
      url: `${this.webBase}/watch/${ep.id}/episode-${ep.number}`
    }));
  }

  /**
   * @param {Object} episode - { id, number, url }
   * @param {string} server - ignored (only one server)
   * @returns {Promise<{server: string, headers: Object, videoSources: Array}>}
   */
  async findEpisodeServer(episode, server) {
    const url = `${this.base}/api/anime/details/episode/stream?id=${episode.id}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": this.webBase + "/"
      }
    });
    if (!res.ok) throw new Error(`Stream fetch failed: ${res.status}`);
    const data = await res.json();
    const hlsUrl = data.data?.hls;
    if (!hlsUrl) throw new Error("No stream URL found");
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
  }
}

// Must export the class as 'Provider'
