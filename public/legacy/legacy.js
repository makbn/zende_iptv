/* eslint-disable */
/**
 * ES5-compatible client for Samsung Tizen 3.x / Chromium 47 TV browsers.
 * Uses only APIs available in ~2015 Chromium (fetch, Promise, JSON, localStorage).
 */
(function () {
  "use strict";

  var Z_ACCESS = "zenede.accessToken";
  var Z_REFRESH = "zenede.refreshToken";
  var PRESET_ID = "iptv-org-world-index";

  var state = {
    authEnabled: false,
    user: null,
    shelves: null,
    focusIndex: 0,
    tiles: [],
    playing: null,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    var el = byId("legacy-status");
    if (el) el.textContent = message || "";
  }

  function showScreen(name) {
    var screens = document.querySelectorAll(".legacy-screen");
    for (var i = 0; i < screens.length; i++) {
      screens[i].className = screens[i].className.replace(" is-active", "");
    }
    var target = byId("legacy-screen-" + name);
    if (target) target.className += " is-active";
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

    return fetch(path, {
      method: (options && options.method) || "GET",
      headers: headers,
      body: options && options.body ? options.body : undefined,
    }).then(function (res) {
      if (res.status !== 401) return res;
      var refresh = getRefreshToken();
      if (!refresh) return res;
      return fetch("/api/auth/refresh", {
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
          return fetch(path, {
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

  function channelTileHtml(channel, index) {
    var logo = channel.tvgLogo ? "background-image:url('" + escapeHtml(channel.tvgLogo) + "')" : "";
    var group = channel.groupTitle ? escapeHtml(channel.groupTitle) : "Live";
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
      group +
      "</span>" +
      "</div></button>"
    );
  }

  function renderShelves(shelves) {
    var container = byId("legacy-shelves");
    if (!container) return;

    var sections = [
      { key: "discover", title: "Discover" },
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

  function bindTileEvents() {
    var tiles = document.querySelectorAll(".legacy-tile");
    for (var i = 0; i < tiles.length; i++) {
      (function (tile) {
        tile.addEventListener("click", function () {
          var idx = Number(tile.getAttribute("data-index"));
          playChannel(state.tiles[idx]);
        });
        tile.addEventListener("focus", function () {
          var idx = Number(tile.getAttribute("data-index"));
          focusTile(idx);
        });
      })(tiles[i]);
    }
  }

  function playChannel(channel) {
    if (!channel || !channel.url) return;
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
          if (!res.ok) {
            throw new Error(body.error || "Could not start playback.");
          }
          if (!body.id) throw new Error("Could not start playback.");
          return body.id;
        });
      })
      .then(function (sessionId) {
        return apiFetch("/api/stream/session/" + encodeURIComponent(sessionId)).then(function (res) {
          return res.text().then(function (text) {
            var meta = parseJson(text) || {};
            if (!res.ok) {
              throw new Error(meta.error || "Playback session expired.");
            }
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
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.src = meta.playbackUrl;
          var playAttempt = video.play();
          if (playAttempt && playAttempt.catch) {
            playAttempt.catch(function () {});
          }
        }
        showScreen("player");
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Playback failed.");
      });
  }

  function stopPlayback() {
    var video = byId("legacy-video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    state.playing = null;
    showScreen("home");
    focusTile(state.focusIndex);
  }

  function loadHome() {
    showScreen("home");
    setStatus("");
    byId("legacy-shelves").innerHTML = '<div class="legacy-loading">Loading channels…</div>';

    return apiFetch(
      "/api/library/home-shelves?presetId=" +
        encodeURIComponent(PRESET_ID) +
        "&discoverLimit=36&movieLimit=18&seriesLimit=18&language=en",
    )
      .then(function (res) {
        return res.text().then(function (text) {
          var body = parseJson(text) || {};
          if (!res.ok) {
            throw new Error(body.error || "Could not load channels.");
          }
          state.shelves = body;
          renderShelves(body);
        });
      })
      .catch(function (err) {
        byId("legacy-shelves").innerHTML = "";
        setStatus(err && err.message ? err.message : "Could not load channels.");
      });
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
        if (!state.authEnabled) {
          return loadHome();
        }
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
            showScreen("login");
          });
      })
      .catch(function () {
        setStatus("Could not reach the server.");
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
          if (!res.ok) {
            throw new Error(body.error || "Login failed.");
          }
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

    if (active.id !== "legacy-screen-home" || !state.tiles.length) return;

    if (key === 37) {
      event.preventDefault();
      focusTile(state.focusIndex - 1);
    } else if (key === 39) {
      event.preventDefault();
      focusTile(state.focusIndex + 1);
    } else if (key === 13) {
      event.preventDefault();
      playChannel(state.tiles[state.focusIndex]);
    }
  }

  function bindUi() {
    var loginForm = byId("legacy-login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var username = byId("legacy-username").value;
        var password = byId("legacy-password").value;
        login(username, password);
      });
    }

    var backBtn = byId("legacy-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        stopPlayback();
      });
    }

    document.addEventListener("keydown", onKeyDown);
  }

  bindUi();
  checkAuth();
})();
