// 获取URL参数
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// 格式化数字
function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

// 计算互动率
function calcInteractionRate(article) {
  const reads = article.read_num || 0;
  const interactions = (article.like_num || 0) + (article.share_num || 0) +
                       (article.star_num || 0) + (article.comment_count || 0);
  if (reads === 0) return '0%';
  return ((interactions / reads) * 100).toFixed(1) + '%';
}

// 主初始化函数
async function init() {
  const fakeid = getUrlParam('fakeid');

  if (!fakeid) {
    document.querySelector('.container').innerHTML = '<div class="empty">缺少账号参数</div>';
    return;
  }

  // 加载数据
  const data = await chrome.storage.local.get(['articleCache', 'accountConfigs']);
  const cache = data.articleCache?.[fakeid];
  const config = data.accountConfigs?.[fakeid];

  if (!cache || !cache.data || cache.data.length === 0) {
    document.querySelector('.container').innerHTML = '<div class="empty">该账号暂无缓存数据</div>';
    return;
  }

  const articles = cache.data;
  const accountName = config?.name || fakeid.slice(0, 8) + '...';

  // 设置账号名
  document.getElementById('accountName').textContent = accountName;

  // 计算并显示统计数据
  const stats = calculateStats(articles);
  document.getElementById('totalArticles').textContent = stats.totalArticles;
  document.getElementById('totalReads').textContent = formatNumber(stats.totalReads);
  document.getElementById('avgReads').textContent = formatNumber(stats.avgReads);
  document.getElementById('totalInteractions').textContent = formatNumber(stats.totalInteractions);

  // 渲染趋势图
  renderTrendChart(articles);

  // 渲染互动指标对比图
  renderInteractionChart(stats);

  // 渲染热门文章列表
  renderTopArticles(articles);
}

// 计算统计数据
function calculateStats(articles) {
  let totalReads = 0;
  let totalLikes = 0;
  let totalShares = 0;
  let totalStars = 0;
  let totalComments = 0;

  articles.forEach(art => {
    totalReads += art.read_num || 0;
    totalLikes += art.like_num || 0;
    totalShares += art.share_num || 0;
    totalStars += art.star_num || 0;
    totalComments += art.comment_count || 0;
  });

  return {
    totalArticles: articles.length,
    totalReads,
    avgReads: articles.length > 0 ? Math.round(totalReads / articles.length) : 0,
    totalInteractions: totalLikes + totalShares + totalStars + totalComments,
    totalLikes,
    totalShares,
    totalStars,
    totalComments
  };
}

// 渲染趋势图（SVG折线图）
function renderTrendChart(articles) {
  const container = document.getElementById('trendChart');
  if (!container) return;

  // 按日期聚合数据
  const dateMap = {};
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  articles.forEach(art => {
    if (art.create_time * 1000 < thirtyDaysAgo) return;

    const date = new Date(art.create_time * 1000);
    const dateKey = `${date.getMonth() + 1}-${date.getDate()}`;
    if (!dateMap[dateKey]) {
      dateMap[dateKey] = { reads: 0, timestamp: art.create_time };
    }
    dateMap[dateKey].reads += art.read_num || 0;
  });

  // 排序日期
  const sortedDates = Object.keys(dateMap).sort((a, b) => {
    return dateMap[a].timestamp - dateMap[b].timestamp;
  });

  if (sortedDates.length === 0) {
    container.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  const data = sortedDates.map(date => dateMap[date].reads);
  const maxReads = Math.max(...data, 1);

  // SVG尺寸
  const width = container.offsetWidth - 55;
  const height = 190;
  const padding = { top: 10, right: 10, bottom: 30, left: 0 };

  // 计算点坐标
  const points = data.map((val, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * (width - padding.left - padding.right);
    const y = padding.top + (1 - val / maxReads) * (height - padding.top - padding.bottom);
    return { x, y, value: val, date: sortedDates[i] };
  });

  // 生成路径
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
  const areaD = pathD + ` L${points[points.length-1].x},${height - padding.bottom} L${points[0].x},${height - padding.bottom} Z`;

  // Y轴标签
  const yTicks = 5;
  let yLabelsHtml = '';
  for (let i = 0; i < yTicks; i++) {
    const val = Math.round((maxReads / (yTicks - 1)) * i);
    const yPos = padding.top + (1 - i / (yTicks - 1)) * (height - padding.top - padding.bottom);
    yLabelsHtml += `<span class="line-y-label" style="top: ${yPos}px;">${formatNumber(val)}</span>`;
  }

  // X轴标签（间隔显示）
  const xLabelStep = Math.ceil(sortedDates.length / 8);
  let xLabelsHtml = '';
  points.forEach((p, i) => {
    if (i % xLabelStep === 0 || i === points.length - 1) {
      xLabelsHtml += `<span class="line-x-label" style="left: ${p.x + 30}px;">${p.date}</span>`;
    }
  });

  // 构建HTML
  container.innerHTML = `
    ${yLabelsHtml}
    ${xLabelsHtml}
    <svg class="line-chart-svg" viewBox="0 0 ${container.offsetWidth} ${height}">
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#07c160;stop-opacity:0.4" />
          <stop offset="100%" style="stop-color:#07c160;stop-opacity:0" />
        </linearGradient>
      </defs>
      <!-- 网格线 -->
      ${[0, 1, 2, 3, 4].map(i => {
        const y = padding.top + (i / 4) * (height - padding.top - padding.bottom);
        return `<line class="line-grid" x1="${padding.left}" y1="${y}" x2="${width}" y2="${y}"/>`;
      }).join('')}
      <!-- 面积 -->
      <path class="line-area" d="${areaD}"/>
      <!-- 折线 -->
      <path class="line-path" d="${pathD}"/>
      <!-- 数据点 -->
      ${points.map(p => `
        <circle class="line-point" cx="${p.x}" cy="${p.y}" r="4"
          data-date="${p.date}" data-value="${formatNumber(p.value)}"/>
      `).join('')}
    </svg>
    <div class="line-tooltip" id="lineTooltip"></div>
  `;

  // 绑定事件
  container.querySelectorAll('.line-point').forEach(point => {
    point.addEventListener('mouseenter', (e) => {
      const tooltip = container.querySelector('#lineTooltip');
      const date = e.target.dataset.date;
      const value = e.target.dataset.value;
      tooltip.textContent = `${date}: ${value}`;
      tooltip.classList.add('visible');
      const rect = container.getBoundingClientRect();
      tooltip.style.left = (parseFloat(e.target.getAttribute('cx')) + 30) + 'px';
      tooltip.style.top = (parseFloat(e.target.getAttribute('cy')) + 10) + 'px';
    });
    point.addEventListener('mouseleave', () => {
      const tooltip = container.querySelector('#lineTooltip');
      tooltip.classList.remove('visible');
    });
  });
}

// 渲染互动指标对比图（原生实现）
function renderInteractionChart(stats) {
  const container = document.getElementById('interactionChart');
  if (!container) return;

  const labels = ['点赞', '分享', '收藏', '评论'];
  const data = [stats.totalLikes, stats.totalShares, stats.totalStars, stats.totalComments];
  const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3'];
  const maxValue = Math.max(...data, 1);

  let html = '';
  labels.forEach((label, i) => {
    const value = data[i];
    const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
    html += `
      <div class="chart-bar">
        <div class="chart-bar-inner" style="height: ${height}%; background: ${colors[i]};" data-value="${formatNumber(value)}"></div>
        <div class="chart-label">${label}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 渲染热门文章列表
function renderTopArticles(articles) {
  // 过滤有阅读量数据的文章并排序
  const sortedArticles = articles
    .filter(art => art.read_num !== undefined && art.read_num > 0)
    .sort((a, b) => (b.read_num || 0) - (a.read_num || 0))
    .slice(0, 10);

  const tbody = document.getElementById('topArticlesBody');

  if (sortedArticles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = sortedArticles.map((art, index) => {
    const rank = index + 1;
    let rankClass = 'rank-other';
    if (rank === 1) rankClass = 'rank-1';
    else if (rank === 2) rankClass = 'rank-2';
    else if (rank === 3) rankClass = 'rank-3';

    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td class="article-title">
          <a href="${art.link}" target="_blank" title="${art.title}">${art.title}</a>
        </td>
        <td>${formatDate(art.create_time)}</td>
        <td>${formatNumber(art.read_num || 0)}</td>
        <td>${formatNumber(art.like_num || 0)}</td>
        <td>${calcInteractionRate(art)}</td>
      </tr>
    `;
  }).join('');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 关闭按钮事件
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chrome.tabs.getCurrent((tab) => {
        if (tab) {
          chrome.tabs.remove(tab.id);
        }
      });
    });
  }
});
