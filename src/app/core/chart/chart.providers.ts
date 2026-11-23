import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { provideCharts } from 'ng2-charts';

/** Modules Chart.js réellement utilisés par les trois écrans statistiques. */
export const CHARTS_PROVIDER = provideCharts({
  registerables: [
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Filler,
    Legend,
    LineController,
    LineElement,
    LinearScale,
    PointElement,
    Tooltip
  ]
});
