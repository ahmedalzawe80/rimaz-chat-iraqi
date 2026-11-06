# Rimaz Chat — v46.74.0

## صلاحيات الإدارة

يعتمد هذا الإصدار نموذجاً واحداً للرتب والصلاحيات:

- توجد سبع رتب ثابتة فقط، من `ADMIN كامل الصلاحيات` إلى `السوبر الأحمر`.
- صلاحيات الرتبة هي القالب الافتراضي المشترك لكل حساب يحملها.
- يمكن تخصيص حساب مسجل واحد بصلاحيات مستقلة تستبدل صلاحيات رتبته، دون التأثير على بقية الحسابات التي تحمل الرتبة نفسها.
- يمكن إعادة الحساب إلى صلاحيات رتبته بزر «إرجاع صلاحيات الرتبة».
- كل صلاحية تُفحص على الخادم عند تنفيذ الإجراء، وليس فقط بإخفاء زر الواجهة.
- المالك محمي ويبقى صاحب الصلاحيات الكاملة.

أزيلت المناصب العامة القديمة `admin` و`super` و`banner` ومسارات منحها من النظام النشط. عند أول تشغيل، تنفذ قاعدة البيانات ترحيلاً واحداً ينقل بياناتها القديمة إلى الرتب السبع ومجموعات الحسابات المستقلة، ثم يحذف مخازن الصلاحيات القديمة. كما تُحوّل الصلاحيات الشاملة القديمة للغرف وأدوات الدردشة إلى الصلاحيات الفرعية المقابلة.

## النشر

1. احتفظ بنسخة احتياطية من قاعدة البيانات ومجلدي `uploads` و`private-media`.
2. ارفع ملفات التطبيق من هذه الحزمة فوق ملفات الإصدار السابق.
3. لا تستبدل `data.json` بملف من الحزمة؛ الحزمة لا تتضمن قاعدة بيانات التشغيل.
4. أعد تشغيل التطبيق، ثم سجّل خروج حساب الاختبار وادخل مجدداً حتى تُحمّل الصلاحيات الجديدة.
5. من حساب المالك، افتح «صلاحيات الرتب»، وحدد صلاحيات الرتبة، ثم من «تخصيص صلاحيات حساب واحد» اختر الحساب الثاني وأزل ما لا تريد إظهاره له.

## الفحص

شغّل `npm test` لفحوصات التحقق المحلية. يلزم أيضاً اختبار حي على استضافة Deplexo بعد النشر؛ فنجاح الفحوصات المحلية لا يثبت اتصال الخادم أو إعدادات الاستضافة.


## v46.75.0 — Rank artwork and member decorations

- Open **صلاحيات الرتب**. Grant `rank_art_manage` to roles that may upload/delete artwork and bind it to one of the seven built-in ranks.
- Grant `member_decoration_manage` to roles that may assign/remove a decorative badge on an individual member profile.
- Uploads accept GIF, PNG, JPG, and WEBP (maximum 1 MB per file) and are stored in the persistent `uploads` directory; catalogue metadata is stored in `data.json`.
- Rank artwork replaces the built-in rank glyph; member decoration is an additional badge. Deleting a catalogue item clears its rank/member references without deleting ranks or accounts.
- These controls are rendered inside the existing **صلاحيات الرتب** panel; no new admin tab is added.
