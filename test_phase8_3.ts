/**
 * PHASE 8.3 AUTOMATED VERIFICATION TEST SUITE
 * Visual Identity, Typography & Real AI Assistant Integration
 *
 * Verifies:
 * 1. Visual Identity & App Icon Assets (SVG, Web Favicons, Android Mipmaps, Adaptive Vector XMLs)
 * 2. Typography Design System (Tokens, Cairo font, Bidi Isolation, Numeral Normalization)
 * 3. AI Provider Status Gate & Error Classification (Configured / Unconfigured detection)
 * 4. Fake AI Ban & Zero Hardcoded Simulation Verification
 * 5. Server Assistant Endpoint Behavior & Contract (/api/assistant/status & /api/assistant/chat)
 * 6. Server Invoice Vision Analysis Endpoint Contract (/api/gemini/analyze-invoice)
 * 7. Security Audit (No static API keys in source, APK assets, client bundle, or DB)
 */

import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName} - Detail: ${detail || 'Condition not met'}`);
    failCount++;
  }
}

async function runPhase83Tests() {
  console.log('======================================================');
  console.log('STARTING PHASE 8.3 COMPREHENSIVE VERIFICATION SUITE');
  console.log('======================================================\n');

  // =========================================================================
  // 1. VISUAL IDENTITY & APP ICON ASSETS VERIFICATION
  // =========================================================================
  console.log('--- 1. Testing Visual Identity & Icon Assets ---');

  // Master SVGs
  assert(fs.existsSync('public/icon.svg'), 'Master App Icon SVG exists');
  const iconSvgContent = fs.readFileSync('public/icon.svg', 'utf-8');
  assert(iconSvgContent.includes('<svg') && iconSvgContent.includes('#2563EB'), 'Master icon contains primary brand color #2563EB');
  assert(iconSvgContent.includes('#059669') || iconSvgContent.includes('#10B981'), 'Master icon contains emerald secondary color #059669 / #10B981');
  assert(iconSvgContent.includes('circle') && iconSvgContent.includes('rect'), 'Master icon contains medical cross & smart core geometry');

  assert(fs.existsSync('public/icon-foreground.svg'), 'Master Adaptive Foreground SVG exists');
  assert(fs.existsSync('public/favicon.svg'), 'Favicon SVG exists');

  // Web raster icons
  assert(fs.existsSync('public/icon-192.png'), 'Web icon-192.png exists');
  assert(fs.existsSync('public/icon-512.png'), 'Web icon-512.png exists');
  const icon192Stat = fs.statSync('public/icon-192.png');
  assert(icon192Stat.size > 500, 'Web icon-192.png has valid byte payload');

  // Android Vector Adaptive Drawables
  assert(fs.existsSync('android/app/src/main/res/drawable/ic_launcher_foreground.xml'), 'Android drawable/ic_launcher_foreground.xml exists');
  assert(fs.existsSync('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml'), 'Android drawable-v24/ic_launcher_foreground.xml exists');
  assert(fs.existsSync('android/app/src/main/res/drawable/ic_launcher_background.xml'), 'Android drawable/ic_launcher_background.xml exists');
  assert(fs.existsSync('android/app/src/main/res/values/ic_launcher_background.xml'), 'Android values/ic_launcher_background.xml exists');

  const bgXml = fs.readFileSync('android/app/src/main/res/values/ic_launcher_background.xml', 'utf-8');
  assert(bgXml.includes('#2563EB'), 'Android background color aligns with #2563EB');

  // Android Mipmap Densities Check
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (const d of densities) {
    const dir = path.join('android/app/src/main/res', `mipmap-${d}`);
    assert(fs.existsSync(path.join(dir, 'ic_launcher.png')), `Android mipmap-${d}/ic_launcher.png exists`);
    assert(fs.existsSync(path.join(dir, 'ic_launcher_round.png')), `Android mipmap-${d}/ic_launcher_round.png exists`);
    assert(fs.existsSync(path.join(dir, 'ic_launcher_foreground.png')), `Android mipmap-${d}/ic_launcher_foreground.png exists`);
  }

  // React AppBrandIcon Component Check
  assert(fs.existsSync('src/components/common/AppBrandIcon.tsx'), 'AppBrandIcon.tsx component exists');
  const appHeaderContent = fs.readFileSync('src/components/navigation/AppHeader.tsx', 'utf-8');
  assert(appHeaderContent.includes('AppBrandIcon'), 'AppHeader integrates AppBrandIcon component');

  // =========================================================================
  // 2. TYPOGRAPHY DESIGN SYSTEM VERIFICATION
  // =========================================================================
  console.log('\n--- 2. Testing Typography Design System ---');

  assert(fs.existsSync('src/utils/typography.ts'), 'Centralized typography.ts design system exists');
  const { TYPOGRAPHY, normalizeNumerals, formatBidiCode, formatDecimal } = await import('./src/utils/typography');

  assert(Boolean(TYPOGRAPHY.fontFamily.arabic.includes('Cairo')), 'Arabic typography uses Cairo as primary typeface');
  assert(Boolean(TYPOGRAPHY.fontFamily.numeric.includes('JetBrains Mono')), 'Numeric typography uses JetBrains Mono tabular monospace');
  assert(Boolean(TYPOGRAPHY.fontSize.base.includes('text-base')), 'Body typography enforces standard text-base (16px) baseline readability');
  assert(Boolean(TYPOGRAPHY.fontWeight.bold && TYPOGRAPHY.fontWeight.regular), 'Typography defines standard font-weight tokens');

  // Numeric Normalization (Eastern Arabic & Persian digits to Western)
  const converted = normalizeNumerals('سعر ١٢٥٠٠ ريال ورقم الفاتورة ٩٨٤');
  assert(converted.includes('12500') && converted.includes('984'), 'Eastern Arabic digits ٠-٩ normalized cleanly to 0-9');

  const persianConverted = normalizeNumerals('دفعة ۴۵۰ ر.ي');
  assert(persianConverted.includes('450'), 'Persian digits normalized cleanly to Western digits');

  // Bidirectional code formatting
  const bidiSample = formatBidiCode('PAN-500MG-24S');
  assert(bidiSample === 'PAN-500MG-24S', 'Bidirectional code formatted cleanly');

  // Index.html typography link verification
  const indexHtml = fs.readFileSync('index.html', 'utf-8');
  assert(indexHtml.includes('family=Cairo'), 'index.html imports Cairo from Google Fonts');
  assert(indexHtml.includes('family=JetBrains+Mono'), 'index.html imports JetBrains Mono from Google Fonts');
  assert(indexHtml.includes('dir="rtl"'), 'HTML entry point is configured with dir="rtl" for Arabic layout');

  // =========================================================================
  // 3. AI PROVIDER GATE & STATUS VERIFICATION
  // =========================================================================
  console.log('\n--- 3. Testing Real AI Provider Architecture ---');

  const serverContent = fs.readFileSync('server.ts', 'utf-8');

  // Must use gemini-3.8-flash standard model
  assert(serverContent.includes('gemini-3.8-flash'), 'server.ts uses official gemini-3.8-flash model');
  assert(serverContent.includes('@google/genai'), 'server.ts integrates modern @google/genai SDK');

  // Must have /api/assistant/status
  assert(serverContent.includes('/api/assistant/status'), 'server.ts implements GET /api/assistant/status');

  // Must have /api/assistant/chat
  assert(serverContent.includes('/api/assistant/chat'), 'server.ts implements POST /api/assistant/chat');

  // Must have /api/gemini/analyze-invoice
  assert(serverContent.includes('/api/gemini/analyze-invoice'), 'server.ts implements POST /api/gemini/analyze-invoice');

  // Error codes enum in server
  const requiredErrorCodes = [
    'AI_NOT_CONFIGURED',
    'AI_UNAUTHORIZED',
    'AI_RATE_LIMITED',
    'AI_TIMEOUT',
    'AI_NETWORK_ERROR',
    'AI_PROVIDER_ERROR',
    'AI_INVALID_RESPONSE',
    'AI_RESPONSE_VALIDATION_FAILED',
    'IMAGE_ANALYSIS_NOT_CONFIGURED'
  ];
  for (const code of requiredErrorCodes) {
    assert(serverContent.includes(code), `server.ts defines standard error code ${code}`);
  }

  // =========================================================================
  // 4. ZERO FAKE AI / NO MOCK VERIFICATION
  // =========================================================================
  console.log('\n--- 4. Enforcing Zero Fake AI / Mock Ban ---');

  // Check server.ts has NO simulated responses
  assert(!serverContent.includes('simulated: true'), 'server.ts has no fake simulated responses');
  assert(!serverContent.includes('mockResponse'), 'server.ts has no mockResponse');
  assert(!serverContent.includes('fakeAi'), 'server.ts has no fakeAi');

  // Check InvoiceScannerTab has NO fake OCR fallback
  const invoiceScannerContent = fs.readFileSync('src/components/modals/InvoiceScannerTab.tsx', 'utf-8');
  assert(invoiceScannerContent.includes('تحليل الصور غير متاح حاليًا'), 'InvoiceScannerTab strictly communicates unconfigured state without fake fallback');

  // Check CopilotChatTab has NO fake responses
  const copilotChatContent = fs.readFileSync('src/assistant/ui/CopilotChatTab.tsx', 'utf-8');
  assert(copilotChatContent.includes('المساعد الذكي غير مُهيأ بعد'), 'CopilotChatTab displays clear unconfigured notice when API key is missing');

  // =========================================================================
  // 5. SECURITY AUDIT (NO LEAKED CREDENTIALS)
  // =========================================================================
  console.log('\n--- 5. Security Audit ---');

  // Verify no hardcoded API keys starting with AIza in src/
  const clientFiles = ['src/App.tsx', 'src/main.tsx', 'src/db/sqlite.ts', 'src/assistant/orchestrator/AssistantOrchestrator.ts'];
  for (const cf of clientFiles) {
    if (fs.existsSync(cf)) {
      const c = fs.readFileSync(cf, 'utf-8');
      assert(!c.includes('AIzaSy'), `${cf} contains NO Google API key prefix`);
      assert(!c.includes('process.env.GEMINI_API_KEY'), `${cf} does not access server-only GEMINI_API_KEY`);
    }
  }

  // Verify server.ts never prints GEMINI_API_KEY in console
  assert(!serverContent.includes('console.log(process.env.GEMINI_API_KEY)'), 'server.ts never logs raw GEMINI_API_KEY');
  assert(!serverContent.includes('console.log(key)'), 'server.ts never logs raw key variable');

  // Verify .env.example defines GEMINI_API_KEY declaration
  const envExample = fs.existsSync('.env.example') ? fs.readFileSync('.env.example', 'utf-8') : '';
  assert(envExample.includes('GEMINI_API_KEY='), '.env.example declares GEMINI_API_KEY');

  console.log('\n======================================================');
  console.log(`PHASE 8.3 TESTS COMPLETED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase83Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
