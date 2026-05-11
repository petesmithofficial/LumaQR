(function bootQrStudio() {
  "use strict";

  const elements = {
    payload: document.getElementById("payload"),
    capacityState: document.getElementById("capacityState"),
    qrStage: document.getElementById("qrStage"),
    canvas: document.getElementById("qrCanvas"),
    emptyState: document.getElementById("emptyState"),
    downloadButton: document.getElementById("downloadButton"),
  };

  const PREVIEW_QUIET_ZONE = 4;
  const EXPORT_TARGET_PX = 2048;
  let currentQr = null;
  let renderFrame = 0;

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  }

  function render() {
    const value = elements.payload.value;

    if (value.length === 0) {
      currentQr = null;
      clearQr("Standby");
      return;
    }

    try {
      currentQr = QrEngine.encode(value, { errorLevel: "AUTO" });
      drawQrToCanvas(currentQr, elements.canvas, getPreviewPixelSize(currentQr));
      updateQrStats();
    } catch (error) {
      currentQr = null;
      clearQr("Too much content", error.message || "Payload is too large", true);
    }
  }

  function updateQrStats() {
    elements.qrStage.classList.add("has-code");
    elements.downloadButton.disabled = false;
    elements.emptyState.querySelector("span").textContent = "Standby";
    elements.capacityState.classList.remove("is-error");
    elements.capacityState.textContent = "";
    elements.capacityState.hidden = true;
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

    const canvas = document.createElement("canvas");
    drawQrToCanvas(currentQr, canvas, EXPORT_TARGET_PX);
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = makeFileName(currentQr.text);
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

  elements.payload.addEventListener("input", scheduleRender);
  elements.downloadButton.addEventListener("click", downloadCurrentQr);
  window.addEventListener("resize", scheduleRender);

  scheduleRender();
})();
