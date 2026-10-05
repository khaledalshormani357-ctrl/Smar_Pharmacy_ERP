# Smart Pharmacy ERP API — Cloudflare Worker

هذا Worker مجاني لمسارات الصحة والمساعد وOCR. مفتاح Gemini يجب أن يكون Cloudflare Secret باسم `GEMINI_API_KEY`.

## النشر من جهازك

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

عند `wrangler login` افتح رابط المتصفح وسجّل الدخول إلى Cloudflare، ثم وافق على الصلاحية. عند طلب قيمة `GEMINI_API_KEY` الصق المفتاح دون اسم المتغير.

بعد النشر سيكون الرابط:

```text
https://smart-pharmacy-erp-api.<اسم-حسابك>.workers.dev
```

اختبار الصحة:

```bash
curl https://smart-pharmacy-erp-api.<اسم-حسابك>.workers.dev/api/health
```

يجب أن تكون النتيجة JSON وبها `status: "ok"`.
