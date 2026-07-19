import { formatMoney } from "./utils.js";

const palette = ["#2f7d68", "#6f66c7", "#cc7549", "#3f7ea8", "#b0596b", "#888f3e", "#8d6b4f", "#536878"];

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function chartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--text-muted").trim() || "#6b7280",
    grid: styles.getPropertyValue("--border").trim() || "#dde1e6",
    primary: styles.getPropertyValue("--primary").trim() || "#2f7d68",
    expense: styles.getPropertyValue("--expense").trim() || "#c75050",
    income: styles.getPropertyValue("--income").trim() || "#23815f",
  };
}

export function drawMonthlyTrend(canvas, rows, settings) {
  if (!canvas) return;
  const { context: ctx, width, height } = setupCanvas(canvas);
  const colors = chartColors();
  ctx.clearRect(0, 0, width, height);
  const padding = { top: 18, right: 12, bottom: 34, left: 12 };
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...rows.flatMap((row) => [row.income, row.expense + row.investment]));
  const groupWidth = (width - padding.left - padding.right) / Math.max(rows.length, 1);
  const barWidth = Math.min(18, Math.max(6, groupWidth * 0.24));
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((ratio) => {
    const y = padding.top + plotHeight * ratio;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
  });
  rows.forEach((row, index) => {
    const center = padding.left + groupWidth * index + groupWidth / 2;
    const incomeHeight = (row.income / max) * plotHeight;
    const outHeight = ((row.expense + row.investment) / max) * plotHeight;
    ctx.fillStyle = colors.income;
    ctx.fillRect(center - barWidth - 2, padding.top + plotHeight - incomeHeight, barWidth, incomeHeight);
    ctx.fillStyle = colors.expense;
    ctx.fillRect(center + 2, padding.top + plotHeight - outHeight, barWidth, outHeight);
    ctx.fillStyle = colors.text;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(row.label, center, height - 10);
  });
  canvas.setAttribute("aria-label", `Grafico entrate e uscite. Valore massimo ${formatMoney(max, settings.currency, settings.language)}.`);
}

export function drawNetWorth(canvas, rows, settings) {
  if (!canvas) return;
  const { context: ctx, width, height } = setupCanvas(canvas);
  const colors = chartColors();
  ctx.clearRect(0, 0, width, height);
  const padding = { top: 20, right: 16, bottom: 34, left: 16 };
  if (rows.length < 2) {
    ctx.fillStyle = colors.text; ctx.font = "14px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Aggiungi almeno due snapshot per vedere l’andamento", width / 2, height / 2);
    return;
  }
  const values = rows.map((row) => row.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const x = (index) => padding.left + index * ((width - padding.left - padding.right) / (rows.length - 1));
  const y = (value) => padding.top + (max - value) / range * (height - padding.top - padding.bottom);
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((ratio) => {
    const lineY = padding.top + ratio * (height - padding.top - padding.bottom);
    ctx.beginPath(); ctx.moveTo(padding.left, lineY); ctx.lineTo(width - padding.right, lineY); ctx.stroke();
  });
  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, `${colors.primary}55`); gradient.addColorStop(1, `${colors.primary}05`);
  ctx.beginPath();
  rows.forEach((row, index) => index ? ctx.lineTo(x(index), y(row.value)) : ctx.moveTo(x(index), y(row.value)));
  ctx.lineTo(x(rows.length - 1), height - padding.bottom); ctx.lineTo(x(0), height - padding.bottom); ctx.closePath();
  ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath();
  rows.forEach((row, index) => index ? ctx.lineTo(x(index), y(row.value)) : ctx.moveTo(x(index), y(row.value)));
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();
  rows.forEach((row, index) => {
    ctx.fillStyle = colors.primary; ctx.beginPath(); ctx.arc(x(index), y(row.value), 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.text; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(row.label, x(index), height - 10);
  });
  canvas.setAttribute("aria-label", `Andamento patrimonio da ${formatMoney(values[0], settings.currency, settings.language)} a ${formatMoney(values.at(-1), settings.currency, settings.language)}.`);
}

export function renderCategoryDistribution(container, rows, settings) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p"); empty.className = "empty compact"; empty.textContent = "Nessuna spesa nel mese selezionato."; container.append(empty); return;
  }
  const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
  rows.slice(0, 7).forEach((item, index) => {
    const row = document.createElement("div"); row.className = "distribution-row";
    const header = document.createElement("div"); header.className = "distribution-label";
    const name = document.createElement("span"); name.textContent = `${item.icon || "•"} ${item.label}`;
    const amount = document.createElement("strong"); amount.textContent = formatMoney(item.value, settings.currency, settings.language);
    header.append(name, amount);
    const track = document.createElement("div"); track.className = "mini-progress";
    const fill = document.createElement("span"); fill.style.width = `${Math.max(2, item.value / total * 100)}%`; fill.style.backgroundColor = item.color || palette[index % palette.length];
    track.append(fill); row.append(header, track); container.append(row);
  });
}
