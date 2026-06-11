const imageInput = document.querySelector("#imageInput");
const dropzone = document.querySelector("#dropzone");
const generateBtn = document.querySelector("#generateBtn");
const resetBtn = document.querySelector("#resetBtn");
const statusEl = document.querySelector("#status");
const sourceStage = document.querySelector("#sourceStage");
const resultStage = document.querySelector("#resultStage");
const sourceMeta = document.querySelector("#sourceMeta");
const downloadLink = document.querySelector("#downloadLink");
const gridSizeInput = document.querySelector("#gridSizeInput");
const sizePresetInputs = [...document.querySelectorAll('input[name="sizePreset"]')];
const apiBase = getApiBase();

let selectedFile = null;
let selectedDataUrl = "";

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) setSelectedFile(file);
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer.files?.[0];
  if (file) setSelectedFile(file);
});

generateBtn.addEventListener("click", generateImage);
resetBtn.addEventListener("click", resetAll);
sizePresetInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) gridSizeInput.value = input.value;
  });
});
gridSizeInput.addEventListener("input", syncSizePreset);

async function setSelectedFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请上传图片文件。", true);
    return;
  }

  if (file.size > 12 * 1024 * 1024) {
    setStatus("图片太大了，请上传 12MB 以内的图片。", true);
    return;
  }

  selectedFile = file;
  selectedDataUrl = await readAsDataUrl(file);
  sourceStage.innerHTML = `<img src="${selectedDataUrl}" alt="上传的原图" />`;
  sourceMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  generateBtn.disabled = false;
  resetBtn.disabled = false;
  resultStage.classList.remove("loading");
  resultStage.innerHTML = "<span>生成后显示</span>";
  downloadLink.classList.add("hidden");
  setStatus("图片已就绪。");
}

async function generateImage() {
  if (!selectedFile || !selectedDataUrl) return;

  setLoading(true);
  setStatus("正在准备拼豆图纸...");
  resultStage.innerHTML = "";
  downloadLink.classList.add("hidden");

  try {
    const customGrid = parseGridSizeInput();
    const base64 = selectedDataUrl.split(",")[1];
    const imageStats = await analyzeImageComplexity(selectedDataUrl);
    const payload = await getGridDecision({
      image: base64,
      mimeType: selectedFile.type,
      fileName: selectedFile.name,
      imageStats
    });

    setStatus("正在生成带色号的拼豆图纸...");
    const result = await renderPindouImage(selectedDataUrl, {
      ...payload.style,
      gridSize: customGrid,
      ditherMode: getDitherMode()
    });

    resultStage.innerHTML = `<img src="${result.previewSrc}" alt="生成的拼豆预览图" />`;
    downloadLink.href = result.chartSrc;
    downloadLink.textContent = "下载图纸";
    downloadLink.classList.remove("hidden");
    setStatus("生成完成，可以下载啦。");
  } catch (error) {
    resultStage.innerHTML = "<span>生成失败</span>";
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}

function getDitherMode() {
  const mode = document.querySelector('input[name="ditherMode"]:checked')?.value;
  return ["soft", "balanced", "detail"].includes(mode) ? mode : "balanced";
}

function parseGridSizeInput() {
  const rawValue = gridSizeInput.value.trim();
  const match = rawValue.match(/^(\d{1,3})\s*[*xX×,，\s]\s*(\d{1,3})$/);
  if (!match) {
    throw new Error("请按 100*100 的格式填写拼豆尺寸。");
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 20 || height < 20) {
    throw new Error("拼豆宽高不能小于 20。");
  }
  if (width > 100 || height > 100 || width * height > 10000) {
    throw new Error("拼豆尺寸最高支持 100*100。");
  }

  return { width, height };
}

function syncSizePreset() {
  const normalized = normalizeSizeValue(gridSizeInput.value);
  let matched = false;
  for (const input of sizePresetInputs) {
    input.checked = input.value === normalized;
    matched ||= input.checked;
  }
  if (!matched) {
    sizePresetInputs.forEach((input) => {
      input.checked = false;
    });
  }
}

function normalizeSizeValue(value) {
  const match = value.trim().match(/^(\d{1,3})\s*[*xX×,，\s]\s*(\d{1,3})$/);
  return match ? `${Number(match[1])}*${Number(match[2])}` : "";
}

async function getGridDecision(requestBody) {
  try {
    const response = await fetch(`${apiBase}/api/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "生成失败，请稍后再试。");
    return { ...payload, source: "longcat" };
  } catch (error) {
    console.warn("Remote grid decision unavailable, using local fallback.", error);
    return {
      source: "local",
      style: {
        gridSize: decideGridSizeLocally(requestBody.imageStats),
        paletteStrategy: "adaptive"
      }
    };
  }
}

function decideGridSizeLocally(stats) {
  const score =
    stats.edgeDensity * 2.2 +
    Math.min(stats.colorBins / 80, 1) * 1.4 +
    stats.subjectRatio * 0.8 +
    Math.min(stats.contrast / 110, 1) * 0.8;

  if (score < 1.25) return 25;
  if (score < 2.55) return 50;
  return 100;
}

function resetAll() {
  selectedFile = null;
  selectedDataUrl = "";
  imageInput.value = "";
  sourceStage.innerHTML = "<span>等待图片</span>";
  resultStage.innerHTML = "<span>生成后显示</span>";
  resultStage.classList.remove("loading");
  sourceMeta.textContent = "未上传";
  generateBtn.disabled = true;
  resetBtn.disabled = true;
  downloadLink.classList.add("hidden");
  setStatus("");
}

function getApiBase() {
  if (window.PINDOU_API_BASE) return window.PINDOU_API_BASE.replace(/\/$/, "");
  if (window.location.hostname.endsWith("github.io")) {
    return "https://pindou-create.onrender.com";
  }
  return "";
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading || !selectedFile;
  resetBtn.disabled = isLoading || !selectedFile;
  resultStage.classList.toggle("loading", isLoading);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function renderPindouImage(dataUrl, style = {}) {
  const image = await loadImage(dataUrl);
  const grid = getGridSize(image, style.gridSize);
  const maxGrid = Math.max(grid.width, grid.height);
  const cell = getChartCellSize(maxGrid);
  const header = 26;
  const titleHeight = 52;

  const sourceImage = readSourceImage(image);
  const ditherMode = ["soft", "balanced", "detail"].includes(style.ditherMode) ? style.ditherMode : "balanced";
  const rawSource = buildRepresentativeGrid(sourceImage, grid);
  const flatArtwork = isFlatArtwork(rawSource, grid);
  const source = flatArtwork ? rawSource : enhanceColorGrid(rawSource, grid, ditherMode);
  const cornerColor = getCornerColor(source, grid.width, grid.height);
  const palette = buildMardPalette();
  const legendHeight = 210;
  const chartWidth = header * 2 + grid.width * cell;
  const chartHeight = titleHeight + header * 2 + grid.height * cell + legendHeight;
  const cells = [];
  const counts = new Map();

  const quantized = flatArtwork
    ? quantizeGridConsistently(source, grid, palette, cornerColor)
    : quantizeGridWithErrorDiffusion(source, grid, palette, cornerColor, maxGrid, ditherMode);
  cells.push(...quantized.cells);
  for (const bead of cells) {
    if (bead) counts.set(bead.code, (counts.get(bead.code) || 0) + 1);
  }

  const chartCanvas = document.createElement("canvas");
  const chartCtx = chartCanvas.getContext("2d");
  chartCanvas.width = chartWidth;
  chartCanvas.height = chartHeight;

  drawPatternSheet(chartCtx, {
    cells,
    counts,
    palette,
    grid,
    cell,
    header,
    titleHeight,
    chartWidth,
    chartHeight,
    legendHeight
  });

  return {
    chartSrc: chartCanvas.toDataURL("image/png"),
    previewSrc: drawPindouPreview(cells, grid, maxGrid)
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function readSourceImage(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  return {
    data: ctx.getImageData(0, 0, width, height),
    width,
    height
  };
}

function buildRepresentativeGrid(sourceImage, grid) {
  const data = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const color = sampleCellColor(sourceImage, grid, x, y);
      const index = (y * grid.width + x) * 4;
      data[index] = color.r;
      data[index + 1] = color.g;
      data[index + 2] = color.b;
      data[index + 3] = color.a;
    }
  }
  return { data, width: grid.width, height: grid.height };
}

function sampleCellColor(sourceImage, grid, cellX, cellY) {
  const { data, width, height } = sourceImage;
  const x0 = Math.floor((cellX * width) / grid.width);
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(((cellX + 1) * width) / grid.width)));
  const y0 = Math.floor((cellY * height) / grid.height);
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(((cellY + 1) * height) / grid.height)));
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const stride = Math.max(1, Math.floor(Math.sqrt(area / 80)));
  const samples = [];

  for (let y = y0; y < y1; y += stride) {
    for (let x = x0; x < x1; x += stride) {
      const index = (y * width + x) * 4;
      const a = data.data[index + 3];
      if (a < 20) continue;
      const color = {
        r: data.data[index],
        g: data.data[index + 1],
        b: data.data[index + 2],
        a
      };
      samples.push({
        color,
        luminance: getLuminance(color)
      });
    }
  }

  if (!samples.length) return { r: 255, g: 255, b: 255, a: 0 };

  samples.sort((a, b) => a.luminance - b.luminance);
  const trim = samples.length > 18 ? Math.floor(samples.length * 0.1) : 0;
  const kept = samples.slice(trim, samples.length - trim);
  const mid = kept[Math.floor(kept.length / 2)].color;
  const total = kept.reduce(
    (sum, sample) => {
      const weight = sample.color.a / 255;
      sum.r += srgbToLinear(sample.color.r) * weight;
      sum.g += srgbToLinear(sample.color.g) * weight;
      sum.b += srgbToLinear(sample.color.b) * weight;
      sum.a += sample.color.a;
      sum.weight += weight;
      return sum;
    },
    { r: 0, g: 0, b: 0, a: 0, weight: 0 }
  );

  const weight = Math.max(total.weight, 0.0001);
  const mean = {
    r: linearToSrgb(total.r / weight),
    g: linearToSrgb(total.g / weight),
    b: linearToSrgb(total.b / weight)
  };
  return {
    r: Math.round(mean.r * 0.72 + mid.r * 0.28),
    g: Math.round(mean.g * 0.72 + mid.g * 0.28),
    b: Math.round(mean.b * 0.72 + mid.b * 0.28),
    a: Math.round(total.a / kept.length)
  };
}

function enhanceColorGrid(source, grid, mode) {
  const params = getModeParams(mode);
  const data = new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = (y * grid.width + x) * 4;
      const color = getPixel(source, grid.width, x, y);
      const localAverage = getLocalAverageColor(source, grid, x, y);
      const sharpened = {
        r: color.r + (color.r - localAverage.r) * params.sharpness,
        g: color.g + (color.g - localAverage.g) * params.sharpness,
        b: color.b + (color.b - localAverage.b) * params.sharpness,
        a: color.a
      };
      const adjusted = boostSaturationAndContrast(sharpened, params);
      data[index] = adjusted.r;
      data[index + 1] = adjusted.g;
      data[index + 2] = adjusted.b;
      data[index + 3] = color.a;
    }
  }
  return { data, width: source.width, height: source.height };
}

function getLocalAverageColor(source, grid, x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let ny = y - 1; ny <= y + 1; ny += 1) {
    for (let nx = x - 1; nx <= x + 1; nx += 1) {
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const color = getPixel(source, grid.width, nx, ny);
      r += color.r;
      g += color.g;
      b += color.b;
      count += 1;
    }
  }

  return {
    r: r / Math.max(1, count),
    g: g / Math.max(1, count),
    b: b / Math.max(1, count)
  };
}

function boostSaturationAndContrast(color, params) {
  const hsl = rgbToHsl(color);
  const boosted = hslToRgb({
    h: hsl.h,
    s: Math.min(1, hsl.s * params.saturation),
    l: Math.max(0, Math.min(1, 0.5 + (hsl.l - 0.5) * params.contrast))
  });
  return clampColor({ ...boosted, a: color.a });
}

function isFlatArtwork(source, grid) {
  const cornerColor = getCornerColor(source, grid.width, grid.height);
  const bins = new Map();
  let filled = 0;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const color = getPixel(source, grid.width, x, y);
      if (isBackgroundCell(color, cornerColor)) continue;
      filled += 1;
      const key = getConsistentColorKey(color, 18);
      bins.set(key, (bins.get(key) || 0) + 1);
    }
  }

  if (filled < 12) return true;

  const counts = [...bins.values()].sort((a, b) => b - a);
  const dominant = counts.slice(0, 4).reduce((sum, count) => sum + count, 0);
  const dominantRatio = dominant / filled;
  return bins.size <= 18 || dominantRatio > 0.86;
}

function quantizeGridConsistently(source, grid, palette, cornerColor) {
  const cells = new Array(grid.width * grid.height);
  const cache = new Map();
  const dominant = getDominantFlatArtworkColor(source, grid, cornerColor);
  const dominantBead = dominant ? nearestPaletteColor(dominant, palette) : null;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = y * grid.width + x;
      const color = getPixel(source, grid.width, x, y);
      if (isBackgroundCell(color, cornerColor)) {
        cells[index] = null;
        continue;
      }

      if (dominantBead && colorDistance(color, dominant) < 58) {
        cells[index] = dominantBead;
        continue;
      }

      const key = getConsistentColorKey(color, 18);
      if (!cache.has(key)) {
        cache.set(key, nearestPaletteColor(color, palette));
      }
      cells[index] = cache.get(key);
    }
  }

  return { cells };
}

function getDominantFlatArtworkColor(source, grid, cornerColor) {
  const groups = new Map();

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const color = getPixel(source, grid.width, x, y);
      if (isBackgroundCell(color, cornerColor)) continue;
      const key = getConsistentColorKey(color, 26);
      const group = groups.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      group.r += color.r;
      group.g += color.g;
      group.b += color.b;
      group.count += 1;
      groups.set(key, group);
    }
  }

  const dominant = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;
  return {
    r: dominant.r / dominant.count,
    g: dominant.g / dominant.count,
    b: dominant.b / dominant.count
  };
}

function getConsistentColorKey(color, step) {
  return [
    Math.round(color.r / step),
    Math.round(color.g / step),
    Math.round(color.b / step)
  ].join("-");
}

function quantizeGridWithErrorDiffusion(source, grid, palette, cornerColor, maxGrid, mode) {
  const work = [];
  const cells = new Array(grid.width * grid.height);
  const params = getModeParams(mode);
  const ditherStrength = params.ditherStrength * (maxGrid >= 100 ? 1 : maxGrid >= 50 ? 0.86 : 0.68);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const color = getPixel(source, grid.width, x, y);
      work.push({ r: color.r, g: color.g, b: color.b, a: color.a });
    }
  }

  for (let y = 0; y < grid.height; y += 1) {
    const leftToRight = y % 2 === 0;
    for (let step = 0; step < grid.width; step += 1) {
      const x = leftToRight ? step : grid.width - 1 - step;
      const index = y * grid.width + x;
      const color = clampColor(work[index]);

      if (isBackgroundCell(color, cornerColor)) {
        cells[index] = null;
        continue;
      }

      const bead = nearestPaletteColor(color, palette);
      cells[index] = bead;
      const error = {
        r: (color.r - bead.r) * ditherStrength,
        g: (color.g - bead.g) * ditherStrength,
        b: (color.b - bead.b) * ditherStrength
      };

      diffuseErrorByMode(work, grid, x, y, error, cornerColor, leftToRight, mode);
    }
  }

  return { cells };
}

function getModeParams(mode) {
  if (mode === "soft") {
    return { sharpness: 0.14, saturation: 1.05, contrast: 1.02, ditherStrength: 0.34 };
  }
  if (mode === "detail") {
    return { sharpness: 0.32, saturation: 1.14, contrast: 1.08, ditherStrength: 0.62 };
  }
  return { sharpness: 0.22, saturation: 1.09, contrast: 1.04, ditherStrength: 0.44 };
}

function diffuseErrorByMode(work, grid, x, y, error, cornerColor, leftToRight, mode) {
  const direction = leftToRight ? 1 : -1;
  if (mode === "soft") {
    diffuseError(work, grid, x + direction, y, error, 1 / 8, cornerColor);
    diffuseError(work, grid, x + direction * 2, y, error, 1 / 8, cornerColor);
    diffuseError(work, grid, x - direction, y + 1, error, 1 / 8, cornerColor);
    diffuseError(work, grid, x, y + 1, error, 1 / 8, cornerColor);
    diffuseError(work, grid, x + direction, y + 1, error, 1 / 8, cornerColor);
    diffuseError(work, grid, x, y + 2, error, 1 / 8, cornerColor);
    return;
  }

  if (mode === "detail") {
    diffuseError(work, grid, x + direction, y, error, 7 / 16, cornerColor);
    diffuseError(work, grid, x - direction, y + 1, error, 3 / 16, cornerColor);
    diffuseError(work, grid, x, y + 1, error, 5 / 16, cornerColor);
    diffuseError(work, grid, x + direction, y + 1, error, 1 / 16, cornerColor);
    return;
  }

  diffuseError(work, grid, x + direction, y, error, 2 / 4, cornerColor);
  diffuseError(work, grid, x - direction, y + 1, error, 1 / 4, cornerColor);
  diffuseError(work, grid, x, y + 1, error, 1 / 4, cornerColor);
}

function diffuseError(work, grid, x, y, error, factor, cornerColor) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
  const index = y * grid.width + x;
  if (isBackgroundCell(work[index], cornerColor)) return;
  work[index].r += error.r * factor;
  work[index].g += error.g * factor;
  work[index].b += error.b * factor;
}

async function analyzeImageComplexity(dataUrl) {
  const image = await loadImage(dataUrl);
  const size = 96;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = size;
  canvas.height = size;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size);
  const cornerColor = getCornerColor(data, size, size);
  const bins = new Set();
  let subjectPixels = 0;
  let edgePixels = 0;
  let contrastTotal = 0;
  let comparisons = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = getPixel(data, size, x, y);
      if (isBackgroundCell(color, cornerColor)) continue;

      subjectPixels += 1;
      bins.add(`${color.r >> 5}-${color.g >> 5}-${color.b >> 5}`);

      if (x < size - 1) {
        const right = getPixel(data, size, x + 1, y);
        const contrast = colorDistance(color, right);
        contrastTotal += contrast;
        comparisons += 1;
        if (contrast > 42) edgePixels += 1;
      }

      if (y < size - 1) {
        const down = getPixel(data, size, x, y + 1);
        const contrast = colorDistance(color, down);
        contrastTotal += contrast;
        comparisons += 1;
        if (contrast > 42) edgePixels += 1;
      }
    }
  }

  return {
    width: image.width,
    height: image.height,
    edgeDensity: roundMetric(edgePixels / Math.max(1, comparisons)),
    colorBins: bins.size,
    subjectRatio: roundMetric(subjectPixels / (size * size)),
    contrast: roundMetric(contrastTotal / Math.max(1, comparisons), 1)
  };
}

function roundMetric(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nearestPaletteColor(color, palette) {
  if (!palette.length) return color;

  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  const lab = rgbToLab(color);
  for (const candidate of palette) {
    const distance = ciede2000(lab, candidate.lab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function buildMardPalette() {
  const colors = window.MARD_COLORS_221 || [];
  return colors.map((color) => ({
    code: color.code,
    r: color.r,
    g: color.g,
    b: color.b,
    hex: color.hex,
    lab: rgbToLab(color),
    hsl: rgbToHsl(color)
  }));
}

function getGridSize(image, requestedGrid) {
  if (requestedGrid && Number.isInteger(requestedGrid.width) && Number.isInteger(requestedGrid.height)) {
    return {
      width: requestedGrid.width,
      height: requestedGrid.height
    };
  }

  const longSide = [25, 50, 100, 150, 200].includes(Number(requestedGrid)) ? Number(requestedGrid) : 100;
  const aspect = image.width / image.height;
  if (aspect >= 1) {
    return {
      width: longSide,
      height: Math.max(24, Math.round(longSide / aspect))
    };
  }
  return {
    width: Math.max(24, Math.round(longSide * aspect)),
    height: longSide
  };
}

function getChartCellSize(maxGrid) {
  if (maxGrid <= 25) return 28;
  if (maxGrid <= 50) return 18;
  if (maxGrid <= 100) return 13;
  if (maxGrid <= 150) return 11;
  return 10;
}

function getPixel(source, width, x, y) {
  const index = (y * width + x) * 4;
  return {
    r: source.data[index],
    g: source.data[index + 1],
    b: source.data[index + 2],
    a: source.data[index + 3]
  };
}

function drawPatternSheet(ctx, options) {
  const { cells, counts, palette, grid, cell, header, titleHeight, chartWidth, chartHeight } = options;
  const gridX = header;
  const gridY = titleHeight + header;
  const gridWidth = grid.width * cell;
  const gridHeight = grid.height * cell;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, chartWidth, chartHeight);
  drawTitle(ctx, grid, chartWidth);
  drawHeaderBands(ctx, gridX, gridY, grid, cell, header);
  drawBlankGrid(ctx, gridX, gridY, grid, cell);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(7, Math.floor(cell * 0.42))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const bead = cells[y * grid.width + x];
      if (!bead) continue;
      const px = gridX + x * cell;
      const py = gridY + y * cell;
      ctx.fillStyle = bead.hex;
      ctx.fillRect(px, py, cell, cell);
      ctx.fillStyle = readableTextColor(bead);
      ctx.fillText(bead.code, px + cell / 2, py + cell / 2);
    }
  }
  ctx.restore();

  drawGridLines(ctx, gridX, gridY, gridWidth, gridHeight, grid, cell);
  drawLegend(ctx, palette, counts, header, gridY + gridHeight + header, chartWidth);
}

function drawPindouPreview(cells, grid, maxGrid) {
  const cell = maxGrid >= 100 ? 12 : maxGrid >= 50 ? 16 : 22;
  const gap = maxGrid >= 150 ? 1 : 2;
  const width = grid.width * cell;
  const height = grid.height * cell;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#f8faf7";
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const bead = cells[y * grid.width + x];
      if (!bead) continue;
      const px = x * cell;
      const py = y * cell;
      ctx.fillStyle = bead.hex;
      ctx.fillRect(px + gap / 2, py + gap / 2, cell - gap, cell - gap);
    }
  }

  drawPreviewGrid(ctx, grid, cell, width, height);
  drawPreviewCodes(ctx, cells, grid, cell);
  return canvas.toDataURL("image/png");
}

function drawPreviewCodes(ctx, cells, grid, cell) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(5, Math.floor(cell * 0.36))}px ui-monospace, SFMono-Regular, Menlo, monospace`;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const bead = cells[y * grid.width + x];
      if (!bead) continue;
      ctx.fillStyle = readableTextColor(bead);
      ctx.fillText(bead.code, x * cell + cell / 2, y * cell + cell / 2);
    }
  }

  ctx.restore();
}

function drawPreviewGrid(ctx, grid, cell, width, height) {
  ctx.save();
  for (let x = 0; x <= grid.width; x += 1) {
    const px = x * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    setPreviewGridStroke(ctx, x);
    ctx.stroke();
  }
  for (let y = 0; y <= grid.height; y += 1) {
    const py = y * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    setPreviewGridStroke(ctx, y);
    ctx.stroke();
  }
  ctx.restore();
}

function setPreviewGridStroke(ctx, index) {
  if (index % 10 === 0) {
    ctx.strokeStyle = "rgba(31, 36, 32, 0.42)";
    ctx.lineWidth = 1.2;
  } else if (index % 5 === 0) {
    ctx.strokeStyle = "rgba(31, 36, 32, 0.28)";
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = "rgba(31, 36, 32, 0.12)";
    ctx.lineWidth = 0.8;
  }
}

function drawTitle(ctx, grid, chartWidth) {
  ctx.fillStyle = "#a6a9ac";
  ctx.font = "34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`拼豆图纸 ${grid.width}x${grid.height}`, 20, 28);
  ctx.fillStyle = "#d7dadd";
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("色号图", chartWidth - 20, 31);
}

function drawHeaderBands(ctx, gridX, gridY, grid, cell, header) {
  ctx.fillStyle = "#f4f8fb";
  ctx.fillRect(gridX, gridY - header, grid.width * cell, header);
  ctx.fillRect(gridX, gridY + grid.height * cell, grid.width * cell, header);
  ctx.fillRect(gridX - header, gridY, header, grid.height * cell);
  ctx.fillRect(gridX + grid.width * cell, gridY, header, grid.height * cell);

  ctx.fillStyle = "#1f2420";
  ctx.font = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let x = 0; x < grid.width; x += 1) {
    const label = String(x + 1);
    const cx = gridX + x * cell + cell / 2;
    ctx.fillText(label, cx, gridY - header / 2);
    ctx.fillText(label, cx, gridY + grid.height * cell + header / 2);
  }

  for (let y = 0; y < grid.height; y += 1) {
    const label = String(y + 1);
    const cy = gridY + y * cell + cell / 2;
    ctx.fillText(label, gridX - header / 2, cy);
    ctx.fillText(label, gridX + grid.width * cell + header / 2, cy);
  }
}

function drawBlankGrid(ctx, gridX, gridY, grid, cell) {
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(gridX, gridY, grid.width * cell, grid.height * cell);

  ctx.save();
  ctx.strokeStyle = "#f0f0f0";
  ctx.lineWidth = 1;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const px = gridX + x * cell;
      const py = gridY + y * cell;
      ctx.beginPath();
      ctx.moveTo(px, py + cell);
      ctx.lineTo(px + cell, py);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGridLines(ctx, gridX, gridY, width, height, grid, cell) {
  ctx.save();
  for (let x = 0; x <= grid.width; x += 1) {
    const pos = gridX + x * cell;
    ctx.beginPath();
    ctx.moveTo(pos, gridY);
    ctx.lineTo(pos, gridY + height);
    setGridStroke(ctx, x);
    ctx.stroke();
  }
  for (let y = 0; y <= grid.height; y += 1) {
    const pos = gridY + y * cell;
    ctx.beginPath();
    ctx.moveTo(gridX, pos);
    ctx.lineTo(gridX + width, pos);
    setGridStroke(ctx, y);
    ctx.stroke();
  }
  ctx.restore();
}

function setGridStroke(ctx, index) {
  if (index % 10 === 0) {
    ctx.strokeStyle = "#f0a24f";
    ctx.lineWidth = 1.4;
  } else if (index % 5 === 0) {
    ctx.strokeStyle = "#f5c184";
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = "rgba(80, 88, 92, 0.2)";
    ctx.lineWidth = 0.6;
  }
}

function drawLegend(ctx, palette, counts, x, y, chartWidth) {
  const usedPalette = palette.filter((bead) => counts.has(bead.code));
  const gap = 10;
  const itemWidth = Math.max(118, Math.floor((chartWidth - x * 2 - gap * 4) / 5));
  const itemHeight = 30;

  ctx.textBaseline = "middle";
  ctx.font = "bold 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  usedPalette.forEach((bead, index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const px = x + col * (itemWidth + gap);
    const py = y + row * (itemHeight + 10);
    const count = counts.get(bead.code) || 0;

    ctx.fillStyle = bead.hex;
    roundRect(ctx, px, py, itemWidth, itemHeight, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(31, 36, 32, 0.14)";
    ctx.stroke();
    ctx.fillStyle = readableTextColor(bead);
    ctx.textAlign = "left";
    ctx.fillText(bead.code, px + 10, py + itemHeight / 2);
    ctx.textAlign = "right";
    ctx.fillText(`(${count})`, px + itemWidth - 10, py + itemHeight / 2);
  });

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  ctx.fillStyle = "#1f2420";
  ctx.textAlign = "right";
  ctx.font = "bold 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`总计: ${total} 颗`, chartWidth - x, y + Math.ceil(usedPalette.length / 5) * 40 + 12);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getCornerColor(source, width, height) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  const total = points.reduce(
    (sum, [x, y]) => {
      const index = (y * width + x) * 4;
      sum.r += source.data[index];
      sum.g += source.data[index + 1];
      sum.b += source.data[index + 2];
      return sum;
    },
    { r: 0, g: 0, b: 0 }
  );
  return {
    r: total.r / points.length,
    g: total.g / points.length,
    b: total.b / points.length
  };
}

function isBackgroundCell(color, cornerColor) {
  if (color.a < 20) return true;
  const bright = (color.r + color.g + color.b) / 3;
  const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  return colorDistance(color, cornerColor) < 34 || (bright > 242 && chroma < 18);
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function labDistance(a, b) {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

function hueDistance(a, b) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 1 - distance);
}

function ciede2000(lab1, lab2) {
  const deg360 = 360;
  const deg180 = 180;
  const pow25To7 = 25 ** 7;
  const c1 = Math.sqrt(lab1.a ** 2 + lab1.b ** 2);
  const c2 = Math.sqrt(lab2.a ** 2 + lab2.b ** 2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + pow25To7)));
  const a1Prime = lab1.a * (1 + g);
  const a2Prime = lab2.a * (1 + g);
  const c1Prime = Math.sqrt(a1Prime ** 2 + lab1.b ** 2);
  const c2Prime = Math.sqrt(a2Prime ** 2 + lab2.b ** 2);
  const h1Prime = getLabHue(a1Prime, lab1.b);
  const h2Prime = getLabHue(a2Prime, lab2.b);

  const deltaLPrime = lab2.l - lab1.l;
  const deltaCPrime = c2Prime - c1Prime;
  let deltaHPrime = 0;
  if (c1Prime * c2Prime !== 0) {
    if (Math.abs(h2Prime - h1Prime) <= deg180) {
      deltaHPrime = h2Prime - h1Prime;
    } else if (h2Prime <= h1Prime) {
      deltaHPrime = h2Prime - h1Prime + deg360;
    } else {
      deltaHPrime = h2Prime - h1Prime - deg360;
    }
  }
  const deltaBigHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degreesToRadians(deltaHPrime / 2));

  const lBarPrime = (lab1.l + lab2.l) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  const hBarPrime = averageHue(h1Prime, h2Prime, c1Prime, c2Prime);
  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(hBarPrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * hBarPrime)) +
    0.32 * Math.cos(degreesToRadians(3 * hBarPrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * hBarPrime - 63));
  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cBarPrime ** 7 / (cBarPrime ** 7 + pow25To7));
  const sL = 1 + (0.015 * (lBarPrime - 50) ** 2) / Math.sqrt(20 + (lBarPrime - 50) ** 2);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(degreesToRadians(2 * deltaTheta)) * rC;
  const lTerm = deltaLPrime / sL;
  const cTerm = deltaCPrime / sC;
  const hTerm = deltaBigHPrime / sH;

  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rT * cTerm * hTerm);
}

function getLabHue(a, b) {
  if (a === 0 && b === 0) return 0;
  const angle = radiansToDegrees(Math.atan2(b, a));
  return angle >= 0 ? angle : angle + 360;
}

function averageHue(h1, h2, c1, c2) {
  if (c1 * c2 === 0) return h1 + h2;
  if (Math.abs(h1 - h2) <= 180) return (h1 + h2) / 2;
  if (h1 + h2 < 360) return (h1 + h2 + 360) / 2;
  return (h1 + h2 - 360) / 2;
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function rgbToLab(color) {
  const [x, y, z] = rgbToXyz(color);
  const fx = pivotXyz(x / 95.047);
  const fy = pivotXyz(y / 100);
  const fz = pivotXyz(z / 108.883);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function rgbToXyz(color) {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  return [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100,
    (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100,
    (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100
  ];
}

function pivotXyz(value) {
  return value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized > 0.04045 ? ((normalized + 0.055) / 1.055) ** 2.4 : normalized / 12.92;
}

function linearToSrgb(value) {
  const normalized = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}

function getLuminance(color) {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function readableTextColor(color) {
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
  return luminance > 0.58 ? "#17202a" : "#ffffff";
}

function clampColor(color) {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r))),
    g: Math.max(0, Math.min(255, Math.round(color.g))),
    b: Math.max(0, Math.min(255, Math.round(color.b)))
  };
}

function rgbToHsl(color) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h /= 6;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const gray = l * 255;
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    b: hueToRgb(p, q, h - 1 / 3) * 255
  };
}

window.pindouRenderer = {
  render: renderPindouImage
};
