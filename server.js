const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { loadExtension } = require('./emulator');

const app = express();
const PORT = process.env.PORT || 7860; // Hugging Face Spaces default port is 7860

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const localExtDir = path.join(__dirname, './extensions');
const devExtDir = path.join(__dirname, '../mangayomi-extensionsTEST/javascript/anime/src/en/working/');
const EXT_DIR = process.env.EXTENSIONS_DIR || 
                ((fs.existsSync(localExtDir) && fs.readdirSync(localExtDir).some(f => f.endsWith('.js'))) ? localExtDir : devExtDir);

console.log(`Scanning extensions in: ${EXT_DIR}`);

// Cache mapping: source_name/source_id -> extension info
const sourceCache = new Map();

function initCache() {
    sourceCache.clear();
    if (!fs.existsSync(EXT_DIR)) {
        console.warn(`Warning: Extension directory ${EXT_DIR} does not exist`);
        return;
    }
    const files = fs.readdirSync(EXT_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
        const fullPath = path.join(EXT_DIR, file);
        try {
            const { metadata } = loadExtension(fullPath);
            const meta = metadata[0];
            if (meta) {
                const info = {
                    filePath: fullPath,
                    name: meta.name,
                    id: meta.id,
                    lang: meta.lang,
                    version: meta.version,
                    baseUrl: meta.baseUrl,
                    iconUrl: meta.iconUrl,
                    isNsfw: meta.isNsfw
                };
                sourceCache.set(meta.name.toLowerCase(), info);
                sourceCache.set(String(meta.id), info);
                console.log(`Cached extension: ${meta.name} (ID: ${meta.id})`);
            }
        } catch (e) {
            console.error(`Failed to parse/cache ${file}:`, e.message);
        }
    }
}

// Initialize cache on startup
initCache();

function getExtensionInstance(sourceNameOrId, preferences = {}) {
    const info = sourceCache.get(sourceNameOrId.toLowerCase());
    if (!info) return null;
    return loadExtension(info.filePath, preferences);
}

// --- REST Endpoints ---

// Healthcheck/Welcome
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Mangayomi Extension Runner API is running',
        available_sources: Array.from(new Set(Array.from(sourceCache.values()).map(s => s.name)))
    });
});

// List all available sources
app.get('/api/sources', (req, res) => {
    const sources = Array.from(new Set(Array.from(sourceCache.values()).map(s => JSON.stringify({
        name: s.name,
        id: s.id,
        lang: s.lang,
        version: s.version,
        baseUrl: s.baseUrl,
        iconUrl: s.iconUrl,
        isNsfw: s.isNsfw
    })))).map(s => JSON.parse(s));
    res.json(sources);
});

// Refresh cache endpoint
app.post('/api/refresh', (req, res) => {
    try {
        initCache();
        res.json({ success: true, message: `Scanned and loaded ${sourceCache.size / 2} sources` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1. Get Popular listing
app.get('/api/:source/popular', async (req, res) => {
    const { source } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) return res.status(404).json({ error: `Source '${source}' not found` });
        
        console.log(`Fetching popular page ${page} from source '${ext.metadata[0].name}'`);
        const result = await ext.instance.getPopular(page);
        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/popular:`, e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Get Latest updates listing
app.get('/api/:source/latest', async (req, res) => {
    const { source } = req.params;
    const page = parseInt(req.query.page || '1', 10);
    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) return res.status(404).json({ error: `Source '${source}' not found` });
        
        console.log(`Fetching latest page ${page} from source '${ext.metadata[0].name}'`);
        const result = await ext.instance.getLatestUpdates(page);
        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/latest:`, e);
        res.status(500).json({ error: e.message });
    }
});

// 3. Search
app.get('/api/:source/search', async (req, res) => {
    const { source } = req.params;
    const { query } = req.query;
    const page = parseInt(req.query.page || '1', 10);
    
    // Parse filters query parameter if present
    let filters = [];
    if (req.query.filters) {
        try {
            filters = JSON.parse(req.query.filters);
        } catch (e) {
            console.warn(`Failed to parse filters JSON: ${req.query.filters}`);
        }
    }

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) return res.status(404).json({ error: `Source '${source}' not found` });
        
        console.log(`Searching for '${query}' page ${page} on source '${ext.metadata[0].name}'`);
        const result = await ext.instance.search(query || '', page, filters);
        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/search:`, e);
        res.status(500).json({ error: e.message });
    }
});

// 4. Detail (Get Anime Info & Episodes)
app.get('/api/:source/detail', async (req, res) => {
    const { source } = req.params;
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) return res.status(404).json({ error: `Source '${source}' not found` });
        
        console.log(`Fetching detail for '${url}' on source '${ext.metadata[0].name}'`);
        const result = await ext.instance.getDetail(url);
        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/detail:`, e);
        res.status(500).json({ error: e.message });
    }
});

// 5. Video List (Get Video Streams)
app.get('/api/:source/videos', async (req, res) => {
    const { source } = req.params;
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing required 'url' parameter" });

    try {
        const ext = getExtensionInstance(source, req.query);
        if (!ext) return res.status(404).json({ error: `Source '${source}' not found` });
        
        console.log(`Fetching videos for '${url}' on source '${ext.metadata[0].name}'`);
        const result = await ext.instance.getVideoList(url);
        res.json(result);
    } catch (e) {
        console.error(`Error on /api/${source}/videos:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Listen on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mangayomi Runner server running on port ${PORT}`);
});
