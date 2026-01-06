// HTML美化工具 - 微信文章排版风格
function beautifyHTML(html) {
  const styles = {
    section: 'text-align: left; line-height: 1.75; font-family: -apple-system-font, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif; font-size: 16.8px',
    p: 'text-align: left; line-height: 1.75; font-family: -apple-system-font, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif; font-size: 16.8px; margin: 1.5em 0; color: #3f3f3f;',
    spacer: 'font-size: 0px; line-height: 0; margin: 0px;'
  };

  // 移除首尾空白段落和所有现有样式
  let clean = html.replace(/<p[^>]*>\s*<\/p>/g, '').replace(/<p[^>]*>/g, '<p>').replace(/<section[^>]*>/g, '<section>');

  // 应用新样式
  clean = clean.replace(/<section>/g, `<section style="${styles.section}">`);
  clean = clean.replace(/<p>/g, `<p style="${styles.p}">`);

  // 添加首尾空白段落
  const spacer = `<p style="${styles.spacer}"> </p>`;
  return spacer + clean + spacer;
}
