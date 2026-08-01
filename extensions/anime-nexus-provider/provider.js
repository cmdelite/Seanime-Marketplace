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
      const uuid = "998f50fc-dc39-4557-9e6e-34b4e5a712f1";
      const streamUrl = `${this.base}/api/anime/details/episode/stream?id=${uuid}`;

      console.log("[AnimeNexus] Fetching:", streamUrl);

      const res = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime.nexus/",
          "Origin": "https://anime.nexus",
          "Accept": "application/json"
        }
      });

      console.log("[AnimeNexus] Status:", res.status);

      // Get the raw response text (even if it's not JSON)
      const rawText = await res.text();
      console.log("[AnimeNexus] Raw response:", rawText);

      if (!res.ok) {
        // Return the error as a video source so we can see it
        return {
          server: server || "Default",
          headers: {},
          videoSources: [
            {
              url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
              type: "m3u8",
              quality: "720p",
              subtitles: [
                {
                  lang: "en",
                  label: "Error Details",
                  url: "data:text/vtt;base64," + btoa(
                    "WEBVTT\n\n" +
                    "00:00:00.000 --> 00:00:10.000\n" +
                    "Error: " + res.status + "\n" +
                    rawText.substring(0, 500) + "\n" +
                    "Check adb logcat for full details."
                  )
                }
              ]
            }
          ]
        };
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Invalid JSON: " + rawText.substring(0, 200));
      }

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
      // Return error as subtitle
      return {
        server: server || "Default",
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
                url: "data:text/vtt;base64," + btoa(
                  "WEBVTT\n\n" +
                  "00:00:00.000 --> 00:00:10.000\n" +
                  "Error: " + e.message
                )
              }
            ]
          }
        ]
      };
    }
  }
}
