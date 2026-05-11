(function bootQrStudio() {
  "use strict";

  const elements = {
    payload: document.getElementById("payload"),
    capacityState: document.getElementById("capacityState"),
    qrStage: document.getElementById("qrStage"),
    canvas: document.getElementById("qrCanvas"),
    emptyState: document.getElementById("emptyState"),
    downloadButton: document.getElementById("downloadButton"),
    modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  };

  const PREVIEW_QUIET_ZONE = 4;
  const EXPORT_TARGET_PX = 2048;
  const MAX_INPUT_CHARS = QrEngine.internals.getByteCapacity(40, "L");
  const INPUT_MODES = {
    url: {
      placeholder: "https://example.com",
      inputMode: "url",
      spellcheck: false,
    },
    text: {
      placeholder: "Type any text",
      inputMode: "text",
      spellcheck: true,
    },
  };
  let currentQr = null;
  let currentMode = "url";
  let renderFrame = 0;

  elements.payload.maxLength = MAX_INPUT_CHARS;

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  }

  function render() {
    const inputState = enforceInputLimit();
    const payloadState = preparePayload(inputState.value);
    const value = payloadState.value;

    if (value.length === 0) {
      currentQr = null;
      clearQr("Standby");
      return;
    }

    try {
      currentQr = QrEngine.encode(value, { errorLevel: "AUTO" });
      drawQrToCanvas(currentQr, elements.canvas, getPreviewPixelSize(currentQr));
      updateQrStats(inputState.detail || payloadState.detail);
    } catch (error) {
      currentQr = null;
      clearQr("Too much content", error.message || "Payload is too large", true);
    }
  }

  function enforceInputLimit() {
    const value = elements.payload.value;
    if (value.length <= MAX_INPUT_CHARS) {
      return { value, detail: "" };
    }

    const truncated = value.slice(0, MAX_INPUT_CHARS);
    elements.payload.value = truncated;
    return {
      value: truncated,
      detail: `Input capped at ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
    };
  }

  function preparePayload(value) {
    if (currentMode !== "url") {
      return { value, detail: "" };
    }

    const encoded = encodeUrlPayload(value);
    if (encoded !== value) {
      elements.payload.value = encoded;
    }

    return { value: encoded, detail: "" };
  }

  function encodeUrlPayload(value) {
    const compacted = value.trim().replace(/\s+/g, "%20");
    if (!compacted) {
      return "";
    }

    const preservedEscapes = [];
    const protectedValue = compacted.replace(/%[0-9a-fA-F]{2}/g, (match) => {
      const token = `__QRHEX${preservedEscapes.length}__`;
      preservedEscapes.push(match.toUpperCase());
      return token;
    });

    return safeEncodeUri(protectedValue).replace(/__QRHEX(\d+)__/g, (match, index) => {
      return preservedEscapes[Number(index)] || match;
    });
  }

  function safeEncodeUri(value) {
    try {
      return encodeURI(value);
    } catch (error) {
      return value.replace(/%(?![0-9a-fA-F]{2})/g, "%25");
    }
  }

  function updateQrStats(detail = "") {
    elements.qrStage.classList.add("has-code");
    elements.downloadButton.disabled = false;
    elements.emptyState.querySelector("span").textContent = "Standby";
    elements.capacityState.classList.remove("is-error");
    elements.capacityState.textContent = detail;
    elements.capacityState.hidden = !detail;
  }

  function clearQr(label, detail = "", isError = false) {
    elements.qrStage.classList.remove("has-code");
    elements.downloadButton.disabled = true;
    elements.emptyState.querySelector("span").textContent = label;
    elements.capacityState.textContent = detail;
    elements.capacityState.hidden = !detail;
    elements.capacityState.classList.toggle("is-error", isError);
  }

  function getPreviewPixelSize(qr) {
    const stageRect = elements.qrStage.getBoundingClientRect();
    const cssSize = Math.max(280, Math.min(stageRect.width || 520, stageRect.height || stageRect.width || 520));
    const totalModules = qr.size + PREVIEW_QUIET_ZONE * 2;
    const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
    const modulePx = Math.max(4, Math.floor((cssSize * deviceScale) / totalModules));
    return modulePx * totalModules;
  }

  function drawQrToCanvas(qr, canvas, targetPx) {
    const totalModules = qr.size + PREVIEW_QUIET_ZONE * 2;
    const modulePx = Math.max(1, Math.floor(targetPx / totalModules));
    const actualSize = modulePx * totalModules;
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = actualSize;
    canvas.height = actualSize;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, actualSize, actualSize);
    context.fillStyle = "#11130f";

    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.modules[y][x]) {
          context.fillRect(
            (x + PREVIEW_QUIET_ZONE) * modulePx,
            (y + PREVIEW_QUIET_ZONE) * modulePx,
            modulePx,
            modulePx,
          );
        }
      }
    }
  }

  function downloadCurrentQr() {
    if (!currentQr) {
      return;
    }

    const qr = currentQr;
    const canvas = document.createElement("canvas");
    drawQrToCanvas(qr, canvas, EXPORT_TARGET_PX);
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = makeFileName(qr.text);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function makeFileName(text) {
    const trimmed = text.trim().toLowerCase();
    const slug = trimmed
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42);
    const suffix = slug || "payload";
    return `qr-${suffix}.png`;
  }

  function setMode(mode) {
    if (!INPUT_MODES[mode]) {
      return;
    }

    const previousMode = currentMode;
    currentMode = mode;
    const config = INPUT_MODES[mode];
    elements.payload.placeholder = config.placeholder;
    elements.payload.inputMode = config.inputMode;
    elements.payload.spellcheck = config.spellcheck;
    if (previousMode === "url" && mode === "text") {
      elements.payload.value = decodeUrlSpaces(elements.payload.value);
    }

    for (const button of elements.modeButtons) {
      const isActive = button.dataset.mode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    scheduleRender();
  }

  function decodeUrlSpaces(value) {
    return value.replace(/%20/gi, " ");
  }

  elements.payload.addEventListener("input", scheduleRender);
  elements.downloadButton.addEventListener("click", downloadCurrentQr);
  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }
  window.addEventListener("resize", scheduleRender);

  setMode(currentMode);
  scheduleRender();
})();
