const mangayomiSources = [{
    "name": "xHamster",
    "lang": "en",
    "baseUrl": "https://xhamster.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=xhamster.com",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.4",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/xhamster.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 202405141,
    "notes": "xHamster extension for video streaming",
    "pkgPath": "nsfw/xhamster.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._baseUrl = null;
    }

    get baseUrl() {
        if (!this._baseUrl) {
            var overrideUrl = new SharedPreferences().get("overrideBaseUrl");
            this._baseUrl = (overrideUrl && overrideUrl.trim() !== "")
                ? overrideUrl.trim()
                : "https://xhamster.com";
        }
        return this._baseUrl;
    }
    set baseUrl(v) { this._baseUrl = v; }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    // ── Decoding Logic ────────────────────────────────────────────────────────

    int_to_int32(val) {
        return val | 0;
    }

    decipher_hex_string(hex_string) {
        if (!hex_string || hex_string.length < 10) return null;
        
        const bytes = [];
        for (let i = 0; i < hex_string.length; i += 2) {
            bytes.push(parseInt(hex_string.substr(i, 2), 16));
        }

        const algo_id = bytes[0];
        let seed = this.int_to_int32(bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24));
        
        const algo = () => {
            switch (algo_id) {
                case 1:
                    seed = this.int_to_int32(Math.imul(seed, 1664525) + 1013904223);
                    return seed;
                case 2:
                    seed = this.int_to_int32(seed ^ (seed << 13));
                    seed = this.int_to_int32(seed ^ (seed >>> 17));
                    seed = this.int_to_int32(seed ^ (seed << 5));
                    return seed;
                case 3:
                    seed = this.int_to_int32(seed + 0x9e3779b9);
                    let s3 = this.int_to_int32(seed ^ (seed >>> 16));
                    s3 = this.int_to_int32(Math.imul(s3, 0x85ebca77));
                    s3 = this.int_to_int32(s3 ^ (s3 >>> 13));
                    s3 = this.int_to_int32(Math.imul(s3, 0xc2b2ae3d));
                    return this.int_to_int32(s3 ^ (s3 >>> 16));
                case 4:
                    seed = this.int_to_int32(seed + 0x6d2b79f5);
                    seed = this.int_to_int32((seed << 7) | (seed >>> 25));
                    seed = this.int_to_int32(seed + 0x9e3779b9);
                    seed = this.int_to_int32(seed ^ (seed >>> 11));
                    return this.int_to_int32(Math.imul(seed, 0x27d4eb2d));
                case 5:
                    seed = this.int_to_int32(seed ^ (seed << 7));
                    seed = this.int_to_int32(seed ^ (seed >>> 9));
                    seed = this.int_to_int32(seed ^ (seed << 8));
                    seed = this.int_to_int32(seed + 0xa5a5a5a5);
                    return seed;
                case 6:
                    seed = this.int_to_int32(Math.imul(seed, 0x2c9277b5) + 0xac564b05);
                    let s6 = this.int_to_int32(seed ^ (seed >>> 18));
                    let shift = (seed >>> 27) & 31;
                    return this.int_to_int32(s6 >>> shift);
                case 7:
                    seed = this.int_to_int32(seed + 0x9e3779b9);
                    let e = this.int_to_int32(seed ^ (seed << 5));
                    e = this.int_to_int32(Math.imul(e, 0x7feb352d));
                    e = this.int_to_int32(e ^ (e >>> 15));
                    return this.int_to_int32(Math.imul(e, 0x846ca68b));
                default:
                    return 0;
            }
        };

        let result = "";
        for (let i = 5; i < bytes.length; i++) {
            result += String.fromCharCode(bytes[i] ^ (algo() & 0xff));
        }
        return result;
    }

    decipher_format_url(format_url) {
        if (!format_url) return null;
        if (format_url.match(/^[0-9a-fA-F]{12,}$/)) {
            return this.decipher_hex_string(format_url);
        }
        
        const m = format_url.match(/\/([0-9a-fA-F]{12,})([\/,].+)$/);
        if (m) {
            const deciphered = this.decipher_hex_string(m[1]);
            if (deciphered) {
                return format_url.replace(m[1], deciphered);
            }
        }
        return format_url;
    }

    // ── Extension Methods ─────────────────────────────────────────────────────

    async getPopular(page) {
        return await this.search("", page, []);
    }

    async getLatestUpdates(page) {
        return await this.search("", page, [{ type_name: "SelectFilter", name: "Sort", state: 0 }]);
    }

    async search(query, page, filters) {
        let sort = "newest";
        let date = "";
        let duration = "";

        if (filters && filters.length > 0) {
            for (const filter of filters) {
                const selectedIndex = filter.state || 0;
                if (filter.name === "Sort" && filter.values) sort = filter.values[selectedIndex]?.value || "newest";
                if (filter.name === "Date" && filter.values) date = filter.values[selectedIndex]?.value || "";
                if (filter.name === "Duration" && filter.values) duration = filter.values[selectedIndex]?.value || "";
            }
        }

        let url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&page=${page}&sort=${sort}`;
        if (date) url += `&date=${date}`;
        if (duration) url += `&duration=${duration}`;

        if (!query) {
            url = `${this.baseUrl}/newest/${page}?sort=${sort}`;
            if (date) url += `&date=${date}`;
            if (duration) url += `&duration=${duration}`;
        }

        const res = await this.client.get(url, this.getHeaders());
        const body = res.body;

        // Try extracting from initials first
        const initialsMatch = body.match(/window\.initials\s*=\s*({[\s\S]+?})\s*;/);
        if (initialsMatch) {
            try {
                const initials = JSON.parse(initialsMatch[1]);
                if (initials.searchResult && initials.searchResult.videoThumbProps) {
                    const list = initials.searchResult.videoThumbProps.map(v => ({
                        name: v.title || "",
                        imageUrl: v.imageURL || v.thumbURL || "",
                        link: v.pageURL || ""
                    }));
                    return {
                        list: list,
                        hasNextPage: !!(initials.pagination && initials.pagination.next)
                    };
                }
            } catch (e) {}
        }

        const doc = new Document(body);
        const list = [];
        
        // Use a more specific selector to avoid featured/promoted rows that cause duplicates
        const items = doc.select(".thumb-list .video-thumb--type-video");
        for (const item of items) {
            const linkEl = item.selectFirst("a.video-thumb__image-container");
            const imgEl = linkEl ? linkEl.selectFirst("img") : null;
            if (linkEl && imgEl) {
                const name = imgEl.attr("alt") || item.selectFirst(".video-thumb-info__name")?.text || "";
                const imageUrl = imgEl.attr("data-src") || imgEl.attr("src") || "";
                const href = linkEl.attr("href") || "";

                if (href && (name || imageUrl)) {
                    list.push({
                        name: name,
                        imageUrl: imageUrl,
                        link: href
                    });
                }
            }
        }
        
        return {
            list: list,
            hasNextPage: doc.selectFirst("a[data-page='next'], a.pagination__next") !== null
        };
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Newest", value: "newest" },
                    { type_name: "SelectOption", name: "Popular", value: "popular" },
                    { type_name: "SelectOption", name: "Top Rated", value: "top-rated" },
                    { type_name: "SelectOption", name: "Views", value: "views" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Date",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Time", value: "" },
                    { type_name: "SelectOption", name: "Today", value: "today" },
                    { type_name: "SelectOption", name: "Weekly", value: "weekly" },
                    { type_name: "SelectOption", name: "Monthly", value: "monthly" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Duration",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Short (1-3 min)", value: "1-3" },
                    { type_name: "SelectOption", name: "Medium (3-10 min)", value: "3-10" },
                    { type_name: "SelectOption", name: "Long (10+ min)", value: "10-plus" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "overrideBaseUrl",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Change the base URL if the site has moved (e.g. https://xhamster.com)",
                    value: "https://xhamster.com"
                }
            }
        ];
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const body = res.body;
        const doc = new Document(body);
        
        const initialsMatch = body.match(/window\.initials\s*=\s*({.+?})\s*;/);
        let videoData = null;
        if (initialsMatch) {
            const initials = JSON.parse(initialsMatch[1]);
            videoData = initials.videoModel;
        }

        let title = videoData ? videoData.title : "";
        if (!title) {
            try { title = doc.selectFirst("h1").text; } catch(e) {}
        }
        
        let description = videoData ? videoData.description : "";
        if (!description) {
            try { description = doc.selectFirst(".video-description").text; } catch(e) {}
        }
        
        let genres = [];
        if (videoData && videoData.categories) {
            genres = videoData.categories.map(c => c.name);
        } else {
            try {
                const genreEls = doc.select(".video-tag-list a");
                for (const g of genreEls) {
                    genres.push(g.text);
                }
            } catch(e) {}
        }
        
        const chapters = [{
            name: "Video",
            url: url
        }];
        
        return {
            name: title,
            imageUrl: videoData ? videoData.thumbURL : "",
            description: description,
            genre: genres,
            status: 1, // Completed
            chapters: chapters
        };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const body = res.body;
        
        const initialsMatch = body.match(/window\.initials\s*=\s*({.+?})\s*;/);
        if (!initialsMatch) return [];
        
        const initials = JSON.parse(initialsMatch[1]);
        const xplayer_sources = initials.xplayerSettings ? initials.xplayerSettings.sources : 
                                (initials.videoModel ? initials.videoModel.sources : null);
        if (!xplayer_sources) return [];
        
        const videos = [];
        const headers = { "Referer": url, "User-Agent": this.getHeaders()["User-Agent"] };
        
        // Handle HLS sources
        if (xplayer_sources.hls) {
            const hls = xplayer_sources.hls;
            const hls_url = this.decipher_format_url(hls.url || hls.fallback);
            if (hls_url) {
                videos.push({
                    url: hls_url,
                    originalUrl: hls_url,
                    quality: "HLS (Multi)",
                    headers: headers
                });
            }
        }
        
        // Handle Standard sources
        if (xplayer_sources.standard) {
            // Prioritize h264 for compatibility
            const codecs = Object.keys(xplayer_sources.standard).sort((a, b) => {
                if (a === "h264") return -1;
                if (b === "h264") return 1;
                return 0;
            });

            for (const codec of codecs) {
                const formats = xplayer_sources.standard[codec];
                for (const format of formats) {
                    const format_url = this.decipher_format_url(format.url || format.fallback);
                    if (format_url) {
                        let qualityLabel = `${codec.toUpperCase()} ${format.quality || format.label || ""}`.trim();
                        if (format_url.includes(".m3u8")) {
                            qualityLabel += " (HLS)";
                        }
                        videos.push({
                            url: format_url,
                            originalUrl: format_url,
                            quality: qualityLabel,
                            headers: headers
                        });
                    }
                }
            }
        }
        
        return videos;
    }

    async getPageList(url) { return []; }
    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Newest", value: "newest" },
                    { type_name: "SelectOption", name: "Popular", value: "popular" },
                    { type_name: "SelectOption", name: "Top Rated", value: "top-rated" },
                    { type_name: "SelectOption", name: "Views", value: "views" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Date",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All Time", value: "" },
                    { type_name: "SelectOption", name: "Today", value: "today" },
                    { type_name: "SelectOption", name: "Weekly", value: "weekly" },
                    { type_name: "SelectOption", name: "Monthly", value: "monthly" }
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Duration",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Short (1-3 min)", value: "1-3" },
                    { type_name: "SelectOption", name: "Medium (3-10 min)", value: "3-10" },
                    { type_name: "SelectOption", name: "Long (10+ min)", value: "10-plus" }
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "overrideBaseUrl",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Change the base URL if the site has moved (e.g. https://xhamster.com)",
                    value: "https://xhamster.com"
                }
            }
        ];
    }
}

var extension = new DefaultExtension();
