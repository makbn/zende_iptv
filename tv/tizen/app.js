(function () {
  "use strict";

  var storageKey = "zende.tv.serverUrl";
  var form = document.getElementById("server-form");
  var input = document.getElementById("server-url");
  var error = document.getElementById("error");

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

  var saved = localStorage.getItem(storageKey);
  if (saved) {
    input.value = saved;
    window.setTimeout(function () {
      window.location.assign(saved);
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
    error.textContent = "";
    localStorage.setItem(storageKey, serverUrl);
    window.location.assign(serverUrl);
  });

  document.addEventListener("keydown", function (event) {
    if (event.keyCode === 10009) {
      try {
        window.tizen.application.getCurrentApplication().exit();
      } catch (ignored) {
        window.close();
      }
    }
  });

  input.focus();
})();
