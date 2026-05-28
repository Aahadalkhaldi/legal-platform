"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Save, ShieldAlert } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type InitialAction = "lawsuit" | "complaint";
type ConflictCheckStatus = "clear" | "pending";
type EngagementAgreementStatus = "signed" | "pending";
type PoaStatus = "valid" | "pending";
type ComplaintActionType =
  | "police_report"
  | "public_prosecution_complaint"
  | "cybercrime_report"
  | "labor_complaint"
  | "administrative_complaint"
  | "regulatory_complaint";

type IntakeResponse = {
  data: {
    matter: {
      id: string;
      matterNumber: string | null;
      title: string;
      status: string;
      intakeType: string;
      clientId: string | null;
      openedAt: string;
      updatedAt: string;
    };
    client: {
      id: string | null;
      persisted: boolean;
    };
    opposingParty: {
      id: string | null;
      persisted: boolean;
    };
    conflictCheckStatus: ConflictCheckStatus;
    engagementAgreementStatus: EngagementAgreementStatus;
    poaStatus: PoaStatus;
    initialAction: {
      type: InitialAction;
      proceedingId: string | null;
      proceedingPersisted: boolean;
    };
    fallbackSteps: string[];
  };
  requestId: string;
};

type IntakeFormState = {
  clientFullName: string;
  clientDisplayName: string;
  clientEmail: string;
  clientPhone: string;
  clientNationalId: string;
  clientAddress: string;
  opposingFullName: string;
  opposingIdentityNumber: string;
  opposingEmail: string;
  opposingPhone: string;
  opposingNotes: string;
  conflictCheckStatus: ConflictCheckStatus;
  engagementAgreementStatus: EngagementAgreementStatus;
  poaStatus: PoaStatus;
  matterTitle: string;
  matterNumber: string;
  matterDescription: string;
  initialAction: InitialAction;
  lawsuitCaseNumber: string;
  lawsuitCourtId: string;
  lawsuitCircuit: string;
  lawsuitDepartment: string;
  lawsuitClaimType: string;
  complaintActionType: ComplaintActionType;
  complaintAuthority: string;
  complaintReportNumber: string;
  complaintSubmissionDate: string;
  complaintComplainant: string;
  complaintRespondent: string;
  complaintProsecutorName: string;
  complaintPoliceStation: string;
};

const INITIAL_FORM_STATE: IntakeFormState = {
  clientFullName: "",
  clientDisplayName: "",
  clientEmail: "",
  clientPhone: "",
  clientNationalId: "",
  clientAddress: "",
  opposingFullName: "",
  opposingIdentityNumber: "",
  opposingEmail: "",
  opposingPhone: "",
  opposingNotes: "",
  conflictCheckStatus: "pending",
  engagementAgreementStatus: "pending",
  poaStatus: "pending",
  matterTitle: "",
  matterNumber: "",
  matterDescription: "",
  initialAction: "lawsuit",
  lawsuitCaseNumber: "",
  lawsuitCourtId: "",
  lawsuitCircuit: "",
  lawsuitDepartment: "",
  lawsuitClaimType: "",
  complaintActionType: "police_report",
  complaintAuthority: "",
  complaintReportNumber: "",
  complaintSubmissionDate: "",
  complaintComplainant: "",
  complaintRespondent: "",
  complaintProsecutorName: "",
  complaintPoliceStation: "",
};

export default function MatterIntakePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [form, setForm] = useState<IntakeFormState>(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPayload, setSuccessPayload] = useState<IntakeResponse["data"] | null>(null);
  const configurationError = !supabase ? "إعداد Supabase العام مفقود." : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessPayload(null);
    setIsSubmitting(true);

    if (!supabase) {
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = await requestApiWithSession<IntakeResponse>(supabase, "/api/v1/matters/intake", {
        method: "POST",
        body: JSON.stringify({
          client: {
            fullName: form.clientFullName.trim(),
            displayName: form.clientDisplayName.trim() || undefined,
            email: form.clientEmail.trim() || undefined,
            phone: form.clientPhone.trim() || undefined,
            nationalId: form.clientNationalId.trim() || undefined,
            address: form.clientAddress.trim() || undefined,
          },
          opposingParty: {
            fullName: form.opposingFullName.trim(),
            identityNumber: form.opposingIdentityNumber.trim() || undefined,
            email: form.opposingEmail.trim() || undefined,
            phone: form.opposingPhone.trim() || undefined,
            notes: form.opposingNotes.trim() || undefined,
          },
          conflictCheckStatus: form.conflictCheckStatus,
          engagementAgreementStatus: form.engagementAgreementStatus,
          poaStatus: form.poaStatus,
          matter: {
            title: form.matterTitle.trim(),
            matterNumber: form.matterNumber.trim() || undefined,
            description: form.matterDescription.trim() || undefined,
            status: "open",
          },
          initialAction: form.initialAction,
          lawsuit: form.initialAction === "lawsuit"
            ? {
                caseNumber: form.lawsuitCaseNumber.trim(),
                courtId: form.lawsuitCourtId.trim() || undefined,
                circuit: form.lawsuitCircuit.trim() || undefined,
                department: form.lawsuitDepartment.trim() || undefined,
                claimType: form.lawsuitClaimType.trim() || undefined,
              }
            : undefined,
          complaint: form.initialAction === "complaint"
            ? {
                actionType: form.complaintActionType,
                authority: form.complaintAuthority.trim(),
                reportNumber: form.complaintReportNumber.trim() || undefined,
                submissionDate: toIsoOrUndefined(form.complaintSubmissionDate),
                complainant: form.complaintComplainant.trim() || undefined,
                respondent: form.complaintRespondent.trim() || undefined,
                prosecutorName: form.complaintProsecutorName.trim() || undefined,
                policeStation: form.complaintPoliceStation.trim() || undefined,
              }
            : undefined,
        }),
      });

      setSuccessPayload(payload.data);
      setForm(INITIAL_FORM_STATE);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent("/matters/intake")}`);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "حدث خطأ أثناء الإرسال.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>MVP Intake</p>
              <h1 style={{ margin: "8px 0 4px", fontSize: 30 }}>تدفق فتح ملف قانوني</h1>
              <p className="muted" style={{ margin: 0 }}>
                نموذج واحد لإنشاء العميل، الخصم، فحص التعارض، الاتفاقية، الوكالة، الملف القانوني، والإجراء الأولي.
              </p>
            </div>
            <Link className="button button-secondary" href="/matters">
              <ArrowRight size={18} />
              الرجوع إلى القضايا
            </Link>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>1) بيانات العميل</h2>
              <label style={fieldStyle}>
                <span>الاسم الكامل *</span>
                <input
                  required
                  value={form.clientFullName}
                  onChange={(event) => setForm((current) => ({ ...current, clientFullName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>اسم العرض</span>
                <input
                  value={form.clientDisplayName}
                  onChange={(event) => setForm((current) => ({ ...current, clientDisplayName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  value={form.clientEmail}
                  onChange={(event) => setForm((current) => ({ ...current, clientEmail: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>رقم الجوال</span>
                <input
                  value={form.clientPhone}
                  onChange={(event) => setForm((current) => ({ ...current, clientPhone: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>الرقم الشخصي</span>
                <input
                  value={form.clientNationalId}
                  onChange={(event) => setForm((current) => ({ ...current, clientNationalId: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>العنوان</span>
                <textarea
                  rows={3}
                  value={form.clientAddress}
                  onChange={(event) => setForm((current) => ({ ...current, clientAddress: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>2) بيانات الخصم</h2>
              <label style={fieldStyle}>
                <span>اسم الخصم *</span>
                <input
                  required
                  value={form.opposingFullName}
                  onChange={(event) => setForm((current) => ({ ...current, opposingFullName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>رقم الهوية</span>
                <input
                  value={form.opposingIdentityNumber}
                  onChange={(event) => setForm((current) => ({ ...current, opposingIdentityNumber: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  value={form.opposingEmail}
                  onChange={(event) => setForm((current) => ({ ...current, opposingEmail: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>رقم الجوال</span>
                <input
                  value={form.opposingPhone}
                  onChange={(event) => setForm((current) => ({ ...current, opposingPhone: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>ملاحظات</span>
                <textarea
                  rows={3}
                  value={form.opposingNotes}
                  onChange={(event) => setForm((current) => ({ ...current, opposingNotes: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>3) الفحص والمستندات الأولية</h2>
              <label style={fieldStyle}>
                <span>حالة فحص التعارض *</span>
                <select
                  required
                  value={form.conflictCheckStatus}
                  onChange={(event) => {
                    const value = event.target.value as ConflictCheckStatus;
                    setForm((current) => ({ ...current, conflictCheckStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">معلق</option>
                  <option value="clear">سليم</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>حالة اتفاقية الأتعاب *</span>
                <select
                  required
                  value={form.engagementAgreementStatus}
                  onChange={(event) => {
                    const value = event.target.value as EngagementAgreementStatus;
                    setForm((current) => ({ ...current, engagementAgreementStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">معلق</option>
                  <option value="signed">موقعة</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>حالة الوكالة *</span>
                <select
                  required
                  value={form.poaStatus}
                  onChange={(event) => {
                    const value = event.target.value as PoaStatus;
                    setForm((current) => ({ ...current, poaStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">معلق</option>
                  <option value="valid">صحيحة</option>
                </select>
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>4) بيانات الملف القانوني</h2>
              <label style={fieldStyle}>
                <span>عنوان الملف *</span>
                <input
                  required
                  value={form.matterTitle}
                  onChange={(event) => setForm((current) => ({ ...current, matterTitle: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>رقم الملف</span>
                <input
                  value={form.matterNumber}
                  onChange={(event) => setForm((current) => ({ ...current, matterNumber: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>وصف مختصر</span>
                <textarea
                  rows={3}
                  value={form.matterDescription}
                  onChange={(event) => setForm((current) => ({ ...current, matterDescription: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>5) الإجراء الأولي</h2>
              <label style={fieldStyle}>
                <span>نوع الإجراء الأولي *</span>
                <select
                  required
                  value={form.initialAction}
                  onChange={(event) => {
                    const value = event.target.value as InitialAction;
                    setForm((current) => ({ ...current, initialAction: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="lawsuit">دعوى</option>
                  <option value="complaint">شكوى / بلاغ</option>
                </select>
              </label>

              {form.initialAction === "lawsuit" ? (
                <>
                  <label style={fieldStyle}>
                    <span>رقم القضية *</span>
                    <input
                      required
                      value={form.lawsuitCaseNumber}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCaseNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>معرّف المحكمة (UUID)</span>
                    <input
                      value={form.lawsuitCourtId}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCourtId: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الدائرة</span>
                    <input
                      value={form.lawsuitCircuit}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCircuit: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الإدارة / القسم</span>
                    <input
                      value={form.lawsuitDepartment}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitDepartment: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>نوع المطالبة</span>
                    <input
                      value={form.lawsuitClaimType}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitClaimType: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label style={fieldStyle}>
                    <span>نوع الشكوى / البلاغ *</span>
                    <select
                      required
                      value={form.complaintActionType}
                      onChange={(event) => {
                        const value = event.target.value as ComplaintActionType;
                        setForm((current) => ({ ...current, complaintActionType: value }));
                      }}
                      style={inputStyle}
                    >
                      <option value="police_report">بلاغ شرطة</option>
                      <option value="public_prosecution_complaint">شكوى للنيابة العامة</option>
                      <option value="cybercrime_report">بلاغ جرائم إلكترونية</option>
                      <option value="labor_complaint">شكوى عمالية</option>
                      <option value="administrative_complaint">شكوى إدارية</option>
                      <option value="regulatory_complaint">شكوى تنظيمية</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>الجهة المختصة *</span>
                    <input
                      required
                      value={form.complaintAuthority}
                      onChange={(event) => setForm((current) => ({ ...current, complaintAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم البلاغ / الشكوى</span>
                    <input
                      value={form.complaintReportNumber}
                      onChange={(event) => setForm((current) => ({ ...current, complaintReportNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>تاريخ التقديم</span>
                    <input
                      type="datetime-local"
                      value={form.complaintSubmissionDate}
                      onChange={(event) => setForm((current) => ({ ...current, complaintSubmissionDate: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>المشتكي</span>
                    <input
                      value={form.complaintComplainant}
                      onChange={(event) => setForm((current) => ({ ...current, complaintComplainant: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>المشتكى عليه / الخصم</span>
                    <input
                      value={form.complaintRespondent}
                      onChange={(event) => setForm((current) => ({ ...current, complaintRespondent: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>اسم المحقق / وكيل النيابة</span>
                    <input
                      value={form.complaintProsecutorName}
                      onChange={(event) => setForm((current) => ({ ...current, complaintProsecutorName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>المركز / الجهة الأمنية</span>
                    <input
                      value={form.complaintPoliceStation}
                      onChange={(event) => setForm((current) => ({ ...current, complaintPoliceStation: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </>
              )}
            </section>

            {configurationError || errorMessage ? (
              <p role="alert" style={{ color: "#b42318", margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
                <ShieldAlert size={16} />
                {configurationError ?? errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              className="button button-primary"
              disabled={isSubmitting || !!configurationError}
              style={{ width: "fit-content" }}
            >
              {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
              {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء ملف قانوني كامل"}
            </button>
          </form>
        </section>

        {successPayload ? (
          <section className="panel" style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <p className="eyebrow" style={{ margin: 0 }}>تم الحفظ بنجاح</p>
            <h2 style={{ margin: 0, fontSize: 24 }}>{successPayload.matter.title}</h2>
            <p style={{ margin: 0 }}>
              رقم الملف: <strong>{successPayload.matter.matterNumber ?? "غير متوفر"}</strong>
            </p>
            <p style={{ margin: 0 }}>
              معرف الملف: <strong>{successPayload.matter.id}</strong>
            </p>
            <p style={{ margin: 0 }}>
              الإجراء الأولي: <strong>{successPayload.initialAction.type}</strong>
              {" | "}
              محفوظ كـ proceeding: <strong>{successPayload.initialAction.proceedingPersisted ? "نعم" : "لا (تم حفظه داخل metadata)"}</strong>
            </p>
            {successPayload.fallbackSteps.length > 0 ? (
              <p style={{ margin: 0, color: "#7a4d00" }}>
                تم استخدام fallback metadata للخطوات: {successPayload.fallbackSteps.join(", ")}
              </p>
            ) : null}
            <div className="actions" style={{ marginTop: 4 }}>
              <Link className="button button-primary" href={`/matters/${successPayload.matter.id}`}>
                فتح تفاصيل الملف
              </Link>
              <Link className="button button-secondary" href="/matters">
                العودة إلى قائمة الملفات
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

const sectionStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  background: "rgba(255, 255, 255, 0.72)",
};

const sectionTitleStyle: CSSProperties = {
  gridColumn: "1 / -1",
  margin: 0,
  fontSize: 18,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  minHeight: 42,
  padding: "8px 12px",
  fontSize: 14,
  background: "white",
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}
