const mangayomiSources = [{
    "name": "Oppai Stream",
    "lang": "en",
    "baseUrl": "https://oppai.stream",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=oppai.stream",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.1.12",
    "dateFormat": "",
    "dateFormatLocale": "",
    "isNsfw": true,
    "pkgPath": "nsfw/oppaistream.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // NOTE: Do NOT call SharedPreferences here — sendMessage() is a
        // synchronous FFI callback that acquires the Dart isolate lock.
        // Calling it during construction (which itself runs inside _init())
        // causes a re-entrant lock acquisition that crashes the QuickJS
        // TrampolinePage (js_channel+100, libqjs.so) in Nuord v3.3.2+.
        // Base URL is resolved lazily on first access instead.
        this._baseUrl = null;
    }

    // Lazy getter — SharedPreferences is safe to call here because any
    // caller of baseUrl runs *after* _init() has completed.
    get baseUrl() {
        if (!this._baseUrl) {
            var overrideUrl = new SharedPreferences().get("overrideBaseUrl");
            this._baseUrl = (overrideUrl && overrideUrl.trim() !== "")
                ? overrideUrl.trim()
                : "https://oppai.stream";
        }
        return this._baseUrl;
    }
    set baseUrl(v) { this._baseUrl = v; }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders() {
        return {
            "Referer": "https://oppai.stream/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.48 Safari/537.36"
        };
    }

    async request(url) {
        const res = await this.client.get(url, this.getHeaders());
        return new Document(res.body);
    }

    async requestRaw(url) {
        const res = await this.client.get(url, this.getHeaders());
        return res.body;
    }

    // URL-encode spaces and special chars in thumbnail paths
    // myspacecat.pictures serves folder-based paths with unencoded spaces
    encodeImageUrl(url) {
        if (!url) return "";
        try {
            var match = url.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
            if (match) {
                var host = match[1];
                var path = match[2] || "";
                var segments = path.split("/");
                var encodedSegments = [];
                for (var i = 0; i < segments.length; i++) {
                    encodedSegments.push(encodeURIComponent(segments[i]));
                }
                return host + encodedSegments.join("/");
            }
        } catch (e) { }
        return url;
    }

    async getPopular(page) {
        const url = `${this.baseUrl}/actions/search.php?order=views&page=${page}&limit=36&genres=&blacklist=&studio=&ibt=0&swa=1&text=`;
        
        try {
            console.log("Fetching: " + url);
            const doc = await this.request(url);
            const list = [];
            
            const elements = doc.select("div.in-grid.episode-shown");
            console.log("Found elements: " + elements.length);
            
            for (const element of elements) {
                try {
                    const linkElement = element.selectFirst("a");
                    let link = linkElement?.attr("href") || linkElement?.getHref || "";
                    
                    if (link.includes("&for=search")) {
                        link = link.replace("&for=search", "");
                    }
                    
                    const name = element.selectFirst(".title-ep")?.text?.trim() || 
                                element.selectFirst("h5")?.text?.trim() || "";
                    
                    const imageUrl = this.encodeImageUrl(
                        element.selectFirst("img.cover-img-in")?.attr("src") ||
                        element.selectFirst("img.cover-img-in")?.attr("original") ||
                        element.selectFirst("img")?.attr("src") ||
                        element.selectFirst("img")?.attr("original") || ""
                    );
                    
                    if (name && link) {
                        list.push({ name, imageUrl, link });
                        console.log("Added: " + name);
                    }
                } catch (e) {
                    console.log("Element error: " + e);
                    continue;
                }
            }
            
            const hasNextPage = list.length >= 36;
            console.log("Total items: " + list.length);
            
            return { list, hasNextPage };
        } catch (e) {
            console.log("getPopular error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async getLatestUpdates(page) {
        const url = `${this.baseUrl}/actions/search.php?order=recent&page=${page}&limit=36&genres=&blacklist=&studio=&ibt=0&swa=1&text=`;
        
        try {
            console.log("Fetching: " + url);
            const doc = await this.request(url);
            const list = [];
            
            const elements = doc.select("div.in-grid.episode-shown");
            console.log("Found elements: " + elements.length);
            
            for (const element of elements) {
                try {
                    const linkElement = element.selectFirst("a");
                    let link = linkElement?.attr("href") || linkElement?.getHref || "";
                    
                    if (link.includes("&for=search")) {
                        link = link.replace("&for=search", "");
                    }
                    
                    const name = element.selectFirst(".title-ep")?.text?.trim() || 
                                element.selectFirst("h5")?.text?.trim() || "";
                    
                    const imageUrl = this.encodeImageUrl(
                        element.selectFirst("img.cover-img-in")?.attr("src") ||
                        element.selectFirst("img.cover-img-in")?.attr("original") ||
                        element.selectFirst("img")?.attr("src") ||
                        element.selectFirst("img")?.attr("original") || ""
                    );
                    
                    if (name && link) {
                        list.push({ name, imageUrl, link });
                    }
                } catch (e) {
                    continue;
                }
            }
            
            const hasNextPage = list.length >= 36;
            return { list, hasNextPage };
        } catch (e) {
            console.log("getLatestUpdates error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    async search(query, page, filters) {
        let order = "recent";
        
        if (filters && filters.length > 0 && filters[0].values) {
            const selectedIndex = filters[0].state || 0;
            order = filters[0].values[selectedIndex]?.value || "recent";
        }
        
        const url = `${this.baseUrl}/actions/search.php?order=${order}&page=${page}&limit=36&genres=&blacklist=&studio=&ibt=0&swa=1&text=${encodeURIComponent(query)}`;
        
        try {
            const doc = await this.request(url);
            const list = [];
            
            const elements = doc.select("div.in-grid.episode-shown");
            
            for (const element of elements) {
                try {
                    const linkElement = element.selectFirst("a");
                    let link = linkElement?.attr("href") || linkElement?.getHref || "";
                    
                    if (link.includes("&for=search")) {
                        link = link.replace("&for=search", "");
                    }
                    
                    const name = element.selectFirst(".title-ep")?.text?.trim() || 
                                element.selectFirst("h5")?.text?.trim() || "";
                    
                    const imageUrl = this.encodeImageUrl(
                        element.selectFirst("img.cover-img-in")?.attr("src") ||
                        element.selectFirst("img.cover-img-in")?.attr("original") ||
                        element.selectFirst("img")?.attr("src") ||
                        element.selectFirst("img")?.attr("original") || ""
                    );
                    
                    if (name && link) {
                        list.push({ name, imageUrl, link });
                    }
                } catch (e) {
                    continue;
                }
            }
            
            const hasNextPage = list.length >= 36;
            return { list, hasNextPage };
        } catch (e) {
            console.log("search error: " + e);
            return { list: [], hasNextPage: false };
        }
    }

    getAnimeSlugFromUrl(url) {
        try {
            if (url.includes("?e=")) {
                return url.split("?e=")[1].split("&")[0];
            }
        } catch (e) {}
        return "";
    }

    getBaseAnimeName(slug) {
        const parts = slug.split("-");
        if (parts.length > 1) {
            const lastPart = parts[parts.length - 1];
            if (/^\d+$/.test(lastPart)) {
                return parts.slice(0, -1).join("-");
            }
        }
        return slug;
    }

    async getDetail(url) {
        let fullUrl = url;
        if (!url.startsWith("http")) {
            fullUrl = `${this.baseUrl}${url}`;
        }
        
        try {
            console.log("Getting detail: " + fullUrl);
            const html = await this.requestRaw(fullUrl);
            const doc = new Document(html);
            
            const imageUrl = doc.selectFirst(".poster img")?.getSrc || 
                            doc.selectFirst("img.poster")?.getSrc ||
                            doc.selectFirst("meta[property='og:image']")?.attr("content") ||
                            doc.selectFirst(".thumb img")?.getSrc ||
                            doc.selectFirst("img")?.getSrc || "";
            
            const title = doc.selectFirst("h1")?.text?.trim() || 
                         doc.selectFirst(".title")?.text?.trim() ||
                         doc.selectFirst("meta[property='og:title']")?.attr("content") || "";
            
            const description = doc.selectFirst(".description")?.text?.trim() || 
                               doc.selectFirst(".synopsis")?.text?.trim() ||
                               doc.selectFirst("meta[property='og:description']")?.attr("content") || "";
            
            const genreElements = doc.select(".genres a, .genre a, .tags a");
            const genre = [];
            for (const el of genreElements) {
                const g = el.text?.trim();
                if (g) genre.push(g);
            }
            
            const currentSlug = this.getAnimeSlugFromUrl(fullUrl);
            console.log("Current slug: " + currentSlug);

            const chapters = [];

            // --- Primary strategy: episode number buttons (div.more-eps-p a.show-ep-num) ---
            // These are statically rendered in the HTML and contain all same-series episodes.
            // URL format: /watch?e=<slug>  (no &for= noise)
            const epNumLinks = doc.select("div.more-eps-p a.show-ep-num");
            console.log("Episode number links found: " + epNumLinks.length);

            for (const link of epNumLinks) {
                try {
                    let epUrl = link.attr("href") || link.getHref || "";
                    if (!epUrl) continue;
                    if (!epUrl.startsWith("http")) {
                        epUrl = `${this.baseUrl}${epUrl}`;
                    }
                    const epSlug = this.getAnimeSlugFromUrl(epUrl);
                    const epMatch = epSlug.match(/-(\d+)$/);
                    const epNum = epMatch ? epMatch[1] : link.text?.trim() || "";
                    const name = epNum ? `Episode ${epNum}` : "Episode";
                    if (!chapters.some(c => c.url === epUrl)) {
                        chapters.push({ name, url: epUrl, dateUpload: null });
                        console.log("Added ep (num-btn): " + name + " -> " + epUrl);
                    }
                } catch (e) {
                    continue;
                }
            }

            // --- Secondary strategy: more-same-eps card grid ---
            // Fallback when the number buttons are missing/empty (shouldn't happen normally).
            if (chapters.length === 0) {
                const baseAnimeName = this.getBaseAnimeName(currentSlug);
                console.log("Fallback: base anime name = " + baseAnimeName);
                const episodeElements = doc.select("div.more-same-eps div.in-grid.episode-shown");
                console.log("Card elements found: " + episodeElements.length);
                for (const element of episodeElements) {
                    try {
                        const linkEl = element.selectFirst("a");
                        let episodeUrl = linkEl?.attr("href") || linkEl?.getHref || "";
                        if (!episodeUrl) continue;
                        episodeUrl = episodeUrl.replace("&for=episode-more", "");
                        if (!episodeUrl.startsWith("http")) {
                            episodeUrl = `${this.baseUrl}${episodeUrl}`;
                        }
                        const epSlug = this.getAnimeSlugFromUrl(episodeUrl);
                        const epBase = this.getBaseAnimeName(epSlug);
                        if (baseAnimeName && epBase && epBase.toLowerCase() === baseAnimeName.toLowerCase()) {
                            const epMatch = epSlug.match(/-(\d+)$/);
                            const name = epMatch ? `Episode ${epMatch[1]}` : "Episode";
                            if (!chapters.some(c => c.url === episodeUrl)) {
                                chapters.push({ name, url: episodeUrl, dateUpload: null });
                                console.log("Added ep (card): " + name + " -> " + episodeUrl);
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            // Always ensure the current episode is included
            if (!chapters.some(c => c.url === fullUrl)) {
                const epMatch = currentSlug.match(/-(\d+)$/);
                const epNum = epMatch ? epMatch[1] : "1";
                chapters.unshift({
                    name: `Episode ${epNum}`,
                    url: fullUrl,
                    dateUpload: null
                });
            }

            chapters.sort((a, b) => {
                const numA = parseInt(a.name.match(/\d+/)?.[0] || "0", 10);
                const numB = parseInt(b.name.match(/\d+/)?.[0] || "0", 10);
                return numA - numB;
            });
            
            return {
                title,
                imageUrl,
                description,
                genre,
                author: "",
                artist: "",
                status: 5,
                chapters
            };
        } catch (e) {
            console.log("getDetail error: " + e);
            return {
                title: "",
                imageUrl: "",
                description: "",
                genre: [],
                author: "",
                artist: "",
                status: 5,
                chapters: [{ name: "Episode 1", url: fullUrl, dateUpload: null }]
            };
        }
    }

    // ── Subtitle URL builder ──────────────────────────────────────────────────
    // Oppai.stream serves subtitles alongside every video on myspacecat.pictures.
    // Pattern: https://myspacecat.pictures/{Anime}/{Quality}/E{N}.mp4
    //      →   https://myspacecat.pictures/{Anime}/{Quality}/E{N}_SUB_1.vtt?v=1
    //
    // IMPORTANT: We return the raw VTT URL, NOT a data: URI.
    // Embedding the full VTT content as a percent-encoded data: string easily
    // produces 200 KB–1 MB payloads. The QuickJS TrampolinePage in Nuord v3.3.2
    // caps each js_channel slab at 512 KB; exceeding this causes a native crash
    // (js_channel+100 / FfiCallbackMetadata::TrampolinePage). The native player
    // in watch_screen.dart handles .vtt URLs directly via SubtitleTrack.
    buildSubtitleUrl(videoUrl) {
        if (!videoUrl.includes("myspacecat.pictures")) return null;
        try {
            // Strip query params and trailing slashes
            let cleanUrl = videoUrl.split('?')[0].split('#')[0];
            if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);

            // 1. Handle HLS/DASH folders: .../E01_dash/index.m3u8 → .../E01_SUB_1.vtt
            const folderMatch = cleanUrl.match(/^(https?:\/\/.+?\/E\d+)(?:_dash|_hls).*/);
            if (folderMatch) {
                return folderMatch[1] + "_SUB_1.vtt?v=1";
            }

            // 2. Handle direct files: .../E01.mp4 → .../E01_SUB_1.vtt
            const fileMatch = cleanUrl.match(/^(https?:\/\/.+?\/E\d+)(?:\.mp4|\.m3u8|\.mpd)$/);
            if (fileMatch) {
                return fileMatch[1] + "_SUB_1.vtt?v=1";
            }

            // 3. Generic fallback for any myspacecat episode URL
            if (cleanUrl.match(/\/E\d+/)) {
                const genericMatch = cleanUrl.match(/^(https?:\/\/.+?)\.[a-z0-9]{2,5}$/);
                if (genericMatch) {
                    return genericMatch[1] + "_SUB_1.vtt?v=1";
                }
            }
        } catch (e) {
            console.log("buildSubtitleUrl error: " + e);
        }
        return null;
    }

    async getVideoList(url) {
        let fullUrl = url;
        if (!url.startsWith("http")) {
            if (url.startsWith("://")) {
                fullUrl = "https" + url;
            } else if (url.startsWith("/")) {
                fullUrl = this.baseUrl + url;
            } else {
                fullUrl = this.baseUrl + "/" + url;
            }
        }
        
        console.log("Getting videos for: " + fullUrl);
        
        try {
            const res = await this.client.get(fullUrl, this.getHeaders());
            console.log("Response status: " + res.statusCode);
            
            if (res.statusCode !== 200) {
                console.log("Failed to fetch page, status: " + res.statusCode);
                return [];
            }
            
            const html = res.body;
            const doc = new Document(html);
            const videos = [];
            
            const iframes = doc.select("iframe[src]");
            console.log("Found iframes: " + iframes.length);
            
            for (const iframe of iframes) {
                const iframeSrc = iframe.attr("src") || iframe.getSrc || "";
                if (iframeSrc && !iframeSrc.includes("google") && !iframeSrc.includes("ads")) {
                    console.log("Processing iframe: " + iframeSrc);
                    
                    let iframeFullUrl = iframeSrc;
                    if (!iframeSrc.startsWith("http")) {
                        if (iframeSrc.startsWith("//")) {
                            iframeFullUrl = "https:" + iframeSrc;
                        } else {
                            iframeFullUrl = this.baseUrl + iframeSrc;
                        }
                    }
                    
                    try {
                        const iframeRes = await this.client.get(iframeFullUrl, {
                            "Referer": fullUrl,
                            "User-Agent": this.getHeaders()["User-Agent"]
                        });
                        
                        if (iframeRes.statusCode === 200) {
                            const iframeHtml = iframeRes.body;
                            
                            const m3u8Matches = iframeHtml.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g) || [];
                            for (const m3u8 of m3u8Matches) {
                                if (!videos.some(v => v.url === m3u8)) {
                                    const qualityMatch = m3u8.match(/\/(\d{3,4})\//);
                                    videos.push({
                                        url: m3u8,
                                        originalUrl: m3u8,
                                        quality: `Oppai Stream - ${qualityMatch ? qualityMatch[1] + 'p' : 'Auto'}`,
                                        headers: { "Referer": iframeFullUrl }
                                    });
                                    console.log("Found m3u8: " + m3u8);
                                }
                            }
                            
                            const mp4Matches = iframeHtml.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g) || [];
                            for (const mp4 of mp4Matches) {
                                if (!videos.some(v => v.url === mp4)) {
                                    const qualityMatch = mp4.match(/\/(\d{3,4})\//);
                                    videos.push({
                                        url: mp4,
                                        originalUrl: mp4,
                                        quality: `Oppai Stream - ${qualityMatch ? qualityMatch[1] + 'p' : 'Default'}`,
                                        headers: { "Referer": iframeFullUrl }
                                    });
                                    console.log("Found mp4: " + mp4);
                                }
                            }
                            
                            if (iframeHtml.includes("eval(function(p,a,c,k,e,d)")) {
                                console.log("Found packed JS in iframe");
                                const packedUrls = iframeHtml.match(/https?:\\\/\\\/[^"']+\.(?:m3u8|mp4)[^"']*/g) || [];
                                for (let packedUrl of packedUrls) {
                                    packedUrl = packedUrl.replace(/\\\//g, '/');
                                    if (!videos.some(v => v.url === packedUrl)) {
                                        videos.push({
                                            url: packedUrl,
                                            originalUrl: packedUrl,
                                            quality: "Oppai Stream - Packed",
                                            headers: { "Referer": iframeFullUrl }
                                        });
                                    }
                                }
                            }
                        }
                    } catch (iframeErr) {
                        console.log("Iframe fetch error: " + iframeErr);
                    }
                }
            }
            
            const m3u8Regex = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g;
            const mp4Regex = /https?:\/\/[^\s"']+\.mp4[^\s"']*/g;
            
            const m3u8Matches = html.match(m3u8Regex) || [];
            const mp4Matches = html.match(mp4Regex) || [];
            
            for (const m3u8 of m3u8Matches) {
                if (!videos.some(v => v.url === m3u8)) {
                    videos.push({
                        url: m3u8,
                        originalUrl: m3u8,
                        quality: "Oppai Stream - HLS",
                        headers: this.getHeaders()
                    });
                }
            }
            
            for (const mp4 of mp4Matches) {
                if (!videos.some(v => v.url === mp4)) {
                    videos.push({
                        url: mp4,
                        originalUrl: mp4,
                        quality: "Oppai Stream - MP4",
                        headers: this.getHeaders()
                    });
                }
            }
            
            const videoElements = doc.select("video source[src], video[src]");
            for (const video of videoElements) {
                const src = video.attr("src") || "";
                if (src && !videos.some(v => v.url === src)) {
                    videos.push({
                        url: src.startsWith("http") ? src : this.baseUrl + src,
                        originalUrl: src,
                        quality: "Oppai Stream - Direct",
                        headers: this.getHeaders()
                    });
                }
            }
            
            // Sort by preferred quality — put preferred resolution first
            const prefQuality = new SharedPreferences().get("preferred_quality") || "1080";
            videos.sort((a, b) => {
                const aMatch = (a.quality || "").includes(prefQuality) ? 0 : 1;
                const bMatch = (b.quality || "").includes(prefQuality) ? 0 : 1;
                return aMatch - bMatch;
            });

            // Attach subtitles when the setting is enabled.
            // Return the raw VTT URL — NOT a data: URI — so the FFI payload
            // stays small. The native player in watch_screen.dart handles
            // remote .vtt URLs directly via SubtitleTrack.
            const loadSubs = new SharedPreferences().get("load_subtitles");
            const wantSubs = (loadSubs === undefined || loadSubs === true || loadSubs === "true");
            if (wantSubs) {
                console.log("Attaching subtitle URLs for " + videos.length + " videos");
                for (const video of videos) {
                    try {
                        const subUrl = this.buildSubtitleUrl(video.url);
                        if (subUrl) {
                            video.subtitles = [{ file: subUrl, label: "English" }];
                            console.log("Subtitle URL attached: " + subUrl);
                        }
                    } catch (subErr) {
                        console.log("Subtitle attach error: " + subErr);
                    }
                }
            }

            console.log("Total videos found: " + videos.length);
            return videos;
        } catch (e) {
            console.log("getVideoList error: " + e);
            return [];
        }
    }

    async getPageList(url) {
        return [];
    }

    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select your preferred video resolution",
                    valueIndex: 0,
                    entries: ["1080p", "720p", "480p", "360p"],
                    entryValues: ["1080", "720", "480", "360"]
                }
            },
            {
                key: "load_subtitles",
                switchPreferenceCompat: {
                    title: "Load Subtitles",
                    summary: "Automatically attach English subtitles (VTT) when available",
                    value: true
                }
            },
            {
                // NOTE: Only 'title', 'summary', and 'value' are supported by
                // SourcePreference.fromJson() in the bridge (v0.0.4). The keys
                // 'dialogTitle' and 'dialogMessage' are NOT in the schema and
                // cause an offset overflow in the QuickJS TrampolinePage when
                // getSourcePreferences() is called, crashing the app at startup.
                key: "overrideBaseUrl",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Change the base URL if the site has moved (e.g. https://oppai.stream)",
                    value: "https://oppai.stream"
                }
            }
        ];
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort By",
                state: 0,
                values: [
                    { type_name: "SelectOption", name: "Recent", value: "recent" },
                    { type_name: "SelectOption", name: "Most Views", value: "views" },
                    { type_name: "SelectOption", name: "Top Rated", value: "rating" },
                    { type_name: "SelectOption", name: "A-Z", value: "az" },
                    { type_name: "SelectOption", name: "Z-A", value: "za" },
                ]
            }
        ];
    }
}

var extension = new DefaultExtension();



