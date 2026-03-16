
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Props {
  data: { x: number; y: number; label: number }[];
  state: 'Mastery' | 'Struggling' | 'Neutral';
}

const QuantumVisualizer: React.FC<Props> = ({ data, state }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 300;
    const height = 300;
    const margin = 20;

    const xScale = d3.scaleLinear().domain([-1, 1]).range([margin, width - margin]);
    const yScale = d3.scaleLinear().domain([-1, 1]).range([height - margin, margin]);

    // Draw kernel "field"
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Draw grid background
    svg.append('g')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-opacity', 0.5)
      .selectAll('line')
      .data(d3.range(-1, 1.1, 0.5))
      .enter()
      .append('line')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', margin)
      .attr('y2', height - margin);

    // Draw decision boundary simulation (nonlinear)
    const curve = d3.line<[number, number]>()
      .curve(d3.curveBasis);
    
    const boundaryData: [number, number][] = [
      [xScale(-1), yScale(0)],
      [xScale(-0.5), yScale(0.2)],
      [xScale(0), yScale(-0.3)],
      [xScale(0.5), yScale(0.1)],
      [xScale(1), yScale(-0.5)],
    ];

    svg.append('path')
      .attr('d', curve(boundaryData))
      .attr('fill', 'none')
      .attr('stroke', '#8b5cf6')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('filter', 'url(#glow)');

    // Draw points
    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5)
      .attr('fill', d => d.label === 1 ? '#10b981' : '#ef4444')
      .attr('opacity', 0.7);

    // Dynamic focus based on state
    if (state !== 'Neutral') {
      svg.append('circle')
        .attr('cx', xScale(0))
        .attr('cy', yScale(0))
        .attr('r', 0)
        .attr('fill', 'none')
        .attr('stroke', state === 'Mastery' ? '#10b981' : '#ef4444')
        .attr('stroke-width', 2)
        .transition()
        .duration(1000)
        .attr('r', 50)
        .attr('opacity', 0);
    }

  }, [data, state]);

  return (
    <div className="bg-white p-4 rounded-xl shadow-inner flex flex-col items-center">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">QSVM Kernel Mapping</h4>
      <svg ref={svgRef} width="300" height="300" className="rounded-lg"></svg>
      <div className="mt-2 flex gap-4 text-[10px] font-medium uppercase">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Mastery</div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Struggling</div>
      </div>
    </div>
  );
};

export default QuantumVisualizer;
