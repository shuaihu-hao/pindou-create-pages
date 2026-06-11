const imageInput = document.querySelector("#imageInput");
const dropzone = document.querySelector("#dropzone");
const generateBtn = document.querySelector("#generateBtn");
const resetBtn = document.querySelector("#resetBtn");
const statusEl = document.querySelector("#status");
const sourceStage = document.querySelector("#sourceStage");
const resultStage = document.querySelector("#resultStage");
const sourceMeta = document.querySelector("#sourceMeta");
const downloadLink = document.querySelector("#downloadLink");
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
  setStatus("正在判断拼豆图纸网格...");
  resultStage.innerHTML = "";
  downloadLink.classList.add("hidden");

  try {
    const base64 = selectedDataUrl.split(",")[1];
    const imageStats = await analyzeImageComplexity(selectedDataUrl);
    const payload = await getGridDecision({
      image: base64,
      mimeType: selectedFile.type,
      fileName: selectedFile.name,
      imageStats
    });

    setStatus(`${payload.source === "local" ? "已使用本地规则" : "LongCat 已返回规则"}，正在生成拼豆图纸...`);
    const resultSrc = await renderPindouImage(selectedDataUrl, payload.style);

    resultStage.innerHTML = `<img src="${resultSrc}" alt="生成的拼豆风格图片" />`;
    downloadLink.href = resultSrc;
    downloadLink.classList.remove("hidden");
    setStatus("生成完成，可以下载啦。");
  } catch (error) {
    resultStage.innerHTML = "<span>生成失败</span>";
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
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
    console.warn("LongCat backend unavailable, using local grid decision.", error);
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
  const maxGrid = [25, 50, 100].includes(Number(style.gridSize)) ? Number(style.gridSize) : 50;
  const grid = getGridSize(image, maxGrid);
  const cell = maxGrid === 25 ? 28 : maxGrid === 50 ? 18 : 13;
  const header = 26;
  const titleHeight = 52;

  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCanvas.width = grid.width;
  sampleCanvas.height = grid.height;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(image, 0, 0, grid.width, grid.height);

  const source = sampleCtx.getImageData(0, 0, grid.width, grid.height);
  const cornerColor = getCornerColor(source, grid.width, grid.height);
  const palette = buildMardPalette();
  const outlineBead = getOutlineBead(palette);
  const legendHeight = 210;
  const chartWidth = header * 2 + grid.width * cell;
  const chartHeight = titleHeight + header * 2 + grid.height * cell + legendHeight;
  const cells = [];
  const counts = new Map();

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = (y * grid.width + x) * 4;
      const color = {
        r: source.data[index],
        g: source.data[index + 1],
        b: source.data[index + 2],
        a: source.data[index + 3]
      };
      const blank = isBackgroundCell(color, cornerColor);
      const bead = blank
        ? null
        : chooseBeadForCell(color, palette, outlineBead, source, grid, x, y, cornerColor);
      cells.push(bead);
      if (bead) counts.set(bead.code, (counts.get(bead.code) || 0) + 1);
    }
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = chartWidth;
  canvas.height = chartHeight;

  drawPatternSheet(ctx, {
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

  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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
  const hsl = rgbToHsl(color);
  for (const candidate of palette) {
    const candidateHsl = candidate.hsl;
    const huePenalty = hsl.s > 0.18 && candidateHsl.s > 0.18 ? hueDistance(hsl.h, candidateHsl.h) * 18 : 0;
    const saturationPenalty = Math.abs(hsl.s - candidateHsl.s) * 8;
    const distance = labDistance(lab, candidate.lab) + huePenalty + saturationPenalty;
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

function getGridSize(image, maxGrid) {
  const longSide = [25, 50, 100].includes(Number(maxGrid)) ? Number(maxGrid) : 50;
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

function chooseBeadForCell(color, palette, outlineBead, source, grid, x, y, cornerColor) {
  if (
    outlineBead &&
    (isLikelyOutline(color, source, grid, x, y, cornerColor) ||
      isBoundaryAntialias(color, source, grid, x, y, cornerColor))
  ) {
    return outlineBead;
  }
  return nearestPaletteColor(color, palette);
}

function isLikelyOutline(color, source, grid, x, y, cornerColor) {
  const luminance = getLuminance(color);
  const hsl = rgbToHsl(color);
  const isNeutralDark = hsl.s < 0.22 && luminance < 78;
  if (isNeutralDark) return true;
  if (hsl.s > 0.28 && luminance > 52) return false;
  if (luminance > 145) return false;

  let maxContrast = 0;
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1]
  ];

  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
    const neighbor = getPixel(source, grid.width, nx, ny);
    if (isBackgroundCell(neighbor, cornerColor)) {
      maxContrast = Math.max(maxContrast, 80);
    } else {
      maxContrast = Math.max(maxContrast, Math.abs(luminance - getLuminance(neighbor)));
    }
  }

  return maxContrast > 58 && luminance < 105 && hsl.s < 0.38;
}

function isBoundaryAntialias(color, source, grid, x, y, cornerColor) {
  const hsl = rgbToHsl(color);
  const luminance = getLuminance(color);
  let backgroundNeighbors = 0;
  let subjectNeighbors = 0;

  for (let ny = y - 1; ny <= y + 1; ny += 1) {
    for (let nx = x - 1; nx <= x + 1; nx += 1) {
      if (nx === x && ny === y) continue;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) {
        backgroundNeighbors += 1;
        continue;
      }

      const neighbor = getPixel(source, grid.width, nx, ny);
      if (isBackgroundCell(neighbor, cornerColor)) {
        backgroundNeighbors += 1;
      } else {
        subjectNeighbors += 1;
      }
    }
  }

  if (backgroundNeighbors === 0 || subjectNeighbors === 0) return false;

  const nearBackground = colorDistance(color, cornerColor) < 92;
  const mutedEdge = hsl.s < 0.42 && luminance < 205;
  const darkEdge = luminance < 135;
  return nearBackground || mutedEdge || darkEdge;
}

function getOutlineBead(palette) {
  return palette.reduce((darkest, color) => (getLuminance(color) < getLuminance(darkest) ? color : darkest), palette[0]);
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

function drawTitle(ctx, grid, chartWidth) {
  ctx.fillStyle = "#a6a9ac";
  ctx.font = "34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Pindou Pattern (${grid.width}x${grid.height})`, 20, 28);
  ctx.fillStyle = "#d7dadd";
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("LongCat assisted", chartWidth - 20, 31);
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
  const convert = (value) => {
    const normalized = value / 255;
    return normalized > 0.04045
      ? ((normalized + 0.055) / 1.055) ** 2.4
      : normalized / 12.92;
  };
  const r = convert(color.r);
  const g = convert(color.g);
  const b = convert(color.b);
  return [
    (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100,
    (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100,
    (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100
  ];
}

function pivotXyz(value) {
  return value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
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
