const mangayomiSources = [{
    "name": "AnimeXin",
    "lang": "en",
    "baseUrl": "https://animexin.dev",
    "apiUrl": "",
    "iconUrl": "https://animexin.dev/favicon.ico",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": false,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/RandomUs3rInTh3Int3rn3t/prod_extension2/main/working/animexin.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "pkgPath": "working/animexin.js",
    "id": 695311390
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.baseUrl = "https://animexin.dev";
    }

    async getPopular(page) {
        const res = await this.client.get(`${this.baseUrl}/anime/?order=popular&page=${page}`);
        return this.parseAnimeList(res.body, ".listupd article.bs");
    }

    async getLatestUpdates(page) {
        const res = await this.client.get(`${this.baseUrl}/anime/?order=update&page=${page}`);
        return this.parseAnimeList(res.body, ".listupd article.bs");
    }

    async search(query, page, filters) {
        let url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
        if (query === "") {
            url = `${this.baseUrl}/anime/?page=${page}`;
            if (filters) {
                for (const filter of filters) {
                    if (filter.type === "genre") {
                        for (const val of filter.values) {
                            url += `&genre[]=${val}`;
                        }
                    } else if (filter.type === "status") {
                        url += `&status=${filter.values}`;
                    } else if (filter.type === "type") {
                        url += `&type=${filter.values}`;
                    } else if (filter.type === "order") {
                        url += `&order=${filter.values}`;
                    }
                }
            }
        } else {
            url += `&page=${page}`;
        }
        const res = await this.client.get(url);
        return this.parseAnimeList(res.body, ".listupd article.bs");
    }

    async getDetail(url) {
        let res = await this.client.get(url);
        let doc = new Document(res.body);

        // If this is an episode page, redirect to the series page to get the full episode list
        const allEpisodesLink = doc.selectFirst(".nvs.nvsc a") || doc.selectFirst(".aa-all");
        if (allEpisodesLink && !doc.selectFirst(".eplister")) {
            const seriesUrl = allEpisodesLink.attr("href");
            res = await this.client.get(seriesUrl);
            doc = new Document(res.body);
        }

        const title = doc.selectFirst("h1.entry-title").text;
        const description = doc.selectFirst(".entry-content")?.text || "";
        const imageUrl = doc.selectFirst(".thumb img")?.attr("src") || "";
        const genres = doc.select(".gencontent a").map(e => e.text);
        
        const statusStr = doc.selectFirst(".info-content span:contains('Status')")?.text || "";
        const status = statusStr.includes("Ongoing") ? 0 : 1;
        
        const chapters = doc.select(".eplister ul li").map(e => {
            const epA = e.selectFirst("a");
            const epTitle = epA.selectFirst(".epl-title").text;
            const epNum = epA.selectFirst(".epl-num").text;
            return {
                name: `${epNum} - ${epTitle}`,
                url: epA.attr("href")
            };
        }).reverse();

        return {
            name: title,
            imageUrl: imageUrl,
            description: description,
            genre: genres,
            status: status,
            chapters: chapters
        };
    }

    async getVideoList(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const mirrors = doc.select("select[name='mirror'] option");
        const videos = [];

        for (const mirror of mirrors) {
            const base64Value = mirror.attr("value");
            if (!base64Value || base64Value === "") continue;

            try {
                const decodedHtml = this.base64Decode(base64Value);
                let iframeSrc = decodedHtml.match(/src="([^"]+)"/)?.[1];
                if (iframeSrc) {
                    if (iframeSrc.startsWith("//")) iframeSrc = "https:" + iframeSrc;

                    const serverName = mirror.text.trim();
                    
                    // Attempt to extract direct video links from the iframe
                    try {
                        const iframeRes = await this.client.get(iframeSrc, {
                            "Referer": url,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        });
                        const iframeBody = iframeRes.body;

                        // 1. Direct M3U8 or MP4 links
                        const m3u8Regex = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g;
                        const mp4Regex = /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g;
                        
                        const m3u8Matches = iframeBody.match(m3u8Regex) || [];
                        const mp4Matches = iframeBody.match(mp4Regex) || [];

                        if (m3u8Matches.length > 0 || mp4Matches.length > 0) {
                            for (const link of m3u8Matches) {
                                if (!videos.some(v => v.url === link)) {
                                    videos.push({ url: link, originalUrl: link, quality: serverName + " (HLS)", headers: { "Referer": iframeSrc } });
                                }
                            }
                            for (const link of mp4Matches) {
                                if (!videos.some(v => v.url === link)) {
                                    videos.push({ url: link, originalUrl: link, quality: serverName + " (MP4)", headers: { "Referer": iframeSrc } });
                                }
                            }
                        } 
                        // 2. Packed JS (p,a,c,k) - look for escaped URLs
                        else if (iframeBody.includes("eval(function(p,a,c,k,e,d)")) {
                            const escapedUrls = iframeBody.match(/https?:\\\/\\\/[^"']+\.(?:m3u8|mp4)[^"']*/g) || [];
                            for (let escaped of escapedUrls) {
                                const unescaped = escaped.replace(/\\\//g, '/');
                                if (!videos.some(v => v.url === unescaped)) {
                                    videos.push({ url: unescaped, originalUrl: unescaped, quality: serverName + " (Packed)", headers: { "Referer": iframeSrc } });
                                }
                            }
                        }
                        // 3. Fallback: Return iframe URL if no direct link found
                        // Some providers like Doodstream are handled by Mangayomi's internal engine if we provide the right URL
                        else {
                            videos.push({
                                url: iframeSrc,
                                originalUrl: iframeSrc,
                                quality: serverName + " (External)",
                                headers: { "Referer": url }
                            });
                        }
                    } catch (e) {
                        console.log("Iframe fetch error: " + e);
                        videos.push({
                            url: iframeSrc,
                            originalUrl: iframeSrc,
                            quality: serverName + " (Direct)",
                            headers: { "Referer": url }
                        });
                    }
                }
            } catch (e) {
                console.log("Base64 decode error: " + e);
            }
        }
        return videos;
    }

    parseAnimeList(html, selector = ".listupd article.bs") {
        const doc = new Document(html);
        const items = doc.select(selector);
        const anime = items.map(item => {
            const a = item.selectFirst("a");
            const titleEl = item.selectFirst("h2");
            const title = titleEl ? titleEl.text : item.selectFirst(".tt")?.text.trim();
            return {
                name: title,
                imageUrl: item.selectFirst("img")?.attr("src") || "",
                link: a.attr("href")
            };
        });
        const hasNextPage = doc.selectFirst(".next") !== null;
        return {
            list: anime,
            hasNextPage: hasNextPage
        };
    }

    base64Decode(input) {
        try {
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
            var str = String(input).replace(/[=]+$/, '');
            if (str.length % 4 == 1) return ""; 
            for (
                var bc = 0, bs, buffer, idx = 0, output = '';
                buffer = str.charAt(idx++);
                ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
                    bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
            ) {
                buffer = chars.indexOf(buffer);
            }
            return output;
        } catch (e) {
            return "";
        }
    }

    getFilterList() {
        return [
            {
                type: "order",
                name: "Order by",
                values: [
                    { name: "Default", value: "" },
                    { name: "A-Z", value: "title" },
                    { name: "Z-A", value: "titlereverse" },
                    { name: "Latest Update", value: "update" },
                    { name: "Latest Added", value: "latest" },
                    { name: "Popular", value: "popular" },
                    { name: "Rating", value: "rating" }
                ]
            },
            {
                type: "status",
                name: "Status",
                values: [
                    { name: "All", value: "" },
                    { name: "Ongoing", value: "ongoing" },
                    { name: "Completed", value: "completed" },
                    { name: "Upcoming", value: "upcoming" },
                    { name: "Hiatus", value: "hiatus" }
                ]
            },
            {
                type: "type",
                name: "Type",
                values: [
                    { name: "All", value: "" },
                    { name: "TV Series", value: "tv" },
                    { name: "OVA", value: "ova" },
                    { name: "Movie", value: "movie" },
                    { name: "Live Action", value: "live action" },
                    { name: "Special", value: "special" },
                    { name: "BD", value: "bd" },
                    { name: "ONA", value: "ona" },
                    { name: "Music", value: "music" }
                ]
            },
            {
                type: "genre",
                name: "Genre",
                values: [
                    { name: "Action", value: "action" },
                    { name: "Adventure", value: "adventure" },
                    { name: "Chinese Style", value: "chinese-style" },
                    { name: "Comedy", value: "comedy" },
                    { name: "Comic adaptation", value: "comic-adaptation" },
                    { name: "Cultivation", value: "cultivation" },
                    { name: "Demon", value: "demon" },
                    { name: "Drama", value: "drama" },
                    { name: "Encouraging", value: "encouraging" },
                    { name: "Fantasy", value: "fantasy" },
                    { name: "Game", value: "game" },
                    { name: "Historical", value: "historical" },
                    { name: "Inspiring", value: "inspiring" },
                    { name: "Isekai", value: "isekai" },
                    { name: "Magic", value: "magic" },
                    { name: "Man", value: "man" },
                    { name: "Martial Arts", value: "martial-arts" },
                    { name: "Monsters", value: "monsters" },
                    { name: "Mystery", value: "mystery" },
                    { name: "Mythology", value: "mythology" },
                    { name: "Novel", value: "novel" },
                    { name: "Novel Adaptation", value: "novel-adaptation" },
                    { name: "Over Power", value: "over-power" },
                    { name: "Reincarnation", value: "reincarnation" },
                    { name: "Romance", value: "romance" },
                    { name: "School", value: "school" },
                    { name: "Sci-fi", value: "sci-fi" },
                    { name: "Shounen", value: "shounen" },
                    { name: "Slice of Life", value: "slice-of-life" },
                    { name: "Super Power", value: "super-power" },
                    { name: "Supernatural", value: "supernatural" },
                    { name: "Time Travel", value: "time-travel" },
                    { name: "Vitality-themed", value: "vitality-themed" },
                    { name: "War", value: "war" },
                    { name: "Xianxia", value: "xianxia" }
                ]
            }
        ];
    }
}
