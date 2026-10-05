# نشر Backend OCR على Render

## لماذا نحتاج هذه الخطوة؟

APK يعمل داخل الهاتف، لكن `server.ts` لا يمكنه العمل من داخل APK. يجب تشغيله على خادم عام HTTPS حتى يصل إليه الهاتف. المشروع أصبح يحتوي على `Dockerfile` و`render.yaml` جاهزين للنشر.

## النشر

1. افتح رابط إنشاء الخدمة:
   https://render.com/deploy?repo=https://github.com/khaledalshormani357-ctrl/Smar_Pharmacy_ERP
2. سجّل الدخول إلى Render واربط حساب GitHub عند الطلب.
3. اختر المستودع والفرع `main` واترك اسم الخدمة:
   `smart-pharmacy-erp-api`
4. عند ظهور متغيرات البيئة، أضف:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** مفتاح Gemini الخاص بك
5. اضغط **Create Web Service** وانتظر حتى تصبح الحالة **Live**.
6. اختبر:
   `https://smart-pharmacy-erp-api.onrender.com/api/health`

يجب أن يعيد الاختبار JSON يحتوي على `status: "ok"`.

## ملاحظات الأمان

- لا تضع المفتاح في GitHub repository أو في APK.
- اجعل المفتاح داخل Render Environment Variables فقط.
- الخطة المجانية قد تدخل في وضع السكون، لذلك أول طلب بعد فترة خمول قد يتأخر قليلًا.
- إذا غيّرت اسم الخدمة، يصبح عنوانها مختلفًا؛ يجب عندها تحديث عنوان API الافتراضي في التطبيق أو إدخاله من شاشة إعدادات OCR.
