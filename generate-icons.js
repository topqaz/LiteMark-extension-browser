// 使用 Node.js 和 canvas 生成图标
// 需要先安装: npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const scale = size / 128;
  
  // 创建渐变
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  
  // 绘制背景圆形
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  // 绘制书签形状
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(32 * scale, 20 * scale);
  ctx.lineTo(32 * scale, 100 * scale);
  ctx.lineTo(64 * scale, 80 * scale);
  ctx.lineTo(96 * scale, 100 * scale);
  ctx.lineTo(96 * scale, 20 * scale);
  ctx.closePath();
  ctx.fill();
  
  // 绘制装饰线
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64 * scale, 20 * scale);
  ctx.lineTo(64 * scale, 80 * scale);
  ctx.stroke();
  
  // 绘制小装饰点
  ctx.fillStyle = '#764ba2';
  ctx.beginPath();
  ctx.arc(48 * scale, 40 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(80 * scale, 50 * scale, 2.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  
  return canvas;
}

function generateIcons() {
  const iconsDir = path.join(__dirname, 'icons');
  
  // 确保 icons 目录存在
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  const sizes = [16, 48, 128];
  
  sizes.forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    const filePath = path.join(iconsDir, `icon${size}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`✅ 已生成 icon${size}.png`);
  });
  
  console.log('\n🎉 所有图标已生成完成！');
}

// 运行
if (require.main === module) {
  try {
    generateIcons();
  } catch (error) {
    console.error('❌ 生成图标失败:', error.message);
    console.error('\n提示: 需要先安装 canvas 包:');
    console.error('  npm install canvas');
    process.exit(1);
  }
}

module.exports = { generateIcons, drawIcon };

