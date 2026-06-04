const mangayomiSources = [{
    "name": "FYPTT",
    "lang": "en",
    "baseUrl": "https://fyptt.to",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=fyptt.to",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.4",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "hasCloudflare": false,
    "sourceCodeUrl": "https://raw.githubusercontent.com/dito-dev/yomiextensionreal/main/nsfw/fyptt.js",
    "isFullData": false,
    "appMinVerReq": "0.5.0",
    "additionalParams": "",
    "sourceCodeLanguage": 1,
    "id": 88880001,
    "notes": "Short-form vertical video extension",
    "pkgPath": "nsfw/fyptt.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._baseUrl = "https://fyptt.to";
    }

    get baseUrl() {
        try {
            var overrideUrl = new SharedPreferences().get("overrideBaseUrl");
            if (overrideUrl && overrideUrl.trim() !== "") {
                return overrideUrl.trim();
            }
        } catch (e) {}
        return this._baseUrl;
    }
    set baseUrl(v) { this._baseUrl = v; }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    async getPopular(page) {
        return await this.search("", page, []);
    }

    async getLatestUpdates(page) {
        return await this.search("", page, []);
    }

    async search(query, page, filters) {
        let category = "";
        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.name === "Categories" && filter.values) {
                    category = filter.values[filter.state || 0].value;
                }
            }
        }

        let url = "";
        if (query) {
            url = `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        } else if (category) {
            url = `${this.baseUrl}/${category}/page/${page}/`;
        } else {
            url = `${this.baseUrl}/page/${page}/`;
        }

        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const videos = [];

        // Refined selector to only target video cards and ignore logos/placeholders
        const elements = doc.select(".fl-post-grid-image a:has(img)");
        for (const el of elements) {
            const href = el.attr("href");
            if (href && href.match(/\/\d+\/.+/)) {
                const imgEl = el.selectFirst("img");
                if (imgEl) {
                    const name = imgEl.attr("alt") || "No Title";
                    // Prioritizing actual image sources over placeholders
                    const imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || imgEl.attr("data-lazy-src") || "";
                    
                    if (name && imageUrl && !imageUrl.includes("logo")) {
                        videos.push({
                            name: name.trim(),
                            imageUrl: imageUrl,
                            link: href
                        });
                    }
                }
            }
        }

        return {
            list: videos,
            hasNextPage: doc.selectFirst("a.next, .pagination a:last-child") !== null
        };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const title = doc.selectFirst("h1.fl-post-title")?.text.trim() || "";
        const image = doc.selectFirst(".fl-post-content img")?.attr("src") || "";
        let iframe = doc.selectFirst("iframe[src*='fypttstr.php']")?.attr("src") || "";

        if (iframe && iframe.startsWith("//")) {
            iframe = "https:" + iframe;
        } else if (iframe && iframe.startsWith("/")) {
            iframe = this.baseUrl + iframe;
        }

        const episodes = [];
        if (iframe) {
            episodes.push({
                name: "Play Video",
                url: iframe
            });
        }

        return {
            name: title,
            imageUrl: image,
            description: "FYPTT Short Video",
            episodes: episodes
        };
    }

    async getVideoList(url) {
        if (!url) return [];
        
        const res = await this.client.get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": url // Use the iframe URL itself as referrer
        });
        
        const doc = new Document(res.body);
        
        // Try multiple selectors for the video source
        let source = doc.selectFirst("video source")?.attr("src") 
                   || doc.selectFirst("video")?.attr("src");

        // Fallback: Use Regex to find .mp4 link in the body
        if (!source) {
            const mp4Match = res.body.match(/src\s*=\s*"([^"]+\.mp4[^"]*)"/i);
            if (mp4Match) {
                source = mp4Match[1].replace(/&amp;/g, "&");
            }
        }
        
        if (source) {
            if (source.startsWith("//")) source = "https:" + source;
            if (source.startsWith("/")) source = this.baseUrl + source;

            return [{
                url: source,
                originalUrl: source,
                quality: "HD",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                    "Referer": this.baseUrl + "/"
                }
            }];
        }

        return [];
    }

    async getPageList(url) { return []; }

    getFilterList() {
        return [{
            type_name: "SelectFilter",
            name: "Categories",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "All", value: "" },
                { type_name: "SelectOption", name: "Nudes", value: "tiktok-nudes" },
                { type_name: "SelectOption", name: "TikTok", value: "tiktok-porn" },
                { type_name: "SelectOption", name: "Boobs", value: "tiktok-boobs" },
                { type_name: "SelectOption", name: "Instagram", value: "instagram-porn" },
                { type_name: "SelectOption", name: "Sex", value: "tiktok-sex" },
                { type_name: "SelectOption", name: "NSFW", value: "nsfw-tiktok" },
                { type_name: "SelectOption", name: "XXX", value: "tiktok-xxx" },
                { type_name: "SelectOption", name: "Ass", value: "tiktok-ass" },
                { type_name: "SelectOption", name: "Pussy", value: "tiktok-pussy" },
                { type_name: "SelectOption", name: "Live", value: "tiktok-live" },
                { type_name: "SelectOption", name: "Sexy", value: "sexy-tiktok" },
                { type_name: "SelectOption", name: "Thots", value: "tiktok-thots" }
            ]
        }];
    }

    getSourcePreferences() {
        return [{
            key: "overrideBaseUrl",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Change the base URL if the site has moved (e.g. https://fyptt.to)",
                value: "https://fyptt.to"
            }
        }];
    }
}

var extension = new DefaultExtension();
