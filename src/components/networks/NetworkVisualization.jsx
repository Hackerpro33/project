import React, { useEffect, useRef } from 'react';
import { Card } from "@/components/ui/card";

export default function NetworkVisualization({ config }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!svgRef.current || !config.selectedColumns.length) return;

    const svg = svgRef.current;
    const width = svg.clientWidth || 400;
    const height = svg.clientHeight || 400;

    // Очистим предыдущий контент
    svg.innerHTML = '';

    // Создаем узлы для каждого выбранного столбца
    const nodes = config.selectedColumns.map((column, index) => ({
      id: column,
      x: width / 2 + Math.cos((index / config.selectedColumns.length) * 2 * Math.PI) * 100,
      y: height / 2 + Math.sin((index / config.selectedColumns.length) * 2 * Math.PI) * 100,
      radius: config.nodeSize === 'small' ? 15 : config.nodeSize === 'medium' ? 25 : 35
    }));

    // Создаем связи между узлами (имитация корреляций)
    const links = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const correlation = Math.random() * 2 - 1; // Случайная корреляция от -1 до 1
        if (Math.abs(correlation) > 0.3) { // Показываем только значимые связи
          links.push({
            source: nodes[i],
            target: nodes[j],
            strength: Math.abs(correlation),
            type: correlation > 0 ? 'positive' : 'negative'
          });
        }
      }
    }

    // Рисуем связи
    links.forEach(link => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', link.source.x);
      line.setAttribute('y1', link.source.y);
      line.setAttribute('x2', link.target.x);
      line.setAttribute('y2', link.target.y);
      line.setAttribute('stroke', link.type === 'positive' ? '#10B981' : '#EF4444');
      line.setAttribute('stroke-width', link.strength * 3);
      line.setAttribute('opacity', '0.7');
      svg.appendChild(line);
    });

    // Рисуем узлы
    nodes.forEach(node => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', node.radius);
      circle.setAttribute('fill', 'url(#nodeGradient)');
      circle.setAttribute('stroke', '#1E293B');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);

      if (config.showLabels) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#1E293B');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', 'bold');
        text.textContent = node.id;
        svg.appendChild(text);
      }
    });

    // Добавляем градиент для узлов
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'nodeGradient');
    
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#06B6D4');
    
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#3B82F6');
    
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);

  }, [config]);

  return (
    <div className="w-full h-96 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 overflow-hidden">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 400 400"
        className="w-full h-full"
      />
      <div className="absolute bottom-4 left-4 text-xs text-slate-500 elegant-text">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500"></div>
            <span>Положительная связь</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500"></div>
            <span>Отрицательная связь</span>
          </div>
        </div>
      </div>
    </div>
  );
}