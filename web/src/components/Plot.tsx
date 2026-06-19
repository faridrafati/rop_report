/**
 * Plotly React component bound to the prebuilt `plotly.js-dist-min` bundle (via
 * the react-plotly.js factory) so Vite doesn't have to build Plotly from source.
 * Used for the engineering cross-plots (WOB/RPM-vs-ROP, MSE overlay, hydraulics).
 */
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';

export const Plot = createPlotlyComponent(Plotly);
