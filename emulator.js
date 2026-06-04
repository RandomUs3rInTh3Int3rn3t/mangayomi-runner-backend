const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cheerio = require('cheerio');
const axios = require('axios');

// --- Cheerio wrappers to emulate Mangayomi's Document and Element APIs ---
class Element {
    constructor($el, $) {
        this.$el = $el;
        this.$ = $;
    }

    get text() {
        return this.$el.text();
    }

    attr(name) {
        return this.$el.attr(name);
    }

    selectFirst(selector) {
        const found = this.$el.find(selector).first();
        return found.length > 0 ? new Element(found, this.$) : null;
    }

    select(selector) {
        const list = [];
        this.$el.find(selector).each((i, el) => {
            list.push(new Element(this.$(el), this.$));
        });
        return list;
    }
}

class Document {
    constructor(html) {
        this.$ = cheerio.load(html);
    }

    selectFirst(selector) {
        const found = this.$(selector).first();
        return found.length > 0 ? new Element(found, this.$) : null;
    }

    select(selector) {
        const list = [];
        this.$(selector).each((i, el) => {
            list.push(new Element(this.$(el), this.$));
        });
        return list;
    }
}

// --- Axios wrapper to emulate Mangayomi's HTTP Client API ---
class Client {
    async get(url, headers = {}) {
        try {
            const cleanHeaders = {};
            for (const [k, v] of Object.entries(headers)) {
                if (v !== undefined && v !== null) {
                    cleanHeaders[k] = String(v);
                }
            }

            const response = await axios.get(url, {
                headers: cleanHeaders,
                responseType: 'text',
                validateStatus: () => true // Allow handling non-200 responses inside extensions
            });

            return {
                body: response.data,
                statusCode: response.status
            };
        } catch (error) {
            console.error(`Client.get error for ${url}:`, error.message);
            throw error;
        }
    }

    async post(url, headers = {}, body = '') {
        try {
            const cleanHeaders = {};
            for (const [k, v] of Object.entries(headers)) {
                if (v !== undefined && v !== null) {
                    cleanHeaders[k] = String(v);
                }
            }

            const response = await axios.post(url, body, {
                headers: cleanHeaders,
                responseType: 'text',
                validateStatus: () => true
            });

            return {
                body: response.data,
                statusCode: response.status
            };
        } catch (error) {
            console.error(`Client.post error for ${url}:`, error.message);
            throw error;
        }
    }
}

// --- Mock SharedPreferences ---
class SharedPreferences {
    constructor(initialStore = {}) {
        this.store = { ...initialStore };
    }

    get(key) {
        return this.store[key] || null;
    }

    set(key, value) {
        this.store[key] = value;
    }
}

class MProvider {}

/**
 * Loads and initializes a Mangayomi JS extension file inside a VM sandbox.
 * @param {string} filePath - Absolute path to the extension JS file.
 * @param {Object} preferences - Query-defined user preferences for SharedPreferences.
 * @returns {Object} Instantiated extension instance.
 */
function loadExtension(filePath, preferences = {}) {
    const extCode = fs.readFileSync(filePath, 'utf8');

    // Create the sandboxed context with all required classes and globals
    const sandbox = {
        MProvider,
        Client,
        Document,
        SharedPreferences: function() {
            return new SharedPreferences(preferences);
        },
        console: {
            log: (...args) => console.log(`[ExtLog][${path.basename(filePath)}]`, ...args),
            error: (...args) => console.error(`[ExtErr][${path.basename(filePath)}]`, ...args)
        },
        // Base64 helper globals (Node globals + atob/btoa fallback)
        atob: (str) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        Buffer,
        URL,
        URLSearchParams,
        JSON,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval
    };

    const context = vm.createContext(sandbox);

    // Run the extension script
    vm.runInContext(extCode, context, { filename: filePath });

    // Retrieve DefaultExtension and mangayomiSources using runInContext to bypass class/const context property binding limits
    let DefaultExtension;
    try {
        DefaultExtension = vm.runInContext('DefaultExtension', context);
    } catch (e) {
        // ignore
    }

    if (!DefaultExtension) {
        throw new Error(`Extension in ${filePath} does not define 'DefaultExtension' class`);
    }

    let metadata = [];
    try {
        metadata = vm.runInContext('mangayomiSources', context);
    } catch (e) {
        // ignore
    }

    const instance = new DefaultExtension();

    return {
        instance,
        metadata
    };
}

module.exports = {
    loadExtension
};
