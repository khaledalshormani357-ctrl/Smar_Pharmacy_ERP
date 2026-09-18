#!/usr/bin/env bash
set -e

echo "============================================="
echo "  بناء حزمة أندرويد Smart Pharmacy ERP APK  "
echo "============================================="

# 1. بناء ملفات الواجهة الأمامية
echo "1. جاري بناء ملفات تطبيق الويب وتحديث الحزم..."
npm run build

# 2. مزامنة Capacitor مع منصة أندرويد
echo "2. جاري مزامنة منصة أندرويد Capacitor..."
npx cap sync android

# 3. التأكد من صلاحيات التنفيذ
chmod +x ./android/gradlew

# 4. بناء ملف APK
echo "3. جاري تجميع وتوليد ملف APK بصيغة Debug..."
./android/gradlew -p android assembleDebug

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
    echo "============================================="
    echo "  تهانينا! تم إنشاء ملف APK بنجاح: "
    echo "  $APK_PATH"
    echo "============================================="
else
    echo "حدث خطأ أثناء إيجاد ملف APK الناتج."
fi
