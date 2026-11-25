import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { RISK } from '../utils/constants';

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend);

ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
ChartJS.defaults.font.size = 10;

const grid = { color: 'rgba(148, 163, 184, 0.08)', drawBorder: false };
const ticks = { color: '#7c8ba1', maxRotation: 0, autoSkip: true };

export const tooltipStyle = {
  backgroundColor: 'rgba(7, 17, 32, 0.96)',
  borderColor: 'rgba(34, 211, 238, 0.25)',
  borderWidth: 1,
  titleColor: '#e2e8f0',
  bodyColor: '#a5f3fc',
  padding: 10,
  cornerRadius: 10,
  displayColors: true,
  boxPadding: 4,
};

const legendStyle = {
  position: 'bottom',
  labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', color: '#94a3b8', padding: 14 },
};

export function BarChart({ labels, series, height = 240, stacked = false, legend = false, horizontal = false }) {
  const datasets = series.map((item, index) => ({
    label: item.label,
    data: item.data,
    backgroundColor: item.color || ['rgba(34,211,238,0.75)', 'rgba(52,211,153,0.7)', 'rgba(251,146,60,0.7)'][index % 3],
    borderRadius: 6,
    borderSkipped: false,
    maxBarThickness: 28,
    stack: stacked ? 'stack' : undefined,
  }));
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: legend ? legendStyle : { display: false }, tooltip: tooltipStyle },
    scales: {
      x: { stacked, grid: horizontal ? grid : { display: false }, ticks, border: { display: false } },
      y: { stacked, beginAtZero: true, grid, ticks: { ...ticks, precision: 0 }, border: { display: false } },
    },
  };
  return (
    <div style={{ height }}>
      <Bar data={{ labels, datasets }} options={options} />
    </div>
  );
}

export function LineChart({ labels, series, height = 240, legend = true, fill = true }) {
  const datasets = series.map((item, index) => {
    const color = item.color || ['#22d3ee', '#f59e0b', '#f87171'][index % 3];
    return {
      label: item.label,
      data: item.data,
      borderColor: color,
      backgroundColor: fill ? `${color}22` : color,
      pointBackgroundColor: color,
      pointRadius: 2.5,
      pointHoverRadius: 4,
      borderWidth: 2,
      tension: 0.35,
      fill,
    };
  });
  return (
    <div style={{ height }}>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: legend ? legendStyle : { display: false }, tooltip: tooltipStyle },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { grid: { display: false }, ticks, border: { display: false } },
            y: { beginAtZero: true, grid, ticks: { ...ticks, precision: 0 }, border: { display: false } },
          },
        }}
      />
    </div>
  );
}

export function DoughnutChart({ labels, values, colors, height = 220, legend = true, centerLabel, centerValue }) {
  return (
    <div className="relative" style={{ height }}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderColor: 'rgba(4, 9, 18, 0.9)',
              borderWidth: 3,
              hoverOffset: 4,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: legend ? legendStyle : { display: false }, tooltip: tooltipStyle },
        }}
      />
      {(centerValue !== undefined || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
          {centerValue !== undefined && <span className="font-mono text-2xl font-semibold text-white">{centerValue}</span>}
          {centerLabel && <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function RiskDistributionChart({ distribution = {}, height = 210, showLegend = true }) {
  const keys = ['low', 'medium', 'high', 'critical'];
  const unassessed = Number(distribution.unassessed || 0);
  const labels = keys.map((key) => RISK[key].label.replace(' risk', ''));
  const values = keys.map((key) => Number(distribution[key] || 0));
  const colors = keys.map((key) => RISK[key].chart);
  if (unassessed > 0) {
    labels.push('Not assessed');
    values.push(unassessed);
    colors.push(RISK.unassessed.chart);
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <DoughnutChart
      labels={labels}
      values={values}
      colors={colors}
      height={height}
      legend={showLegend}
      centerValue={total}
      centerLabel="documents"
    />
  );
}

export function Sparkline({ values = [], color = '#22d3ee', height = 48 }) {
  return (
    <div style={{ height }}>
      <Line
        data={{
          labels: values.map((_, index) => index + 1),
          datasets: [
            {
              data: values,
              borderColor: color,
              backgroundColor: `${color}22`,
              borderWidth: 1.8,
              pointRadius: 0,
              tension: 0.4,
              fill: true,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
          animation: false,
        }}
      />
    </div>
  );
}
