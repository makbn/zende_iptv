/* eslint-disable */
/**
 * ES5-compatible client for old TV browsers (Tizen 3.x–6.0, webOS, etc.).
 */
(function () {
  "use strict";

  var Z_ACCESS = "zende.accessToken";
  var Z_REFRESH = "zende.refreshToken";
  var PREFER_MODERN_KEY = "zende.preferModern";
  var PREFER_MODERN_COOKIE = "zende-prefer-modern=1; path=/; max-age=31536000";
  var PRESET_ID = "iptv-org-world-index";
  var SERIES_PREFIX = "zende://series/";
  var CATALOG_LIMIT = 200;
  var SEARCH_LIMIT = 120;

  var state = {
    authEnabled: false,
    user: null,
    tab: "home",
    libraryFilter: "all",
    searchQuery: "",
    shelves: null,
    focusIndex: 0,
    tiles: [],
    playing: null,
    hls: null,
    seriesContainer: null,
    seriesTitle: "",
    seriesId: "",
    searchOffset: 0,
    searchTotal: 0,
    currentScreen: null,
  };

  function destroyHls() {
    if (state.hls) {
      try {
        state.hls.destroy();
      } catch (e) {}
      state.hls = null;
    }
  }

  function absoluteUrl(path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    var origin =
      window.location.origin ||
      window.location.protocol + "//" + window.location.host;
    return origin + (path.charAt(0) === "/" ? path : "/" + path);
  }

  function backendImageUrl(url) {
    var raw = String(url || "").replace(/^\s+|\s+$/g, "");
    if (!raw) return "";
    if (/^\/[^/]/.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)) return raw;
    if (/^\/\//.test(raw)) raw = "https:" + raw;
    if (!/^https?:\/\//i.test(raw)) return raw;
    var bytes = new TextEncoder().encode("logo\0" + raw);
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    var encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return "/api/media/image/" + encoded;
  }

  function inferPlaybackMode(url, mode) {
    if (mode === "hls" || mode === "mpegts" || mode === "progressive") return mode;
    var lower = String(url || "").toLowerCase();
    if (/\.m3u8(\?|#|$)/.test(lower)) return "hls";
    if (/\/live\//.test(lower) && /\.ts(\?|#|$)/.test(lower)) return "mpegts";
    if (/\.(mp4|mkv|webm|m4v|mov)(\?|#|$)/.test(lower)) return "progressive";
    if (/\/api\/stream\/proxy\//.test(lower)) return "hls";
    return "hls";
  }

  function canPlayNativeHls(video) {
    return !!(
      video &&
      video.canPlayType &&
      (video.canPlayType("application/vnd.apple.mpegurl") ||
        video.canPlayType("application/x-mpegurl"))
    );
  }

  function hlsJsSupported() {
    return !!(window.Hls && window.Hls.isSupported && window.Hls.isSupported());
  }

  function attachHlsJs(video, url) {
    destroyHls();
    var HlsCtor = window.Hls;
    state.hls = new HlsCtor({
      enableWorker: typeof Worker !== "undefined",
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      capLevelToPlayerSize: true,
      startLevel: -1,
    });
    state.hls.on(HlsCtor.Events.ERROR, function (_event, data) {
      if (!data || !data.fatal) return;
      var detail = data.details || data.type || "unknown";
      setStatus("Playback error: " + detail);
    });
    state.hls.on(HlsCtor.Events.MANIFEST_PARSED, function () {
      var playAttempt = video.play();
      if (playAttempt && playAttempt.catch) playAttempt.catch(function () {});
    });
    state.hls.loadSource(url);
    state.hls.attachMedia(video);
  }

  function setVideoSource(video, playbackUrl, playbackMode) {
    if (!video || !playbackUrl) return;

    var url = absoluteUrl(playbackUrl);
    var mode = inferPlaybackMode(url, playbackMode);
    var useHlsJs = mode === "hls" && hlsJsSupported();
    var useNativeHls = mode === "hls" && !useHlsJs && canPlayNativeHls(video);

    destroyHls();
    video.pause();
    video.removeAttribute("src");
    while (video.firstChild) video.removeChild(video.firstChild);

    if (useHlsJs) {
      attachHlsJs(video, url);
      return;
    }

    if (useNativeHls) {
      video.src = url;
      video.load();
      return;
    }

    // MPEG-TS live, MP4, or last-resort direct URL.
    video.src = url;
    video.load();
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    var el = byId("legacy-status");
    if (el) el.textContent = message || "";
  }

  function showScreen(name, skipHistory) {
    if (!skipHistory && window.history && window.history.pushState) {
      if (state.currentScreen !== name) {
        var url = "/legacy/";
        if (name !== "home") url += name + "/";
        window.history.pushState({ screen: name }, "", url);
      }
    }
    state.currentScreen = name;
    var screens = document.querySelectorAll(".legacy-screen");
    for (var i = 0; i < screens.length; i++) {
      screens[i].className = screens[i].className.replace(" is-active", "");
    }
    var target = byId("legacy-screen-" + name);
    if (target) target.className += " is-active";
  }

  function showPanel(id, visible) {
    var el = byId(id);
    if (!el) return;
    if (visible) el.className = el.className.replace(" is-hidden", "");
    else if (el.className.indexOf("is-hidden") === -1) el.className += " is-hidden";
  }

  function setActiveButtons(selector, attr, value) {
    var buttons = document.querySelectorAll(selector);
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var match = btn.getAttribute(attr) === value;
      if (match) btn.className = btn.className.replace(" is-active", "") + " is-active";
      else btn.className = btn.className.replace(" is-active", "");
    }
  }

  function openModernApp() {
    try {
      localStorage.setItem(PREFER_MODERN_KEY, "1");
      document.cookie = PREFER_MODERN_COOKIE;
    } catch (e) {}
    window.location.href = "/?modern=1";
  }

  function getAccessToken() {
    try {
      return localStorage.getItem(Z_ACCESS);
    } catch (e) {
      return null;
    }
  }

  function getRefreshToken() {
    try {
      return localStorage.getItem(Z_REFRESH);
    } catch (e) {
      return null;
    }
  }

  function storeTokens(access, refresh) {
    try {
      localStorage.setItem(Z_ACCESS, access);
      localStorage.setItem(Z_REFRESH, refresh);
    } catch (e) {}
  }

  function clearTokens() {
    try {
      localStorage.removeItem(Z_ACCESS);
      localStorage.removeItem(Z_REFRESH);
    } catch (e) {}
  }

  function parseJson(text) {
    if (!text || !String(text).replace(/\s/g, "")) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function xhrRequest(path, options) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var method = (options && options.method) || "GET";
      xhr.open(method, path, true);
      var headers = (options && options.headers) || {};
      for (var key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
          xhr.setRequestHeader(key, headers[key]);
        }
      }
      var access = getAccessToken();
      if (access) xhr.setRequestHeader("Authorization", "Bearer " + access);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          text: function () {
            return Promise.resolve(xhr.responseText || "");
          },
        });
      };
      xhr.onerror = function () {
        reject(new Error("Network error"));
      };
      xhr.send(options && options.body ? options.body : null);
    });
  }

  function httpRequest(path, options) {
    if (typeof fetch === "function") {
      var headers = {};
      if (options && options.headers) {
        for (var key in options.headers) {
          if (Object.prototype.hasOwnProperty.call(options.headers, key)) {
            headers[key] = options.headers[key];
          }
        }
      }
      var access = getAccessToken();
      if (access) headers.Authorization = "Bearer " + access;
      return fetch(path, {
        method: (options && options.method) || "GET",
        headers: headers,
        body: options && options.body ? options.body : undefined,
      });
    }
    return xhrRequest(path, options);
  }

  function apiFetch(path, options) {
    var headers = {};
    if (options && options.headers) {
      for (var key in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, key)) {
          headers[key] = options.headers[key];
        }
      }
    }
    var access = getAccessToken();
    if (access) headers.Authorization = "Bearer " + access;

    return httpRequest(path, {
      method: (options && options.method) || "GET",
      headers: headers,
      body: options && options.body ? options.body : undefined,
    }).then(function (res) {
      if (res.status !== 401) return res;
      var refresh = getRefreshToken();
      if (!refresh) return res;
      return httpRequest("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      }).then(function (refreshRes) {
        if (!refreshRes.ok) {
          clearTokens();
          return res;
        }
        return refreshRes.text().then(function (text) {
          var tokens = parseJson(text) || {};
          if (!tokens.accessToken || !tokens.refreshToken) {
            clearTokens();
            return res;
          }
          storeTokens(tokens.accessToken, tokens.refreshToken);
          headers.Authorization = "Bearer " + tokens.accessToken;
          return httpRequest(path, {
            method: (options && options.method) || "GET",
            headers: headers,
            body: options && options.body ? options.body : undefined,
          });
        });
      });
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function channelMeta(channel) {
    if (channel.groupTitle) return escapeHtml(channel.groupTitle);
    if (channel.contentType === "movie") return "Movie";
    if (channel.contentType === "series") return "Show";
    return "Live";
  }

  function isSeriesContainer(channel) {
    if (!channel || !channel.url) return false;
    var url = String(channel.url).trim();
    if (url.indexOf(SERIES_PREFIX) === 0) return true;
    if (channel.contentType === "series" && !/^https?:\/\//i.test(url)) return true;
    return false;
  }

  function setSeriesStatus(message) {
    var el = byId("legacy-series-status");
    if (el) el.textContent = message || "";
  }

  function episodeTileHtml(ep, index) {
    var code = "S" + (ep.season || "?") + "E" + (ep.episodeNum || "?");
    return (
      '<button type="button" class="legacy-episode-tile legacy-tile" data-index="' +
      index +
      '" tabindex="0">' +
      '<span class="legacy-episode-code">' +
      escapeHtml(code) +
      '</span> <span class="legacy-episode-name">' +
      escapeHtml(ep.title || "Episode") +
      "</span></button>"
    );
  }

  function openSeries(channel) {
    if (!channel) return;
    state.seriesContainer = channel;
    state.returnScreen = "home";
    setSeriesStatus("");
    var titleEl = byId("legacy-series-title");
    if (titleEl) titleEl.textContent = channel.name || "Show";
    var list = byId("legacy-series-episodes");
    if (list) list.innerHTML = '<div class="legacy-loading">Loading episodes…</div>';
    showScreen("series");

    return apiFetch(
      "/api/xtream/series-info?url=" + encodeURIComponent(String(channel.url).trim()),
    )
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Could not load episodes.");
          if (body.info && body.info.name && titleEl) titleEl.textContent = body.info.name;
          state.seriesTitle = titleEl ? titleEl.textContent : channel.name || "Show";
          state.seriesId = body.seriesId || "";
          var episodes = body.episodes || [];
          state.tiles = [];
          for (var i = 0; i < episodes.length; i++) {
            var ep = episodes[i];
            state.tiles.push({
              url: ep.playUrl,
              name:
                state.seriesTitle +
                " · S" +
                (ep.season || "?") +
                "E" +
                (ep.episodeNum || "?") +
                " · " +
                (ep.title || "Episode"),
              contentType: "episode",
              groupTitle: channel.groupTitle,
              tvgLogo: channel.tvgLogo,
            });
          }
          if (!episodes.length) {
            if (list) list.innerHTML = '<div class="legacy-loading">No episodes found.</div>';
            return;
          }
          var html = '<div class="legacy-grid"><div class="legacy-row">';
          for (var j = 0; j < episodes.length; j++) {
            html += episodeTileHtml(episodes[j], j);
          }
          html += "</div></div>";
          if (list) list.innerHTML = html;
          bindTileEvents();
          focusTile(0);
        });
      })
      .catch(function (err) {
        if (list) list.innerHTML = "";
        setSeriesStatus(err && err.message ? err.message : "Could not load episodes.");
      });
  }

  function closeSeries() {
    if (window.history && window.history.back) {
      window.history.back();
    } else {
      state.seriesContainer = null;
      state.seriesTitle = "";
      state.seriesId = "";
      setSeriesStatus("");
      showScreen("home");
      focusTile(state.focusIndex);
    }
  }

  function selectTile(index) {
    var channel = state.tiles[index];
    if (!channel) return;
    if (isSeriesContainer(channel)) {
      openSeries(channel);
      return;
    }
    playChannel(channel);
  }

  function channelTileHtml(channel, index) {
    var logoUrl = backendImageUrl(channel.tvgLogo).replace(/'/g, "%27");
    var logo = logoUrl ? "background-image:url('" + escapeHtml(logoUrl) + "')" : "";
    return (
      '<button type="button" class="legacy-tile" data-index="' +
      index +
      '" tabindex="0">' +
      '<div class="legacy-tile-thumb" style="' +
      logo +
      '"></div>' +
      '<div class="legacy-tile-body">' +
      '<span class="legacy-tile-title">' +
      escapeHtml(channel.name || "Channel") +
      "</span>" +
      '<span class="legacy-tile-meta">' +
      channelMeta(channel) +
      "</span>" +
      "</div></button>"
    );
  }

  function bindTileEvents() {
    var tiles = document.querySelectorAll(".legacy-tile");
    for (var i = 0; i < tiles.length; i++) {
      (function (tile) {
        tile.addEventListener("click", function () {
          var idx = Number(tile.getAttribute("data-index"));
          selectTile(idx);
        });
        tile.addEventListener("focus", function () {
          var idx = Number(tile.getAttribute("data-index"));
          focusTile(idx);
        });
      })(tiles[i]);
    }
  }

  function focusTile(index) {
    if (!state.tiles.length) return;
    if (index < 0) index = 0;
    if (index >= state.tiles.length) index = state.tiles.length - 1;
    state.focusIndex = index;

    var tiles = document.querySelectorAll(".legacy-tile");
    for (var i = 0; i < tiles.length; i++) {
      if (Number(tiles[i].getAttribute("data-index")) === index) {
        tiles[i].className = tiles[i].className.replace(" is-focused", "") + " is-focused";
        tiles[i].focus();
      } else {
        tiles[i].className = tiles[i].className.replace(" is-focused", "");
      }
    }
  }

  function renderFlatChannels(channels, emptyMessage, isSearch) {
    var container = byId("legacy-shelves");
    if (!container) return;

    state.tiles = channels || [];
    if (!state.tiles.length) {
      container.innerHTML =
        '<div class="legacy-loading">' + escapeHtml(emptyMessage || "Nothing found.") + "</div>";
      return;
    }

    var html = '<div class="legacy-grid"><div class="' + (isSearch ? 'legacy-wrap-row' : 'legacy-row') + '">';
    for (var i = 0; i < state.tiles.length; i++) {
      html += channelTileHtml(state.tiles[i], i);
    }
    html += "</div></div>";
    container.innerHTML = html;
    bindTileEvents();
    
    updateBrowseChrome();
    focusTile(0);
  }

  function renderShelves(shelves) {
    var container = byId("legacy-shelves");
    if (!container) return;

    var sections = [
      { key: "discover", title: "Live TV" },
      { key: "movies", title: "Movies" },
      { key: "series", title: "Shows" },
    ];

    var html = "";
    state.tiles = [];

    for (var s = 0; s < sections.length; s++) {
      var section = sections[s];
      var bucket = shelves[section.key];
      if (!bucket || !bucket.channels || !bucket.channels.length) continue;

      html += '<section class="legacy-section"><h2>' + escapeHtml(section.title) + "</h2><div class=\"legacy-row\">";
      for (var i = 0; i < bucket.channels.length; i++) {
        var ch = bucket.channels[i];
        state.tiles.push(ch);
        html += channelTileHtml(ch, state.tiles.length - 1);
      }
      html += "</div></section>";
    }

    container.innerHTML = html || '<div class="legacy-loading">No channels found.</div>';
    bindTileEvents();
    focusTile(0);
  }

  function playChannel(channel) {
    if (!channel || !channel.url) return;
    if (isSeriesContainer(channel)) {
      openSeries(channel);
      return;
    }
    setStatus("Starting playback…");
    apiFetch("/api/stream/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: channel.url,
        title: channel.name || "Live",
        logo: channel.tvgLogo || undefined,
        group: channel.groupTitle || undefined,
        unwrapPublicCorsProxyUrls: true,
      }),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Could not start playback.");
          if (!body.id) throw new Error("Could not start playback.");
          return body.id;
        });
      })
      .then(function (sessionId) {
        return apiFetch("/api/stream/session/" + encodeURIComponent(sessionId)).then(function (res) {
          return res.text().then(function (text) {
            var meta = parseJson(text) || {};
            if (!res.ok) throw new Error(meta.error || "Playback session expired.");
            return meta;
          });
        });
      })
      .then(function (meta) {
        setStatus("");
        state.playing = meta;
        var video = byId("legacy-video");
        var title = byId("legacy-player-title");
        if (title) title.textContent = meta.title || channel.name || "Live";
        if (video) {
          setVideoSource(video, meta.playbackUrl, meta.playbackMode);
          if (!state.hls) {
            var playAttempt = video.play();
            if (playAttempt && playAttempt.catch) playAttempt.catch(function () {});
          }
        }
        showScreen("player");
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Playback failed.");
      });
  }

  function stopPlayback() {
    if (window.history && window.history.back) {
      window.history.back();
    } else {
      destroyHls();
      var video = byId("legacy-video");
      if (video) {
        video.pause();
        video.removeAttribute("src");
        while (video.firstChild) video.removeChild(video.firstChild);
        video.load();
      }
      state.playing = null;
      if (state.seriesContainer) {
        showScreen("series");
        focusTile(state.focusIndex);
        return;
      }
      showScreen("home");
      focusTile(state.focusIndex);
    }
  }

  function showLoading(message) {
    var container = byId("legacy-shelves");
    if (container) {
      container.innerHTML =
        '<div class="legacy-loading">' + escapeHtml(message || "Loading…") + "</div>";
    }
    setStatus("");
  }

  function updateBrowseChrome() {
    setActiveButtons(".legacy-nav-btn", "data-tab", state.tab);
    showPanel("legacy-search-bar", state.tab === "search" || state.tab === "library");
    showPanel("legacy-library-filters", state.tab === "library");
    setActiveButtons(".legacy-filter-btn", "data-filter", state.libraryFilter);
    
    var btnPrev = byId("legacy-search-prev");
    var btnNext = byId("legacy-search-next");
    if (btnPrev && btnNext) {
       if ((state.tab === "search" || state.tab === "library") && state.searchTotal > SEARCH_LIMIT) {
          btnPrev.style.display = state.searchOffset > 0 ? "inline-block" : "none";
          btnNext.style.display = (state.searchOffset + SEARCH_LIMIT < state.searchTotal) ? "inline-block" : "none";
       } else {
          btnPrev.style.display = "none";
          btnNext.style.display = "none";
       }
    }
  }

  function loadHome() {
    state.tab = "home";
    updateBrowseChrome();
    showScreen("home");
    var container = byId("legacy-shelves");
    if (!container) return Promise.resolve();

    if (state.shelvesCache) {
      renderShelves(state.shelvesCache);
      return Promise.resolve();
    }
    showLoading("Loading…");
    return apiFetch("/api/library/home-shelves")
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Failed to load shelves.");
          state.shelvesCache = body;
          renderShelves(body);
        });
      })
      .catch(function (err) {
        container.innerHTML = "";
        setStatus(err && err.message ? err.message : "Failed to load shelves.");
      });
  }

  function loadLibrary(isPaging) {
    if (!isPaging) state.searchOffset = 0;
    state.tab = "library";
    updateBrowseChrome();
    showScreen("home");
    var container = byId("legacy-shelves");
    if (!container) return Promise.resolve();

    showLoading("Loading library…");
    var url = "/api/library/catalog?limit=" + String(SEARCH_LIMIT) + "&offset=" + String(state.searchOffset);
    if (state.libraryFilter !== "all") {
      url += "&contentType=" + state.libraryFilter;
    } else {
      url += "&contentType=all";
    }
    if (state.searchQuery && state.searchQuery.replace(/\s/g, "")) {
      url += "&q=" + encodeURIComponent(state.searchQuery);
    }

    return apiFetch(url)
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Failed to load library.");
          var total = body.total != null ? body.total : (body.channels || []).length;
          state.searchTotal = total;
          renderFlatChannels(body.channels || [], "Library is empty.", true);
        });
      })
      .catch(function (err) {
        container.innerHTML = "";
        setStatus(err && err.message ? err.message : "Failed to load library.");
      });
  }

  function loadFavorites() {
    state.tab = "favorites";
    updateBrowseChrome();
    showScreen("home");
    var container = byId("legacy-shelves");
    if (!container) return Promise.resolve();

    showLoading("Loading favorites…");
    return apiFetch("/api/user/favorites?enrich=1")
      .then(function (res) {
        return res.text().then(function (text) {
          var rows = parseJson(text) || [];
          if (!res.ok) {
            var errBody = rows;
            throw new Error((errBody && errBody.error) || "Could not load favorites.");
          }
          var channels = [];
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.channel && row.channel.url) channels.push(row.channel);
            else if (row.url) {
              channels.push({
                url: row.url,
                name: row.name || "Channel",
                tvgLogo: row.tvgLogo,
                groupTitle: row.groupTitle,
              });
            }
          }
          renderFlatChannels(channels, "No favorites yet. Add some in the full app.");
        });
      })
      .catch(function (err) {
        container.innerHTML = "";
        setStatus(err && err.message ? err.message : "Failed to load favorites.");
      });
  }

  function runSearch(query, append, isPaging) {
    if (!append && !isPaging) state.searchOffset = 0;
    
    state.tab = "search";
    state.searchQuery = query || "";
    updateBrowseChrome();
    if (!append) showScreen("home");

    var input = byId("legacy-search-input");
    if (input && !append) input.value = state.searchQuery;

    if (!state.searchQuery.replace(/\s/g, "")) {
      renderFlatChannels([], "Type a title and press Search.", true);
      return Promise.resolve();
    }

    if (!append) showLoading("Searching…");

    return apiFetch(
      "/api/library/catalog?contentType=all&q=" +
        encodeURIComponent(state.searchQuery) +
        "&limit=" +
        String(SEARCH_LIMIT) +
        "&offset=" +
        String(state.searchOffset)
    )
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Search failed.");
          var total = body.total != null ? body.total : (body.channels || []).length;
          state.searchTotal = total;
          
          var newTiles = body.channels || [];
          if (append) {
            state.tiles = state.tiles.concat(newTiles);
          } else {
            state.tiles = newTiles;
          }
          
          var emptyMsg = total ? "" : "No results for \"" + state.searchQuery + "\".";
          renderFlatChannels(state.tiles, emptyMsg || "No results.", true);
        });
      })
      .catch(function (err) {
        byId("legacy-shelves").innerHTML = "";
        setStatus(err && err.message ? err.message : "Search failed.");
      });
  }

  function switchTab(tab) {
    if (tab === "home") return loadHome();
    if (tab === "library") return loadLibrary();
    if (tab === "favorites") return loadFavorites();
    if (tab === "search") {
      state.tab = "search";
      state.searchOffset = 0;
      updateBrowseChrome();
      showScreen("home");
      renderFlatChannels([], "Type a title and press Search.", true);
      var input = byId("legacy-search-input");
      if (input) input.focus();
      return Promise.resolve();
    }
    return loadHome();
  }

  var pairInterval = null;
  function startPairing() {
    var pairContainer = byId("legacy-pair-code-container");
    var pairUri = byId("legacy-pair-uri");
    var pairCode = byId("legacy-pair-code");
    var pairQr = byId("legacy-pair-qr");
    if (!pairContainer) return;
    
    apiFetch("/api/auth/login/pair", { method: "POST" })
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var data = parseJson(text);
        if (!data || !data.verificationUri) return;
        pairUri.textContent = data.verificationUri;
        pairCode.textContent = data.userCode;
        pairQr.src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent(data.verificationUri);
        pairContainer.style.display = "block";
        
        if (pairInterval) clearInterval(pairInterval);
        pairInterval = setInterval(function() {
          apiFetch("/api/auth/login/pair/" + encodeURIComponent(data.sessionId))
            .then(function(r) { return r.text(); })
            .then(function(t) {
               var d = parseJson(t);
               if (d && d.tokens) {
                 clearInterval(pairInterval);
                 storeTokens(d.tokens.accessToken, d.tokens.refreshToken);
                 loadHome();
               }
            }).catch(function(){});
        }, 3000);
      }).catch(function(){});
  }

  function checkAuth() {
    showScreen("boot");
    return apiFetch("/api/auth/status")
      .then(function (res) {
        return res.text();
      })
      .then(function (text) {
        var status = parseJson(text) || {};
        state.authEnabled = Boolean(status.authEnabled);
        if (!state.authEnabled) return loadHome();
        return apiFetch("/api/auth/me")
          .then(function (res) {
            return res.text();
          })
          .then(function (meText) {
            var me = parseJson(meText) || {};
            if (me.user) {
              state.user = me.user;
              return loadHome();
            }
            startPairing();
            showScreen("login");
          });
      })
      .catch(function () {
        setStatus("Could not reach the server.");
        startPairing();
        showScreen("login");
      });
  }

  function login(username, password) {
    setStatus("");
    return apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Login failed.");
          if (body.accessToken && body.refreshToken) {
            storeTokens(body.accessToken, body.refreshToken);
          }
          state.user = body.user || null;
          return loadHome();
        });
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Login failed.");
      });
  }

  function onKeyDown(event) {
    var key = event.keyCode || event.which;
    var active = document.querySelector(".legacy-screen.is-active");
    if (!active) return;

    if (active.id === "legacy-screen-player") {
      if (key === 8 || key === 27 || key === 461 || key === 10009) {
        event.preventDefault();
        stopPlayback();
      }
      return;
    }

    if (active.id === "legacy-screen-series" && state.tiles.length) {
      if (key === 37) {
        event.preventDefault();
        focusTile(state.focusIndex - 1);
      } else if (key === 39) {
        event.preventDefault();
        focusTile(state.focusIndex + 1);
      } else if (key === 13) {
        event.preventDefault();
        selectTile(state.focusIndex);
      } else if (key === 8 || key === 27 || key === 461 || key === 10009) {
        event.preventDefault();
        closeSeries();
      }
      return;
    }

    if (active.id !== "legacy-screen-home" || !state.tiles.length) return;

    if (key === 37) {
      event.preventDefault();
      focusTile(state.focusIndex - 1);
    } else if (key === 39) {
      event.preventDefault();
      focusTile(state.focusIndex + 1);
    } else if (key === 13) {
      var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
      if (tag === "input") return;
      event.preventDefault();
      selectTile(state.focusIndex);
    }
  }

  function bindUi() {
    var loginForm = byId("legacy-login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        login(byId("legacy-username").value, byId("legacy-password").value);
      });
    }

    var modernLogin = byId("legacy-modern-login");
    if (modernLogin) modernLogin.addEventListener("click", openModernApp);

    var modernBtn = byId("legacy-modern-btn");
    if (modernBtn) {
      modernBtn.addEventListener("click", function () {
        window.location.href = "/";
      });
    }

    var logoutBtn = byId("legacy-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        apiFetch("/api/auth/logout", { method: "POST" })
          .then(function () {
            state.user = null;
            clearTokens();
            showScreen("login");
          })
          .catch(function () {
            showScreen("login");
          });
      });
    }

    var backBtn = byId("legacy-back");
    if (backBtn) backBtn.addEventListener("click", stopPlayback);

    var seriesBackBtn = byId("legacy-series-back");
    if (seriesBackBtn) seriesBackBtn.addEventListener("click", closeSeries);

    var nav = byId("legacy-nav");
    if (nav) {
      nav.addEventListener("click", function (event) {
        var target = event.target || event.srcElement;
        if (!target || !target.getAttribute) return;
        var tab = target.getAttribute("data-tab");
        if (tab) switchTab(tab);
      });
    }

    var filters = byId("legacy-library-filters");
    if (filters) {
      filters.addEventListener("click", function (event) {
        var target = event.target || event.srcElement;
        if (!target || !target.getAttribute) return;
        var filter = target.getAttribute("data-filter");
        if (!filter) return;
        state.libraryFilter = filter;
        loadLibrary();
      });
    }

    var searchGo = byId("legacy-search-go");
    if (searchGo) {
      searchGo.addEventListener("click", function () {
        var input = byId("legacy-search-input");
        state.searchQuery = input ? input.value : "";
        if (state.tab === "library") {
          loadLibrary();
        } else {
          runSearch(state.searchQuery, false);
        }
      });
    }

    var searchPrev = byId("legacy-search-prev");
    if (searchPrev) {
      searchPrev.addEventListener("click", function() {
         if (state.searchOffset >= SEARCH_LIMIT) {
            state.searchOffset -= SEARCH_LIMIT;
            if (state.tab === "library") loadLibrary(true);
            else runSearch(state.searchQuery, false, true);
         }
      });
    }

    var searchNext = byId("legacy-search-next");
    if (searchNext) {
      searchNext.addEventListener("click", function() {
         if (state.searchOffset + SEARCH_LIMIT < state.searchTotal) {
            state.searchOffset += SEARCH_LIMIT;
            if (state.tab === "library") loadLibrary(true);
            else runSearch(state.searchQuery, false, true);
         }
      });
    }

    var searchInput = byId("legacy-search-input");
    if (searchInput) {
      searchInput.addEventListener("keydown", function (event) {
        var key = event.keyCode || event.which;
        if (key === 13) {
          event.preventDefault();
          runSearch(searchInput.value);
        }
      });
    }

    document.addEventListener("keydown", onKeyDown);

    window.addEventListener("popstate", function(e) {
      var s = (e.state && e.state.screen) || "home";
      
      if (state.playing && s !== "player") {
        destroyHls();
        var video = byId("legacy-video");
        if (video) {
          video.pause();
          video.removeAttribute("src");
          while (video.firstChild) video.removeChild(video.firstChild);
          video.load();
        }
        state.playing = null;
      }
      
      if (state.seriesContainer && s !== "series" && s !== "player") {
        state.seriesContainer = null;
        state.seriesTitle = "";
        state.seriesId = "";
        setSeriesStatus("");
      }
      
      showScreen(s, true);
      if (s === "home") focusTile(state.focusIndex);
      if (s === "series") focusTile(state.focusIndex);
    });
  }

  bindUi();
  checkAuth();
})();
