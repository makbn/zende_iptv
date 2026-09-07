(function () {
  "use strict";

  var storageKey = "zende.tv.serverUrl";
  var form = document.getElementById("server-form");
  var input = document.getElementById("server-url");
  var submit = form.querySelector("button[type='submit']");
  var error = document.getElementById("error");
  var editingInput = false;

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
