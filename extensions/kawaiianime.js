const mangayomiSources = [{
    "name": "Kawaii Anime",
    "lang": "en",
    "baseUrl": "https://kawaii-anime.com",
    "apiUrl": "https://kawaii-anime.com/api/anilist",
    "iconUrl": "https://kawaii-anime.com/favicon.ico",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.2",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/kawaiianime.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 892348239,
    "notes": "Kawaii Anime mp4 streaming",
    "pkgPath": "working/kawaiianime.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://graphql.anilist.co"; // Using main Anilist to avoid potential block on their wrapper
        this.baseUrl = "https://kawaii-anime.com";
        this.videoBaseUrl = "https://video.kawaii-anime.com/video";
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    }

    async gqlGet(query, variables) {
        var headers = this.getHeaders();
        var bodyObj = { query: query, variables: variables };
        var res = await this.client.post(this.apiUrl, headers, bodyObj);
        
        if (res.statusCode !== 200) {
            console.log("gqlGet error: " + res.statusCode + " " + res.body);
        }
        
        return JSON.parse(res.body);
    }

    pickTitle(show) {
        return show.title.english || show.title.romaji || show.title.native || "";
    }

    parseShowList(mediaList) {
        var list = [];
        for (var edge of mediaList) {
            var title = this.pickTitle(edge);
            if (!title) continue;
            
            var imageUrl = edge.coverImage ? (edge.coverImage.extraLarge || edge.coverImage.large) : "";
            
            list.push({
                name: title,
                imageUrl: imageUrl,
                link: edge.id.toString()
            });
        }
        return list;
    }

    async getPopular(page) {
        console.log("KawaiiAnime getPopular page=" + page);
        try {
            var query = `query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, sort: POPULARITY_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { page: page, perPage: 24 };
            var data = await this.gqlGet(query, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        console.log("KawaiiAnime getLatestUpdates page=" + page);
        try {
            var query = `query ($page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, sort: TRENDING_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { page: page, perPage: 24 };
            var data = await this.gqlGet(query, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        console.log("KawaiiAnime search: " + query + " page=" + page);
        try {
            var gql = `query ($page: Int, $perPage: Int, $search: String) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage }
                    media(type: ANIME, search: $search, sort: POPULARITY_DESC) { 
                        id
                        title { romaji english native }
                        coverImage { extraLarge large }
                    }
                }
            }`;
            var variables = { search: query, page: page, perPage: 24 };
            var data = await this.gqlGet(gql, variables);
            var pageInfo = data.data.Page;
            var list = this.parseShowList(pageInfo.media);
            return { list, hasNextPage: pageInfo.pageInfo.hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        console.log("KawaiiAnime getDetail: " + url);
        try {
            var showId = parseInt(url);

            var detailQuery = `query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    description(asHtml: false)
                    coverImage { extraLarge large }
                    genres
                    status
                    episodes
                    nextAiringEpisode { episode }
                }
            }`;
            var detailData = await this.gqlGet(detailQuery, { id: showId });
            var show = detailData.data.Media;

            var title = this.pickTitle(show);
            var imageUrl = show.coverImage ? (show.coverImage.extraLarge || show.coverImage.large) : "";
            var description = show.description || "";
            var genre = show.genres || [];

            // Mapping status
            var status = 5; // Unknown
            if (show.status) {
                if (show.status === "RELEASING") status = 0;
                else if (show.status === "FINISHED") status = 1;
                else if (show.status === "HIATUS") status = 2;
                else if (show.status === "CANCELLED") status = 3;
                else if (show.status === "NOT_YET_RELEASED") status = 4;
            }

            // Calculate available episodes
            var epsCount = show.episodes || 0;
            if (show.status === 'RELEASING' && show.nextAiringEpisode) {
                epsCount = show.nextAiringEpisode.episode - 1;
            }

            var chapters = [];
            // Generate episode links
            for (var i = 1; i <= epsCount; i++) {
                chapters.push({
                    name: "Episode " + i,
                    url: showId + "||" + i
                });
            }

            // Sort episodes descending
            chapters.reverse();

            // Create a fake link for UI
            var link = this.baseUrl + "/watch/" + showId;

            console.log("getDetail: " + title + ", " + chapters.length + " episodes");

            return {
                link,
                name: title,
                imageUrl,
                description,
                genre,
                status,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return { name: "", imageUrl: "", description: "", genre: [], status: 5, chapters: [] };
        }
    }

    async getVideoList(url) {
        console.log("KawaiiAnime getVideoList: " + url);
        try {
            var parts = url.split("||");
            if (parts.length < 2) {
                console.log("Invalid episode URL format");
                return [];
            }
            var showId = parts[0];
            var epNum = parts[1];

            var videoCacheUrl = this.baseUrl + "/api/video-cache?episodeId=" + showId + "-ep" + epNum;
            var headers = this.getHeaders();
            var res = await this.client.get(videoCacheUrl, headers);
            
            if (res.statusCode !== 200) {
                console.log("video-cache error: " + res.statusCode);
                // Fallback to direct URL if API fails
                var fallbackUrl = this.videoBaseUrl + "/" + showId + "-ep" + epNum;
                return [{
                    url: fallbackUrl,
                    originalUrl: fallbackUrl,
                    quality: "Default - MP4",
                    headers: null
                }];
            }

            var data = JSON.parse(res.body);
            var videoUrl = data.url || (this.videoBaseUrl + "/" + showId + "-ep" + epNum);
            
            var subtitles = [];
            if (data.subtitles && Array.isArray(data.subtitles)) {
                for (var sub of data.subtitles) {
                    subtitles.push({
                        file: sub.url,
                        label: sub.lang || "Unknown"
                    });
                }
            }

            var videos = [];
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: "Default - MP4",
                subtitles: subtitles,
                headers: null
            });

            return videos;
            
        } catch (e) {
            console.log("getVideoList error: " + e);
            return [];
        }
    }

    async getPageList(url) {
        return [];
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}


