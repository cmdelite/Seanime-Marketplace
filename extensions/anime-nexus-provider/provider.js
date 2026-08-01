/// <reference types="@seanime/extension-types" />

class Provider {
  getSettings() {
    return {
      episodeServers: ["Default"],
      supportsDub: false
    };
  }

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
    // Use anime.nexus instead of api.anime.nexus
    const hlsUrl = "https://anime.nexus/api/anime/video/9d81403c-0170-47f5-b757-0623592b6be6/stream/video.m3u8";
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
