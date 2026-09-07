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
    favorites: {},
    history: [],
    guideResults: [],
    recordingOverview: null,
    playerPositionTimer: null,
    playingChannel: null,
    returnFocusIndex: 0,
    seriesReturnTiles: null,
    seriesReturnFocusIndex: 0,
    parentalPatterns: [],
  };

  /* Legacy TV is a permanently safe surface. Built-in adult labels are filtered
     even if the main app's PIN has temporarily unlocked the browser session. */
  var LEGACY_BLOCKED_PHRASES = [
    "adul" + "t", "adul" + "ts", "po" + "rn", "po" + "rno",
    "por" + "nog" + "raphy", "xx", "xxx", "ero" + "tic", "ero" + "tica",
    "play" + "boy", "hust" + "ler", "braz" + "zers", "red light",
    "x rated", "se" + "x", "se" + "xy", "har" + "dcore", "nu" + "de",
    "nu" + "des", "nau" + "ghty", "pent" + "house", "private tv",
    "babe" + "station", "onl" + "yfans", "18 plus", "21 plus",
  ];

  function normalizeParentalText(value) {
    var text = String(value || "");
    if (text.normalize) text = text.normalize("NFKD");
    return text
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function parentalText(item, extra) {
    item = item || {};
    return [
      item.name, item.groupTitle, item.providerName, item.channelName,
      item.channelGroup, item.title, item.description, extra,
    ].join("\n");
  }

  function isLegacyBlocked(item, extra) {
    var raw = parentalText(item, extra);
    var words = normalizeParentalText(raw);
    if (!words) return false;
    var padded = " " + words + " ";
    for (var i = 0; i < LEGACY_BLOCKED_PHRASES.length; i += 1) {
      if (padded.indexOf(" " + LEGACY_BLOCKED_PHRASES[i] + " ") !== -1) return true;
    }
    if (/(^|\s)(18\+|\+18|21\+|\+21)(\s|$)/.test(words)) return true;
    if (/x{3}|(^|\s)x\s+x(\s+x)?(\s|$)/.test(words)) return true;
    if (/(adul+t|porn|erotic|hardcore|playboy|hustler|brazzers|onlyfans|babestation|penthouse)/.test(words)) return true;
    if (/(^|\s)s\s*e\s*x(y)?(\s|$)/.test(words)) return true;
    if (/(^|\s)a\s*d\s*u\s*l\s*t(s)?(\s|$)/.test(words)) return true;
    var lowerRaw = raw.toLowerCase();
    for (var p = 0; p < state.parentalPatterns.length; p += 1) {
      var pattern = String(state.parentalPatterns[p] || "").toLowerCase().replace(/^\s+|\s+$/g, "");
      var normalizedPattern = normalizeParentalText(pattern);
      if (pattern && (lowerRaw.indexOf(pattern) !== -1 || (normalizedPattern && words.indexOf(normalizedPattern) !== -1))) return true;
    }
    return false;
  }

  function filterLegacySafe(items, extraGetter) {
    var safe = [];
    for (var i = 0; i < (items || []).length; i += 1) {
      var item = items[i];
      var extra = extraGetter ? extraGetter(item) : "";
      if (!isLegacyBlocked(item, extra)) safe.push(item);
    }
    return safe;
  }

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
    /* encodeURIComponent + unescape is intentionally used here: unlike TextEncoder,
       both exist on the oldest TV engines supported by this client. */
    var binary = unescape(encodeURIComponent("logo\0" + raw));
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
    var el = state.currentScreen === "login" ? byId("legacy-login-status") : byId("legacy-status");
    if (el) el.textContent = message || "";
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value || "";
  }

  function setPageHeading(eyebrow, title, description, visible) {
    showPanel("legacy-page-heading", visible !== false);
    setText("legacy-page-eyebrow", eyebrow);
    setText("legacy-page-title", title);
    setText("legacy-page-description", description);
  }

  function updateAccountChrome() {
    var name = state.user && state.user.username ? state.user.username : "Viewer";
    setText("legacy-account-name", name);
    setText("legacy-account-toggle", name.charAt(0).toUpperCase() || "V");
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
    var parts = [];
    if (channel.providerName) parts.push(channel.providerName);
    if (channel.groupTitle) parts.push(channel.groupTitle);
    if (parts.length) return escapeHtml(parts.join(" · "));
    if (channel.contentType === "movie") return "Movie";
    if (channel.contentType === "series" || channel.contentType === "episode") return "Series";
    return "Live";
  }

  function contentKind(channel) {
    if (!channel) return "LIVE";
    if (channel.contentType === "movie") return "MOVIE";
    if (channel.contentType === "series" || channel.contentType === "episode") return "SERIES";
    return "LIVE";
  }

  function formatClock(ms) {
    var date = new Date(Number(ms) || Date.now());
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return hours + ":" + (minutes < 10 ? "0" : "") + minutes + " " + suffix;
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  function dedupeChannels(channels) {
    var seen = {};
    var result = [];
    for (var i = 0; i < (channels || []).length; i += 1) {
      var ch = channels[i];
      if (!ch || !ch.url || seen[ch.url]) continue;
      seen[ch.url] = true;
      result.push(ch);
    }
    return result;
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
      '<button type="button" class="legacy-episode-tile legacy-tile legacy-selectable" data-index="' +
      index +
      '" tabindex="0">' +
      '<span class="legacy-episode-code">' +
      escapeHtml(code) +
      '</span> <span class="legacy-episode-name">' +
      escapeHtml(ep.title || "Episode") +
      '</span><span class="legacy-episode-date">' +
      (ep.durationSeconds ? Math.round(ep.durationSeconds / 60) + " min" : "Ready to play") +
      "</span></button>"
    );
  }

  function openSeries(channel) {
    if (!channel || isLegacyBlocked(channel)) {
      setStatus("This title is hidden by parental controls.");
      return;
    }
    state.seriesReturnTiles = state.tiles.slice ? state.tiles.slice(0) : state.tiles;
    state.seriesReturnFocusIndex = state.focusIndex;
    state.seriesContainer = channel;
    state.returnScreen = "home";
    setSeriesStatus("");
    var titleEl = byId("legacy-series-title");
    if (titleEl) titleEl.textContent = channel.name || "Show";
    var art = byId("legacy-series-art");
    var initialArt = backendImageUrl(channel.tvgLogo).replace(/'/g, "%27");
    if (art) art.style.backgroundImage = initialArt ? "url('" + initialArt + "')" : "none";
    setText("legacy-series-meta", channel.groupTitle || "Choose an episode to start watching.");
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
          var seriesPayloadText = "";
          var info = body.info || {};
          for (var infoKey in info) {
            if (Object.prototype.hasOwnProperty.call(info, infoKey) && typeof info[infoKey] === "string") {
              seriesPayloadText += " " + info[infoKey];
            }
          }
          if (body.metadata) {
            seriesPayloadText += " " + [
              body.metadata.title, body.metadata.originalTitle, body.metadata.tagline,
              body.metadata.overview, (body.metadata.genres || []).join(" "),
            ].join(" ");
          }
          if (isLegacyBlocked(channel, seriesPayloadText)) {
            if (list) list.innerHTML = "";
            if (art) art.style.backgroundImage = "none";
            closeSeries();
            setStatus("This title is hidden by parental controls.");
            return;
          }
          if (body.info && body.info.name && titleEl) titleEl.textContent = body.info.name;
          if (body.metadata) {
            var metadata = body.metadata;
            var heroArt = backendImageUrl(metadata.backdropUrl || metadata.posterUrl || channel.tvgLogo).replace(/'/g, "%27");
            if (art && heroArt) art.style.backgroundImage = "url('" + heroArt + "')";
            var detailParts = [];
            if (metadata.year) detailParts.push(metadata.year);
            if (metadata.numberOfSeasons) detailParts.push(metadata.numberOfSeasons + (metadata.numberOfSeasons === 1 ? " season" : " seasons"));
            if (metadata.genres && metadata.genres.length) detailParts.push(metadata.genres.slice(0, 3).join(" · "));
            setText("legacy-series-meta", detailParts.join("  ·  ") || metadata.overview || "Choose an episode to start watching.");
          }
          state.seriesTitle = titleEl ? titleEl.textContent : channel.name || "Show";
          state.seriesId = body.seriesId || "";
          var episodes = filterLegacySafe(body.episodes || [], function (episode) {
            return state.seriesTitle + " " + (episode.title || "");
          });
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
              durationSeconds: ep.durationSeconds,
              playback: {
                contentKind: "episode",
                seriesId: body.seriesId || "",
                seriesTitle: state.seriesTitle,
                season: String(ep.season || ""),
                episodeNum: String(ep.episodeNum || ""),
                episodeTitle: ep.title || "Episode",
                durationSeconds: ep.durationSeconds,
              },
            });
          }
          if (!episodes.length) {
            if (list) list.innerHTML = '<div class="legacy-loading">No episodes found.</div>';
            return;
          }
          var html = "";
          var activeSeason = null;
          for (var j = 0; j < episodes.length; j++) {
            var season = String(episodes[j].season || "Specials");
            if (season !== activeSeason) {
              if (activeSeason !== null) html += "</div></section>";
              activeSeason = season;
              html += '<section class="legacy-season"><h2>' +
                escapeHtml(season === "0" ? "Specials" : "Season " + season) +
                '</h2><div class="legacy-row">';
            }
            html += episodeTileHtml(episodes[j], j);
          }
          if (activeSeason !== null) html += "</div></section>";
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
      if (state.seriesReturnTiles) state.tiles = state.seriesReturnTiles;
      state.focusIndex = state.seriesReturnFocusIndex;
      state.seriesReturnTiles = null;
      showScreen("home");
      focusTile(state.focusIndex);
    }
  }

  function selectTile(index) {
    var channel = state.tiles[index];
    if (!channel) return;
    if (isLegacyBlocked(channel)) {
      setStatus("This item is hidden by parental controls.");
      return;
    }
    if (channel._recordingId) {
      playRecording(channel);
      return;
    }
    if (isSeriesContainer(channel)) {
      openSeries(channel);
      return;
    }
    playChannel(channel);
  }

  function channelTileHtml(channel, index) {
    var logoUrl = backendImageUrl(channel.tvgLogo).replace(/'/g, "%27");
    var logo = logoUrl ? "background-image:url('" + escapeHtml(logoUrl) + "')" : "";
    var isFavorite = !!state.favorites[channel.url];
    var progress = Number(channel._progress || 0);
    return (
      '<div role="button" class="legacy-tile legacy-selectable" data-index="' +
      index +
      '" tabindex="0">' +
      '<div class="legacy-tile-thumb" style="' +
      logo +
      '">' +
      (!logoUrl ? '<span class="legacy-tile-fallback">' + escapeHtml(channel.name || "Zende") + "</span>" : "") +
      '<span class="legacy-content-pill">' + contentKind(channel) + "</span>" +
      '<button type="button" class="legacy-favorite-btn' + (isFavorite ? " is-favorite" : "") + '" data-favorite-index="' + index + '" aria-label="' + (isFavorite ? "Remove from favorites" : "Add to favorites") + '">' + (isFavorite ? "★" : "☆") + "</button>" +
      '<span class="legacy-tile-play">▶</span>' +
      "</div>" +
      '<div class="legacy-tile-body">' +
      '<span class="legacy-tile-title">' +
      escapeHtml(channel.name || "Channel") +
      "</span>" +
      '<span class="legacy-tile-meta">' +
      channelMeta(channel) +
      "</span>" +
      (progress > 0 ? '<span class="legacy-progress"><span style="width:' + Math.round(progress * 100) + '%"></span></span>' : "") +
      "</div></div>"
    );
  }

  function bindTileEvents() {
    var tiles = document.querySelectorAll(".legacy-selectable");
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
    var favoriteButtons = document.querySelectorAll(".legacy-favorite-btn");
    for (var j = 0; j < favoriteButtons.length; j++) {
      (function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(Number(button.getAttribute("data-favorite-index")));
        });
      })(favoriteButtons[j]);
    }
    var recordButtons = document.querySelectorAll(".legacy-guide-record");
    for (var k = 0; k < recordButtons.length; k++) {
      (function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          startGuideRecording(Number(button.getAttribute("data-record-index")), button.getAttribute("data-record-end"), button);
        });
      })(recordButtons[k]);
    }
  }

  function focusTile(index) {
    if (!state.tiles.length) return;
    if (index < 0) index = 0;
    if (index >= state.tiles.length) index = state.tiles.length - 1;
    state.focusIndex = index;

    var tiles = document.querySelectorAll(".legacy-selectable");
    for (var i = 0; i < tiles.length; i++) {
      if (Number(tiles[i].getAttribute("data-index")) === index) {
        tiles[i].className = tiles[i].className.replace(" is-focused", "") + " is-focused";
        tiles[i].focus();
      } else {
        tiles[i].className = tiles[i].className.replace(" is-focused", "");
      }
    }
  }

  function favoritePayload(channel) {
    return {
      url: channel.url,
      name: channel.name || "Channel",
      tvgId: channel.tvgId || undefined,
      tvgLogo: channel.tvgLogo || undefined,
      groupTitle: channel.groupTitle || undefined,
    };
  }

  function toggleFavorite(index) {
    var channel = state.tiles[index];
    if (!channel || !channel.url || channel._recordingId || isLegacyBlocked(channel)) return;
    var removing = !!state.favorites[channel.url];
    if (removing) delete state.favorites[channel.url];
    else state.favorites[channel.url] = favoritePayload(channel);
    renderCurrentView(index);

    apiFetch("/api/user/favorites" + (removing ? "?url=" + encodeURIComponent(channel.url) : ""), {
      method: removing ? "DELETE" : "POST",
      headers: removing ? {} : { "Content-Type": "application/json" },
      body: removing ? undefined : JSON.stringify(favoritePayload(channel)),
    }).then(function (res) {
      if (res.ok) return;
      if (removing) state.favorites[channel.url] = favoritePayload(channel);
      else delete state.favorites[channel.url];
      setStatus("Could not update favorites. Please try again.");
      renderCurrentView(index);
    }).catch(function () {
      if (removing) state.favorites[channel.url] = favoritePayload(channel);
      else delete state.favorites[channel.url];
      setStatus("Could not update favorites. Please try again.");
      renderCurrentView(index);
    });
  }

  function renderCurrentView(focusIndex) {
    if (state.tab === "home" && state.shelvesCache) renderShelves(state.shelvesCache, focusIndex);
    else if (state.tab === "favorites") renderFavoriteChannels(focusIndex);
    else if (state.tab === "guide") renderGuide(state.guideResults, focusIndex);
    else if (state.tab === "recordings") renderRecordings(state.recordingOverview, focusIndex);
    else renderFlatChannels(state.tiles, "Nothing found.", true, focusIndex);
  }

  function renderFlatChannels(channels, emptyMessage, isSearch, focusIndex) {
    var container = byId("legacy-shelves");
    if (!container) return;

    state.tiles = filterLegacySafe(channels || []);
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
    focusTile(focusIndex == null ? 0 : focusIndex);
  }

  function shelfHtml(title, eyebrow, description, channels) {
    if (!channels || !channels.length) return "";
    var html = '<section class="legacy-section"><div class="legacy-section-head">' +
      '<div class="legacy-eyebrow">' + escapeHtml(eyebrow) + "</div>" +
      "<h2>" + escapeHtml(title) + "</h2>" +
      (description ? "<p>" + escapeHtml(description) + "</p>" : "") +
      '</div><div class="legacy-row">';
    for (var i = 0; i < channels.length; i += 1) {
      state.tiles.push(channels[i]);
      html += channelTileHtml(channels[i], state.tiles.length - 1);
    }
    return html + "</div></section>";
  }

  function historyChannel(row) {
    var playback = parseJson(row.playbackJson) || {};
    var duration = Number(playback.durationSeconds || 0);
    var position = Number(row.positionSeconds || 0);
    var progress = position > 0 ? Math.min(0.92, Math.max(0.04, duration > 0 ? position / duration : position / 7200)) : 0;
    return {
      url: row.url,
      name: row.name || "Recently watched",
      tvgLogo: row.tvgLogo || undefined,
      groupTitle: row.groupTitle || undefined,
      contentType: playback.contentKind || undefined,
      playback: playback,
      _progress: progress,
      _positionSeconds: position,
      _openCount: Number(row.openCount || 0),
    };
  }

  function heroHtml(channel) {
    if (!channel) return "";
    var art = backendImageUrl(channel.tvgLogo).replace(/'/g, "%27");
    var meta = channel.groupTitle || (contentKind(channel) === "LIVE" ? "Live television from your library" : "Ready when you are");
    return '<section class="legacy-hero"' + (art ? ' style="background-image:url(\'' + escapeHtml(art) + '\')"' : "") + '>' +
      '<div class="legacy-hero-shade"></div><div class="legacy-hero-shade-bottom"></div>' +
      '<div class="legacy-hero-copy"><p class="legacy-eyebrow">FEATURED FOR YOU</p>' +
      "<h1>" + escapeHtml(channel.name || "Watch now") + "</h1>" +
      "<p>" + escapeHtml(meta) + "</p>" +
      '<button type="button" class="legacy-btn legacy-btn-primary legacy-selectable" data-index="0">▶&nbsp;&nbsp;Play</button>' +
      '<button type="button" class="legacy-btn legacy-btn-secondary legacy-hero-favorite" data-favorite-index="0">' + (state.favorites[channel.url] ? "★ In favorites" : "☆ Add to favorites") + "</button>" +
      "</div></section>";
  }

  function renderShelves(shelves, focusIndex) {
    var container = byId("legacy-shelves");
    if (!container) return;
    state.tiles = [];
    var live = shelves.discover && shelves.discover.channels ? filterLegacySafe(dedupeChannels(shelves.discover.channels)) : [];
    var movies = shelves.movies && shelves.movies.channels ? filterLegacySafe(dedupeChannels(shelves.movies.channels)) : [];
    var series = shelves.series && shelves.series.channels ? filterLegacySafe(dedupeChannels(shelves.series.channels)) : [];
    var hero = movies[0] || series[0] || live[0];
    if (hero) state.tiles.push(hero);
    var recent = [];
    var frequent = [];
    for (var h = 0; h < state.history.length; h += 1) {
      var historyItem = historyChannel(state.history[h]);
      if (isLegacyBlocked(historyItem)) continue;
      if (historyItem._positionSeconds >= 30 && recent.length < 18) recent.push(historyItem);
      if (historyItem._openCount >= 2 && frequent.length < 18) frequent.push(historyItem);
    }
    var html = heroHtml(hero);
    html += shelfHtml("Continue watching", "RESUME", "Pick up where you left off.", recent);
    html += shelfHtml("Because you watch", "YOUR PATTERN", "Your most-played channels and titles.", frequent);
    html += shelfHtml("Live TV", "ON NOW", "Channels from your connected providers.", live);
    html += shelfHtml("Movies", "DISCOVER", "Films ready to watch.", movies);
    html += shelfHtml("Shows", "BINGE-WORTHY", "Series from your library.", series);

    container.innerHTML = html || '<div class="legacy-loading">No channels found.</div>';
    bindTileEvents();
    focusTile(focusIndex == null ? 0 : focusIndex);
  }

  function playChannel(channel) {
    if (!channel || !channel.url || isLegacyBlocked(channel)) {
      setStatus("This item is hidden by parental controls.");
      return;
    }
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
        meta: channel.playback || {
          contentKind: channel.contentType === "movie" ? "movie" : channel.contentType === "episode" ? "episode" : "live",
        },
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
        enterPlayer(meta, channel);
        recordHistory(channel, meta);
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Playback failed.");
      });
  }

  function playRecording(recording) {
    if (!recording || !recording._recordingId || isLegacyBlocked(recording)) return;
    setStatus("Opening recording…");
    apiFetch("/api/recordings/" + encodeURIComponent(recording._recordingId) + "/watch-meta")
      .then(function (res) {
        return res.text().then(function (text) {
          var meta = parseJson(text) || {};
          if (!res.ok) throw new Error(meta.error || "Recording is not ready to play.");
          return meta;
        });
      })
      .then(function (meta) {
        if (isLegacyBlocked({ name: meta.title, groupTitle: meta.group })) {
          throw new Error("This recording is hidden by parental controls.");
        }
        meta.playbackMode = inferPlaybackMode(meta.playbackUrl, meta.playbackMode);
        enterPlayer(meta, recording);
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Could not play recording.");
      });
  }

  function recordHistory(channel, meta) {
    if (!channel || !channel.url) return;
    apiFetch("/api/user/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: channel.url,
        name: channel.name || "Live",
        tvgLogo: channel.tvgLogo || undefined,
        groupTitle: channel.groupTitle || undefined,
        playback: meta.playback || channel.playback || undefined,
      }),
    }).catch(function () {});
  }

  function savePlayerPosition() {
    var video = byId("legacy-video");
    var channel = state.playingChannel;
    if (!video || !channel || !channel.url || !video.currentTime || !isFinite(video.currentTime)) return;
    apiFetch("/api/user/playback-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: channel.url, positionSeconds: Math.round(video.currentTime) }),
    }).catch(function () {});
  }

  function enterPlayer(meta, channel) {
    setStatus("");
    state.playing = meta;
    state.playingChannel = channel;
    var video = byId("legacy-video");
    setText("legacy-player-title", meta.title || channel.name || "Live");
    setText("legacy-player-meta", meta.group || channel.groupTitle || "");
    setText("legacy-player-type", channel._recordingId ? "RECORDING" : contentKind(channel) === "LIVE" ? "NOW PLAYING" : contentKind(channel));
    var live = byId("legacy-player-live");
    if (live) live.style.display = contentKind(channel) === "LIVE" && !channel._recordingId ? "block" : "none";
    if (video) {
      setVideoSource(video, meta.playbackUrl, meta.playbackMode);
      if (channel._positionSeconds > 0) {
        var resume = function () {
          try { video.currentTime = channel._positionSeconds; } catch (e) {}
          video.removeEventListener("loadedmetadata", resume);
        };
        video.addEventListener("loadedmetadata", resume);
      }
      if (!state.hls) {
        var playAttempt = video.play();
        if (playAttempt && playAttempt.catch) playAttempt.catch(function () {});
      }
    }
    if (state.playerPositionTimer) clearInterval(state.playerPositionTimer);
    state.playerPositionTimer = setInterval(savePlayerPosition, 15000);
    showScreen("player");
  }

  function stopPlayback() {
    savePlayerPosition();
    if (state.playerPositionTimer) clearInterval(state.playerPositionTimer);
    state.playerPositionTimer = null;
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
      state.playingChannel = null;
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
        '<div class="legacy-loading"><span class="legacy-spinner"></span> ' + escapeHtml(message || "Loading…") + "</div>";
    }
    setStatus("");
  }

  function updateBrowseChrome() {
    setActiveButtons(".legacy-nav-btn", "data-tab", state.tab);
    showPanel("legacy-search-bar", state.tab === "search" || state.tab === "library" || state.tab === "guide");
    showPanel("legacy-library-filters", state.tab === "library");
    setActiveButtons(".legacy-filter-btn", "data-filter", state.libraryFilter);
    showPanel("legacy-page-heading", state.tab !== "home");

    var input = byId("legacy-search-input");
    if (input) {
      input.placeholder = state.tab === "guide"
        ? "Search channels or programmes"
        : "Search live TV, movies, and shows";
    }
    
    var btnPrev = byId("legacy-search-prev");
    var btnNext = byId("legacy-search-next");
    if (btnPrev && btnNext) {
       if ((state.tab === "search" || state.tab === "library") && state.searchTotal > SEARCH_LIMIT) {
          btnPrev.className = btnPrev.className.replace(" is-hidden", "") + (state.searchOffset > 0 ? "" : " is-hidden");
          btnNext.className = btnNext.className.replace(" is-hidden", "") + (state.searchOffset + SEARCH_LIMIT < state.searchTotal ? "" : " is-hidden");
       } else {
          if (btnPrev.className.indexOf("is-hidden") === -1) btnPrev.className += " is-hidden";
          if (btnNext.className.indexOf("is-hidden") === -1) btnNext.className += " is-hidden";
       }
    }
    var page = byId("legacy-search-page");
    if (page) {
      page.textContent = state.searchTotal > SEARCH_LIMIT
        ? (state.searchOffset + 1) + "–" + Math.min(state.searchOffset + SEARCH_LIMIT, state.searchTotal) + " of " + state.searchTotal
        : "";
    }
  }

  function loadPersonalData() {
    return apiFetch("/api/user/favorites?enrich=1")
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var rows = parseJson(text) || [];
        state.favorites = {};
        for (var i = 0; i < rows.length; i += 1) {
          var channel = rows[i].channel || rows[i];
          if (channel && channel.url && !isLegacyBlocked(channel)) state.favorites[channel.url] = channel;
        }
      })
      .catch(function () {})
      .then(function () {
        return apiFetch("/api/user/history?sort=recent")
          .then(function (res) { return res.text(); })
          .then(function (text) { state.history = filterLegacySafe(parseJson(text) || []); })
          .catch(function () { state.history = []; });
      });
  }

  function loadParentalPolicy() {
    return apiFetch("/api/settings/parental")
      .then(function (res) {
        return res.text().then(function (text) {
          var policy = parseJson(text) || {};
          state.parentalPatterns = policy.enabled && policy.hiddenPatterns && policy.hiddenPatterns.length
            ? policy.hiddenPatterns
            : [];
        });
      })
      .catch(function () { state.parentalPatterns = []; });
  }

  function loadHome() {
    state.tab = "home";
    state.searchOffset = 0;
    updateBrowseChrome();
    showScreen("home");
    var container = byId("legacy-shelves");
    if (!container) return Promise.resolve();

    if (state.shelvesCache) {
      renderShelves(state.shelvesCache);
      return loadPersonalData().then(function () { renderShelves(state.shelvesCache); });
    }
    showLoading("Loading…");
    return apiFetch("/api/library/home-shelves")
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Failed to load shelves.");
          state.shelvesCache = body;
          return loadPersonalData().then(function () { renderShelves(body); });
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
    setPageHeading("YOUR COLLECTION", "Library", "Browse everything available from your connected providers.");
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
    setPageHeading("SAVED FOR LATER", "Favorites", "Your starred channels, movies, and shows in one place.");
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
          state.favorites = {};
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row.channel && row.channel.url && !isLegacyBlocked(row.channel)) channels.push(row.channel);
            else if (row.url) {
              var fallbackChannel = {
                url: row.url,
                name: row.name || "Channel",
                tvgLogo: row.tvgLogo,
                groupTitle: row.groupTitle,
              };
              if (!isLegacyBlocked(fallbackChannel)) channels.push(fallbackChannel);
            }
          }
          for (var j = 0; j < channels.length; j += 1) state.favorites[channels[j].url] = channels[j];
          renderFlatChannels(channels, "No favorites yet. Select the star on anything you love.", true);
        });
      })
      .catch(function (err) {
        container.innerHTML = "";
        setStatus(err && err.message ? err.message : "Failed to load favorites.");
      });
  }

  function renderFavoriteChannels(focusIndex) {
    var channels = [];
    for (var url in state.favorites) {
      if (Object.prototype.hasOwnProperty.call(state.favorites, url)) channels.push(state.favorites[url]);
    }
    renderFlatChannels(channels, "No favorites yet. Select the star on anything you love.", true, focusIndex);
  }

  function runSearch(query, append, isPaging) {
    if (!append && !isPaging) state.searchOffset = 0;
    
    state.tab = "search";
    setPageHeading("FIND SOMETHING GREAT", "Search", "Search across live channels, movies, and series.");
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

  function renderGuide(results, focusIndex) {
    var container = byId("legacy-shelves");
    if (!container) return;
    state.guideResults = filterLegacySafe(results || [], function (result) {
      var programmes = result.programmes || [];
      var text = parentalText(result.channel, "");
      for (var r = 0; r < programmes.length; r += 1) {
        text += " " + (programmes[r].title || "") + " " + (programmes[r].description || "");
      }
      return text;
    });
    state.tiles = [];
    if (!state.guideResults.length) {
      container.innerHTML = '<div class="legacy-empty">No programme listings matched your search.</div>';
      return;
    }
    var now = Date.now();
    var html = '<div class="legacy-guide-list">';
    for (var i = 0; i < state.guideResults.length; i += 1) {
      var result = state.guideResults[i];
      var channel = result.channel || {};
      var programmes = result.programmes || [];
      state.tiles.push(channel);
      var logo = backendImageUrl(channel.tvgLogo).replace(/'/g, "%27");
      html += '<div role="button" tabindex="0" class="legacy-guide-row legacy-selectable" data-index="' + i + '">' +
        '<span class="legacy-guide-logo"' + (logo ? ' style="background-image:url(\'' + escapeHtml(logo) + '\')"' : "") + '></span>' +
        '<span class="legacy-guide-channel"><strong>' + escapeHtml(channel.name || "Channel") + '</strong><span>' + escapeHtml(channel.groupTitle || "Live TV") + "</span></span>";
      for (var p = 0; p < Math.min(2, programmes.length); p += 1) {
        var programme = programmes[p];
        var isNow = programme.startMs <= now && programme.stopMs > now;
        var progress = isNow ? Math.max(0, Math.min(100, ((now - programme.startMs) / (programme.stopMs - programme.startMs)) * 100)) : 0;
        html += '<span class="legacy-programme' + (isNow ? " is-now" : "") + '">' +
          '<span class="legacy-programme-time">' + (isNow ? "NOW · " : "") + formatClock(programme.startMs) + "–" + formatClock(programme.stopMs) + "</span>" +
          "<strong>" + escapeHtml(programme.title || "Programme") + "</strong>" +
          "<p>" + escapeHtml(programme.description || (isNow ? "On now" : "Up next")) + "</p>" +
          (isNow ? '<span class="legacy-now-bar"><span style="width:' + Math.round(progress) + '%"></span></span>' : "") +
          "</span>";
      }
      var currentProgramme = null;
      for (var cp = 0; cp < programmes.length; cp += 1) {
        if (programmes[cp].startMs <= now && programmes[cp].stopMs > now) currentProgramme = programmes[cp];
      }
      html += currentProgramme
        ? '<button type="button" class="legacy-guide-record" data-record-index="' + i + '" data-record-end="' + currentProgramme.stopMs + '">● Record</button>'
        : "";
      html += "</div>";
    }
    container.innerHTML = html + "</div>";
    bindTileEvents();
    focusTile(focusIndex == null ? 0 : focusIndex);
  }

  function startGuideRecording(index, endMs, button) {
    var result = state.guideResults[index];
    var channel = result && result.channel;
    if (!channel || !channel.url || isLegacyBlocked(channel)) return;
    if (button) {
      button.disabled = true;
      button.textContent = "Starting…";
    }
    apiFetch("/api/recordings/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelUrl: channel.url,
        channelName: channel.name || "Channel",
        channelLogo: channel.tvgLogo || null,
        channelGroup: channel.groupTitle || null,
        endsAt: new Date(Number(endMs) || Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = parseJson(text) || {};
        if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not start recording.");
        if (button) button.textContent = "● Recording";
        setStatus("Recording started for " + (channel.name || "channel") + ".");
      });
    }).catch(function (err) {
      if (button) {
        button.disabled = false;
        button.textContent = "● Record";
      }
      setStatus(err && err.message ? err.message : "Could not start recording.");
    });
  }

  function loadGuide(query) {
    state.tab = "guide";
    state.searchQuery = query || "";
    state.searchOffset = 0;
    setPageHeading("WHAT'S ON", "Live guide", "See what is playing now and what comes next.");
    updateBrowseChrome();
    showScreen("home");
    var input = byId("legacy-search-input");
    if (input) input.value = state.searchQuery;
    showLoading(state.searchQuery ? "Searching the guide…" : "Loading the live guide…");
    return apiFetch("/api/epg/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: state.searchQuery, limit: 48 }),
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = parseJson(text) || {};
        if (!res.ok) throw new Error(body.error || "Could not load the programme guide.");
        state.searchTotal = Number(body.total || 0);
        renderGuide(body.results || []);
      });
    }).catch(function (err) {
      byId("legacy-shelves").innerHTML = "";
      setStatus(err && err.message ? err.message : "Could not load the programme guide.");
    });
  }

  function recordingCardHtml(item, index, kind) {
    var clickable = kind === "library" && (item.status === "COMPLETED" || item.status === "STOPPED_EARLY");
    var date = formatDate(item.startedAt || item.startsAt || item.createdAt);
    return '<button type="button" class="legacy-recording-card' + (clickable ? " legacy-selectable" : "") + '"' + (clickable ? ' data-index="' + index + '"' : ' tabindex="-1"') + '>' +
      '<span class="legacy-eyebrow">' + (kind === "active" ? '<i class="legacy-recording-dot"></i>RECORDING NOW' : kind === "schedule" ? "UPCOMING" : item.status === "FAILED" ? "FAILED" : "READY TO WATCH") + "</span>" +
      "<strong>" + escapeHtml(item.channelName || "Recording") + "</strong>" +
      "<span>" + escapeHtml(item.channelGroup || date || "Zende recording") + (item.channelGroup && date ? " · " + escapeHtml(date) : "") + "</span></button>";
  }

  function renderRecordings(overview, focusIndex) {
    var container = byId("legacy-shelves");
    if (!container) return;
    state.recordingOverview = overview || { active: [], schedules: [], library: [] };
    state.tiles = [];
    var html = "";
    var active = filterLegacySafe(state.recordingOverview.active || []);
    var schedules = filterLegacySafe(state.recordingOverview.schedules || []);
    var library = filterLegacySafe(state.recordingOverview.library || []);
    if (active.length) {
      html += '<section class="legacy-recording-section"><h2>Recording now</h2>';
      for (var a = 0; a < active.length; a += 1) html += recordingCardHtml(active[a], -1, "active");
      html += "</section>";
    }
    if (schedules.length) {
      html += '<section class="legacy-recording-section"><h2>Upcoming</h2>';
      for (var s = 0; s < schedules.length; s += 1) html += recordingCardHtml(schedules[s], -1, "schedule");
      html += "</section>";
    }
    if (library.length) {
      html += '<section class="legacy-recording-section"><h2>Your recordings</h2>';
      for (var l = 0; l < library.length; l += 1) {
        var item = library[l];
        var idx = -1;
        if (item.status === "COMPLETED" || item.status === "STOPPED_EARLY") {
          idx = state.tiles.length;
          state.tiles.push({
            _recordingId: item.id,
            name: item.channelName || "Recording",
            tvgLogo: item.channelLogo || undefined,
            groupTitle: item.channelGroup || undefined,
            contentType: "recording",
          });
        }
        html += recordingCardHtml(item, idx, "library");
      }
      html += "</section>";
    }
    container.innerHTML = html || '<div class="legacy-empty">No recordings yet. Scheduled and completed recordings will appear here.</div>';
    bindTileEvents();
    if (state.tiles.length) focusTile(focusIndex == null ? 0 : focusIndex);
  }

  function loadRecordings() {
    state.tab = "recordings";
    state.searchOffset = 0;
    setPageHeading("YOUR DVR", "Recordings", "Watch completed recordings and keep an eye on scheduled captures.");
    updateBrowseChrome();
    showScreen("home");
    showLoading("Loading recordings…");
    return apiFetch("/api/recordings/overview")
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) throw new Error(body.error || "Could not load recordings.");
          renderRecordings(body);
        });
      })
      .catch(function (err) {
        byId("legacy-shelves").innerHTML = "";
        setStatus(err && err.message ? err.message : "Could not load recordings.");
      });
  }

  function switchTab(tab) {
    if (tab === "home") return loadHome();
    if (tab === "library") return loadLibrary();
    if (tab === "favorites") return loadFavorites();
    if (tab === "guide") return loadGuide("");
    if (tab === "recordings") return loadRecordings();
    if (tab === "search") {
      state.tab = "search";
      state.searchOffset = 0;
      setPageHeading("FIND SOMETHING GREAT", "Search", "Search across live channels, movies, and series.");
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
        if (!data || !data.sessionId) return;
        // Build the phone link from the address the TV actually opened. The server
        // may run inside Docker where its internal request URL says localhost.
        var verificationUri = absoluteUrl(
          "/login/pair?s=" + encodeURIComponent(data.sessionId)
        );
        pairUri.textContent = verificationUri;
        if (pairCode) pairCode.textContent = "Approve on your signed-in phone";
        if (window.qrcode) {
          try {
            var qr = window.qrcode(0, "M");
            qr.addData(verificationUri, "Byte");
            qr.make();
            pairQr.src = qr.createDataURL(3, 8);
          } catch (qrError) {
            pairQr.style.display = "none";
          }
        } else {
          pairQr.style.display = "none";
        }
        showPanel("legacy-pair-code-container", true);
        
        if (pairInterval) clearInterval(pairInterval);
        pairInterval = setInterval(function() {
          apiFetch("/api/auth/login/pair/" + encodeURIComponent(data.sessionId))
            .then(function(r) { return r.text(); })
            .then(function(t) {
               var d = parseJson(t);
               if (d && d.status === "complete" && d.accessToken && d.refreshToken) {
                 clearInterval(pairInterval);
                 storeTokens(d.accessToken, d.refreshToken);
                 state.user = d.user || state.user;
                 updateAccountChrome();
                 loadParentalPolicy().then(function () { loadHome(); });
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
        if (!state.authEnabled) return loadParentalPolicy().then(function () { return loadHome(); });
        return apiFetch("/api/auth/me")
          .then(function (res) {
            return res.text();
          })
          .then(function (meText) {
            var me = parseJson(meText) || {};
            if (me.user) {
              state.user = me.user;
              updateAccountChrome();
              return loadParentalPolicy().then(function () { return loadHome(); });
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
          updateAccountChrome();
          return loadParentalPolicy().then(function () { return loadHome(); });
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

    if (active.id === "legacy-screen-series") {
      if (key === 8 || key === 27 || key === 461 || key === 10009) {
        event.preventDefault();
        closeSeries();
      } else if (key >= 37 && key <= 40) {
        var seriesTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
        if (seriesTag !== "input") {
          event.preventDefault();
          spatialNavigate(key, active);
        }
      }
      return;
    }

    if (active.id === "legacy-screen-login") {
      var loginTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
      if ((key === 38 || key === 40) || (loginTag !== "input" && (key === 37 || key === 39))) {
        event.preventDefault();
        spatialNavigate(key, active);
      }
      return;
    }

    if (active.id !== "legacy-screen-home") return;
    var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
    if (key === 8 || key === 27 || key === 461 || key === 10009) {
      var menu = byId("legacy-account-menu");
      if (menu && menu.className.indexOf("is-hidden") === -1) {
        event.preventDefault();
        showPanel("legacy-account-menu", false);
      } else if (state.tab !== "home") {
        event.preventDefault();
        switchTab("home");
      }
    } else if (tag === "input" && (key === 37 || key === 39)) {
      return;
    } else if (key >= 37 && key <= 40) {
      event.preventDefault();
      spatialNavigate(key, active);
    } else if (key === 13 && event.target && event.target.getAttribute && event.target.getAttribute("role") === "button") {
      event.preventDefault();
      event.target.click();
    }
  }

  function visibleFocusable(root) {
    var nodes = root.querySelectorAll("button, input, [tabindex='0']");
    var result = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && nodes[i].disabled !== true) result.push(nodes[i]);
    }
    return result;
  }

  function spatialNavigate(key, root) {
    var items = visibleFocusable(root);
    if (!items.length) return;
    var current = document.activeElement;
    var currentRect = current && current.getBoundingClientRect ? current.getBoundingClientRect() : null;
    if (!currentRect || current === document.body) {
      items[0].focus();
      return;
    }
    var cx = currentRect.left + currentRect.width / 2;
    var cy = currentRect.top + currentRect.height / 2;
    var best = null;
    var bestScore = Number.MAX_VALUE;
    for (var i = 0; i < items.length; i += 1) {
      var candidate = items[i];
      if (candidate === current) continue;
      var rect = candidate.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var dx = x - cx;
      var dy = y - cy;
      if ((key === 37 && dx >= -2) || (key === 39 && dx <= 2) || (key === 38 && dy >= -2) || (key === 40 && dy <= 2)) continue;
      var primary = key === 37 || key === 39 ? Math.abs(dx) : Math.abs(dy);
      var secondary = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
      var score = primary + secondary * 2.7;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) {
      best.focus();
      if (best.scrollIntoView) best.scrollIntoView(false);
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

    var searchToggle = byId("legacy-search-toggle");
    if (searchToggle) searchToggle.addEventListener("click", function () { switchTab("search"); });

    var accountToggle = byId("legacy-account-toggle");
    if (accountToggle) {
      accountToggle.addEventListener("click", function () {
        var menu = byId("legacy-account-menu");
        if (!menu) return;
        showPanel("legacy-account-menu", menu.className.indexOf("is-hidden") !== -1);
      });
    }

    var homeLogo = document.querySelector(".legacy-home-logo");
    if (homeLogo) homeLogo.addEventListener("click", function () { switchTab("home"); });

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
        } else if (state.tab === "guide") {
          loadGuide(state.searchQuery);
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
          if (state.tab === "library") {
            state.searchQuery = searchInput.value;
            loadLibrary();
          } else if (state.tab === "guide") loadGuide(searchInput.value);
          else runSearch(searchInput.value);
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
        state.playingChannel = null;
        if (state.playerPositionTimer) clearInterval(state.playerPositionTimer);
        state.playerPositionTimer = null;
      }
      
      if (state.seriesContainer && s !== "series" && s !== "player") {
        state.seriesContainer = null;
        state.seriesTitle = "";
        state.seriesId = "";
        setSeriesStatus("");
        if (state.seriesReturnTiles) state.tiles = state.seriesReturnTiles;
        state.focusIndex = state.seriesReturnFocusIndex;
        state.seriesReturnTiles = null;
      }
      
      showScreen(s, true);
      if (s === "home") focusTile(state.focusIndex);
      if (s === "series") focusTile(state.focusIndex);
    });
  }

  bindUi();
  checkAuth();
})();
