import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function main() {
  console.log('Rendering application icons with sharp...');
  const iconSvg = fs.readFileSync('public/icon.svg');
  const foregroundSvg = fs.readFileSync('public/icon-foreground.svg');

  // Web icons
  await sharp(iconSvg).resize(192, 192).png().toFile('public/icon-192.png');
  await sharp(iconSvg).resize(512, 512).png().toFile('public/icon-512.png');
  console.log('Created public/icon-192.png and public/icon-512.png');

  // Android mipmap densities
  const densities = [
    { name: 'mdpi', launcher: 48, foreground: 108 },
    { name: 'hdpi', launcher: 72, foreground: 162 },
    { name: 'xhdpi', launcher: 96, foreground: 216 },
    { name: 'xxhdpi', launcher: 144, foreground: 324 },
    { name: 'xxxhdpi', launcher: 192, foreground: 432 }
  ];

  for (const d of densities) {
    const dir = path.join('android/app/src/main/res', `mipmap-${d.name}`);
    fs.mkdirSync(dir, { recursive: true });

    // Square launcher icon
    await sharp(iconSvg).resize(d.launcher, d.launcher).png().toFile(path.join(dir, 'ic_launcher.png'));

    // Round launcher icon
    // Create circular mask
    const circleBuffer = Buffer.from(
      `<svg width="${d.launcher}" height="${d.launcher}"><circle cx="${d.launcher / 2}" cy="${d.launcher / 2}" r="${d.launcher / 2}" fill="#fff" /></svg>`
    );
    await sharp(iconSvg)
      .resize(d.launcher, d.launcher)
      .composite([{ input: circleBuffer, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // Foreground icon for adaptive icons
    await sharp(foregroundSvg).resize(d.foreground, d.foreground).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    console.log(`Rendered Android mipmap-${d.name}: launcher=${d.launcher}x${d.launcher}, fg=${d.foreground}x${d.foreground}`);
  }

  console.log('All icons successfully rendered and saved!');
}

main().catch((err) => {
  console.error('Failed to render icons:', err);
  process.exit(1);
});
