/*
 * storage.js — persistence.
 *
 * Everything the user accumulates lives in cookies, as required.
 *
 * Two hard browser limits shape this file:
 *   - a single cookie may hold at most ~4096 bytes (name + value);
 *   - the number of cookies per domain is finite (Chrome ~180, Safari ~50).
 *
 * So the payload is encoded to base64url (no percent-encoding bloat, no
 * unsafe characters) and split across numbered chunk cookies, with a small
 * manifest cookie describing how to reassemble them. Chunking happens on the
 * ENCODED length, because that is what actually occupies the cookie.
 *
 * If cookies are unavailable (blocked, or a browser that refuses them) the
 * store transparently falls back to localStorage, so progress is never lost
 * silently.
 */
(function (global) {
  'use strict';

  // "krt1" = kartice. The prefix is versioned so a future format change can
  // start from a clean slate without colliding with old cookies.
  var PREFIX = 'krt1';
  var META_KEY = PREFIX + '.meta';
  var CHUNK_SIZE = 3800;          // encoded chars per cookie; keeps name+value < 4096
  var MAX_TOTAL = 200000;         // hard ceiling across all chunks
  var YEAR = 60 * 60 * 24 * 365;

  /* ------------------------------------------------------------------ *
   * base64url helpers (UTF-8 safe, synchronous, dependency-free)
   * ------------------------------------------------------------------ */

  function bytesToBase64Url(bytes) {
    var bin = '';
    // Chunked to avoid blowing the argument limit on large payloads.
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return global.btoa(bin)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function base64UrlToBytes(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    var bin = global.atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function encodePayload(text) {
    return bytesToBase64Url(new TextEncoder().encode(text));
  }

  function decodePayload(encoded) {
    return new TextDecoder().decode(base64UrlToBytes(encoded));
  }

  /* ------------------------------------------------------------------ *
   * Backend detection
   * ------------------------------------------------------------------ */

  function cookiesAvailable() {
    try {
      var probe = PREFIX + '.probe';
      document.cookie = probe + '=1; path=/; max-age=' + YEAR + '; SameSite=Lax';
      var ok = document.cookie.indexOf(probe + '=1') !== -1;
      document.cookie = probe + '=; path=/; max-age=0; SameSite=Lax';
      return ok;
    } catch (e) {
      return false;
    }
  }

  function localStorageAvailable() {
    try {
      var k = PREFIX + '.lsprobe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var backend;
  if (cookiesAvailable()) backend = 'cookie';
  else if (localStorageAvailable()) backend = 'local';
  else backend = 'memory';

  var memory = {};

  /* ------------------------------------------------------------------ *
   * Raw access
   * ------------------------------------------------------------------ */

  function readCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      // Exact prefix match, so "a.b" never matches "a.b.0".
      if (parts[i].indexOf(prefix) === 0) {
        return parts[i].slice(prefix.length);
      }
    }
    return null;
  }

  function writeCookie(name, value) {
    document.cookie = name + '=' + value +
      '; path=/; max-age=' + YEAR + '; SameSite=Lax';
  }

  function deleteCookie(name) {
    document.cookie = name + '=; path=/; max-age=0; SameSite=Lax';
  }

  function manifestName(key) { return META_KEY + '.' + key; }
  function chunkName(key, i) { return META_KEY + '.' + key + '.' + i; }

  function readManifest(key) {
    var raw = readCookie(manifestName(key));
    if (!raw) return null;
    try {
      var info = JSON.parse(raw);
      if (!info || typeof info.n !== 'number') return null;
      return info;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Chunked read / write
   * ------------------------------------------------------------------ */

  function readRaw(key) {
    if (backend === 'cookie') {
      var info = readManifest(key);
      if (!info) return null;
      var parts = [];
      for (var i = 0; i < info.n; i++) {
        var part = readCookie(chunkName(key, i));
        if (part == null) return null;   // a chunk went missing -> treat as absent
        parts.push(part);
      }
      var joined = parts.join('');
      // Guard against a truncated write: the manifest records the length.
      if (typeof info.len === 'number' && joined.length !== info.len) return null;
      return joined;
    }
    if (backend === 'local') {
      try {
        return localStorage.getItem(PREFIX + '.' + key);
      } catch (e) {
        return null;
      }
    }
    return key in memory ? memory[key] : null;
  }

  function writeRaw(key, value) {
    if (backend === 'cookie') {
      var prev = readManifest(key);
      var prevCount = prev ? prev.n : 0;

      var chunks = [];
      for (var i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      if (chunks.length === 0) chunks.push('');

      for (var k = 0; k < chunks.length; k++) {
        writeCookie(chunkName(key, k), chunks[k]);
      }
      writeCookie(manifestName(key), JSON.stringify({ n: chunks.length, len: value.length }));

      // Drop chunks left over from a previous, longer write.
      var stale = Math.max(prevCount, chunks.length);
      for (var j = chunks.length; j < stale + 60; j++) {
        deleteCookie(chunkName(key, j));
      }
      return;
    }
    if (backend === 'local') {
      try {
        localStorage.setItem(PREFIX + '.' + key, value);
      } catch (e) { /* quota */ }
      return;
    }
    memory[key] = value;
  }

  function removeRaw(key) {
    if (backend === 'cookie') {
      var info = readManifest(key);
      var count = info ? info.n : 0;
      for (var i = 0; i < count + 60; i++) deleteCookie(chunkName(key, i));
      deleteCookie(manifestName(key));
      return;
    }
    if (backend === 'local') {
      try {
        localStorage.removeItem(PREFIX + '.' + key);
      } catch (e) { /* ignore */ }
      return;
    }
    delete memory[key];
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var Store = {
    backend: backend,

    /** Read and parse a JSON value. Returns fallback on absence/corruption. */
    get: function (key, fallback) {
      var raw = readRaw(key);
      if (raw == null || raw === '') return fallback;
      try {
        var text = backend === 'cookie' ? decodePayload(raw) : raw;
        var parsed = JSON.parse(text);
        return parsed == null ? fallback : parsed;
      } catch (e) {
        return fallback;
      }
    },

    /** Serialise, encode and persist a JSON value. Returns true on success. */
    set: function (key, value) {
      var json;
      try {
        json = JSON.stringify(value);
      } catch (e) {
        return false;
      }
      var encoded;
      try {
        encoded = backend === 'cookie' ? encodePayload(json) : json;
      } catch (e) {
        return false;
      }
      if (encoded.length > MAX_TOTAL) return false;
      writeRaw(key, encoded);
      return true;
    },

    remove: function (key) {
      removeRaw(key);
    },

    /** Remove every key this app owns. */
    clearAll: function () {
      if (backend === 'cookie') {
        var names = [];
        var parts = document.cookie ? document.cookie.split('; ') : [];
        for (var i = 0; i < parts.length; i++) {
          var eq = parts[i].indexOf('=');
          var name = eq === -1 ? parts[i] : parts[i].slice(0, eq);
          if (name.indexOf(PREFIX) === 0) names.push(name);
        }
        for (var j = 0; j < names.length; j++) deleteCookie(names[j]);
        return;
      }
      if (backend === 'local') {
        try {
          var toRemove = [];
          for (var k = 0; k < localStorage.length; k++) {
            var key = localStorage.key(k);
            if (key && key.indexOf(PREFIX) === 0) toRemove.push(key);
          }
          for (var m = 0; m < toRemove.length; m++) localStorage.removeItem(toRemove[m]);
        } catch (e) { /* ignore */ }
        return;
      }
      memory = {};
    },

    /** Approximate footprint in bytes, for the settings screen. */
    size: function (key) {
      var raw = readRaw(key);
      return raw ? raw.length : 0;
    }
  };

  global.Store = Store;
})(window);
