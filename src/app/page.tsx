import Link from "next/link";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  FileLock2,
  Landmark,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { QATAR_COURTS } from "@/lib/constants";

const modules = [
  { icon: BriefcaseBusiness, title: "إدارة القضايا", text: "بلاغ، قضية، تنفيذ، أطراف، تعارض مصالح، وخط زمني موحد." },
  { icon: CalendarDays, title: "الجلسات والمواعيد", text: "جلسات محاكم ونيابات، تذكيرات، ومهام مرتبطة بكل موعد." },
  { icon: FileLock2, title: "المستندات", text: "نسخ immutable، روابط مؤقتة، تدقيق تنزيل، وتخزين خاص." },
  { icon: Sparkles, title: "المساعد القانوني", text: "تلخيص، مخاطر، كيانات، مواد قانونية، وإجابات بمصادر." },
  { icon: MessageSquareText, title: "بوابة الموكل", text: "تحديثات منشورة فقط، رسائل، وثائق، وفواتير مع عزل صارم." },
  { icon: Bell, title: "الإشعارات", text: "WhatsApp، بريد، APNS، وتنبيهات لحظية حسب الصلاحية." },
  { icon: ShieldCheck, title: "RBAC وAudit", text: "Owner lockdown، RLS، وسجل غير قابل للتعديل للإجراءات الحساسة." },
  { icon: Landmark, title: "توطين قطري", text: "QAR، ar-QA، +974، ومحاكم ونيابات قطر كبيانات مرجعية." },
];

export default function Home() {
  return (
    <main className="app-shell">
      <div className="page-container">
        <header className="topbar">
          <div className="brand-mark">
            <span className="brand-icon">
              <Landmark size={24} />
            </span>
            <div>
              <div className="eyebrow">Legal Practice OS · Qatar</div>
              <strong>منصة الإدارة القانونية القطرية</strong>
            </div>
          </div>
          <span className="status-chip">MVP Foundation</span>
        </header>

        <section className="hero-grid">
          <div className="panel">
            <p className="eyebrow">Next.js + Supabase + SwiftUI</p>
            <h1 className="hero-title">نظام واحد آمن يربط مكتب المحاماة بالموكل لحظة بلحظة.</h1>
            <p className="hero-copy">
              هذا المشروع يؤسس منصة إنتاجية لإدارة القضايا، المستندات، الجلسات،
              الفواتير، بوابة الموكل، والتدقيق الأمني، مع عقود API جاهزة لتطبيق iOS native.
            </p>
            <div className="actions">
              <a className="button button-primary" href="/api/v1/me">
                <ShieldCheck size={18} />
                فحص API
              </a>
              <Link className="button button-secondary" href="/admin/dashboard">
                <BriefcaseBusiness size={18} />
                Admin Portal
              </Link>
              <Link className="button button-secondary" href="/client/dashboard">
                <MessageSquareText size={18} />
                Client Portal
              </Link>
              <Link className="button button-secondary" href="/matters">
                <BriefcaseBusiness size={18} />
                Matters Lifecycle
              </Link>
              <a className="button button-secondary" href="/docs/API_CONTRACTS.md">
                <FileLock2 size={18} />
                عقود الواجهات
              </a>
            </div>

            <div className="metric-grid" aria-label="مؤشرات المنصة">
              <div className="metric">
                <strong>38</strong>
                <span className="muted">جدول وفهرس أمني مبدئي</span>
              </div>
              <div className="metric">
                <strong>16</strong>
                <span className="muted">واجهة REST/Edge v1</span>
              </div>
              <div className="metric">
                <strong>10</strong>
                <span className="muted">محاكم قطرية seeded</span>
              </div>
            </div>
          </div>

          <aside className="panel">
            <p className="eyebrow">آخر تحديثات الموكل</p>
            <div className="timeline">
              <div className="timeline-item">
                <strong>تم نشر تحديث جديد للموكل</strong>
                <p className="muted">المحامي يتحكم بإظهار أو إخفاء كل تحديث من بوابة الموكل.</p>
              </div>
              <div className="timeline-item">
                <strong>رفع نسخة مستند جديدة</strong>
                <p className="muted">كل نسخة مرتبطة ببصمة SHA-256 ولا يتم استبدال الأصل.</p>
              </div>
              <div className="timeline-item">
                <strong>استخراج مخاطر قانونية</strong>
                <p className="muted">نتائج AI تحفظ مع provenance إلى نسخة المستند والاقتباس المصدر.</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="module-grid" aria-label="وحدات النظام">
          {modules.map((item) => (
            <article className="module" key={item.title}>
              <item.icon color="#003399" size={22} />
              <h2>{item.title}</h2>
              <p className="muted">{item.text}</p>
            </article>
          ))}
        </section>

        <section className="panel" style={{ marginTop: 20 }}>
          <p className="eyebrow">المحاكم القطرية</p>
          <p className="muted">{QATAR_COURTS.map((court) => court.nameAr).join("، ")}</p>
        </section>
      </div>
    </main>
  );
}
