(function () {
  "use strict";

  var storageKey = "zende.tv.serverUrl";
  var form = document.getElementById("server-form");
  var input = document.getElementById("server-url");
  var submit = form.querySelector("button[type='submit']");
  var error = document.getElementById("error");
  var status = document.getElementById("status");
  var editingInput = false;

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function normalizeServerUrl(raw) {
    var value = String(raw || "").trim().replace(/\/+$/, "");
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!parsed.hostname || parsed.username || parsed.password) return null;
      return parsed.href.replace(/\/+$/, "");
    } catch (ignored) {
      return null;
    }
  }

  function probeServer(url, done) {
    var xhr = new XMLHttpRequest();
    var finished = false;
    function finish(ok, detail) {
      if (finished) return;
      finished = true;
      done(ok, detail);
    }
    xhr.timeout = 10000;
    try {
      xhr.open("GET", url + "/", true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        /* Older Tizen often reports status 0 for opaque/CORS successes; treat
           network-level errors via onerror/ontimeout instead. */
        if (xhr.status === 0) {
          finish(true, "reachable");
          return;
        }
        finish(xhr.status >= 200 && xhr.status < 500, "http-" + xhr.status);
      };
      xhr.ontimeout = function () {
        finish(false, "timeout");
      };
      xhr.onerror = function () {
        finish(false, "network");
      };
      xhr.send();
    } catch (err) {
      finish(false, "exception");
    }
  }

  function openServer(serverUrl, opts) {
    var options = opts || {};
    input.value = serverUrl;
    localStorage.setItem(storageKey, serverUrl);
    if (options.skipProbe) {
      window.location.assign(serverUrl);
      return;
    }
    setStatus("Checking " + serverUrl + "…");
    error.textContent = "";
    probeServer(serverUrl, function (ok, detail) {
      if (ok) {
        setStatus("Opening Zende…");
        window.location.assign(serverUrl);
        return;
      }
      setStatus("");
      if (serverUrl.indexOf("https://") === 0) {
        error.textContent =
          "Could not open that HTTPS address (" +
          detail +
          "). Older Samsung TVs often fail Cloudflare SSL — try http://YOUR-PC-IP:8077 on your LAN.";
      } else {
        error.textContent =
          "Could not reach " +
          serverUrl +
          " (" +
          detail +
          "). Check the PC is on, Zende is running, and the TV is on the same Wi‑Fi.";
      }
      input.focus();
    });
  }

  var saved = localStorage.getItem(storageKey);
  if (saved) {
    input.value = saved;
    window.setTimeout(function () {
      openServer(saved);
    }, 0);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var serverUrl = normalizeServerUrl(input.value);
    if (!serverUrl) {
      error.textContent = "Enter a valid HTTP or HTTPS server address.";
      input.focus();
      return;
    }
    openServer(serverUrl);
  });

  function beginInputEditing(event) {
    if (editingInput) return;
    editingInput = true;
    input.readOnly = false;
    input.focus();
    input.click();
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  input.addEventListener("blur", function () {
    editingInput = false;
    input.readOnly = true;
  });

  input.addEventListener("pointerdown", function () {
    editingInput = true;
    input.readOnly = false;
  });

  document.addEventListener("keydown", function (event) {
    var keyCode = event.keyCode;
    var active = document.activeElement;

    if ((event.key === "Enter" || keyCode === 13) && active === input && input.readOnly) {
      beginInputEditing(event);
      return;
    }

    if (!editingInput && (event.key === "ArrowDown" || keyCode === 40) && active === input) {
      event.preventDefault();
      submit.focus();
      return;
    }

    if ((event.key === "ArrowUp" || keyCode === 38) && active === submit) {
      event.preventDefault();
      input.readOnly = true;
      input.focus();
      return;
    }

    if (event.keyCode === 10009) {
      try {
        window.tizen.application.getCurrentApplication().exit();
      } catch (ignored) {
        window.close();
      }
    }
  });

  if (!saved) input.focus();
})();
