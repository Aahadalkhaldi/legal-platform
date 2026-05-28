"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Save, ShieldAlert } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SaveMode = "draft" | "activate";
type InitialAction = "lawsuit" | "complaint";
type ConflictCheckStatus = "clear" | "pending";
type EngagementAgreementStatus = "signed" | "pending";
type PoaStatus = "valid" | "pending";
type IntakeWorkflowStatus = "draft" | "active" | "pending_documents";
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
      intakeWorkflowStatus: IntakeWorkflowStatus;
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
    representationReadiness: {
      readyForActivation: boolean;
      issues: string[];
      messages: string[];
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
  const [lastMode, setLastMode] = useState<SaveMode>("draft");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const configurationError = !supabase ? "تعذر تحميل إعدادات الاتصال بالخدمة." : null;

  const hasAnyInput = useMemo(() => {
    const trackedFields = [
      form.clientFullName,
      form.clientDisplayName,
      form.clientEmail,
      form.clientPhone,
      form.clientNationalId,
      form.clientAddress,
      form.opposingFullName,
      form.opposingIdentityNumber,
      form.opposingEmail,
      form.opposingPhone,
      form.opposingNotes,
      form.matterTitle,
      form.matterNumber,
      form.matterDescription,
      form.lawsuitCaseNumber,
      form.lawsuitCourtId,
      form.lawsuitCircuit,
      form.lawsuitDepartment,
      form.lawsuitClaimType,
      form.complaintAuthority,
      form.complaintReportNumber,
      form.complaintSubmissionDate,
      form.complaintComplainant,
      form.complaintRespondent,
      form.complaintProsecutorName,
      form.complaintPoliceStation,
    ];
    return trackedFields.some((value) => String(value).trim().length > 0);
  }, [form]);

  const projectedActiveState: IntakeWorkflowStatus = useMemo(() => {
    if (!isRepresentationReady(form)) {
      return "pending_documents";
    }

    return "active";
  }, [form]);

  async function submit(mode: SaveMode) {
    setLastMode(mode);
    setErrorMessage(null);
    const formValidationMessages = validateForm(form, mode);
    setValidationMessages(formValidationMessages);

    if (formValidationMessages.length > 0) {
      return;
    }

    if (!supabase) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = await requestApiWithSession<IntakeResponse>(supabase, "/api/v1/matters/intake", {
        method: "POST",
        body: JSON.stringify({
          saveMode: mode,
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
                caseNumber: form.lawsuitCaseNumber.trim() || undefined,
                courtId: form.lawsuitCourtId.trim() || undefined,
                circuit: form.lawsuitCircuit.trim() || undefined,
                department: form.lawsuitDepartment.trim() || undefined,
                claimType: form.lawsuitClaimType.trim() || undefined,
              }
            : undefined,
          complaint: form.initialAction === "complaint"
            ? {
                actionType: form.complaintActionType,
                authority: form.complaintAuthority.trim() || undefined,
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

      const nextStatus = payload.data.matter.intakeWorkflowStatus;
      router.replace(`/matters/${payload.data.matter.id}?intakeStatus=${encodeURIComponent(nextStatus)}`);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent("/matters/intake")}`);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "تعذر حفظ بيانات القيد.");
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
              <p className="eyebrow" style={{ margin: 0 }}>قيد ملف قانوني</p>
              <h1 style={{ margin: "8px 0 4px", fontSize: 30 }}>نموذج فتح ملف قانوني</h1>
              <p className="muted" style={{ margin: 0 }}>
                أدخل بيانات الموكل والخصم، ثم احفظ الملف كمسودة أو فعّله عند استكمال متطلبات التمثيل القانوني.
              </p>
            </div>
            <Link className="button button-secondary" href="/matters">
              <ArrowRight size={18} />
              الرجوع إلى الملفات
            </Link>
          </div>

          <div style={statusGuideStyle}>
            <strong>حالات الملف:</strong>
            <span>draft = مسودة</span>
            <span>active = نشط</span>
            <span>pending documents = بانتظار استكمال المستندات</span>
          </div>

          {!hasAnyInput ? (
            <p className="muted" style={{ margin: 0 }}>
              لم يتم إدخال أي بيانات بعد. ابدأ بإدخال البيانات الأساسية المشار إليها بعلامة *.
            </p>
          ) : null}

          <div style={{ ...statusGuideStyle, background: "rgba(0, 51, 153, 0.06)" }}>
            <strong>الحالة المتوقعة عند التفعيل:</strong>
            <span>{projectedStatusLabel(projectedActiveState)}</span>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit("activate");
            }}
            style={{ display: "grid", gap: 16 }}
          >
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>1) بيانات الموكل</h2>
              <label style={fieldStyle}>
                <span>اسم الموكل الكامل *</span>
                <input
                  required
                  value={form.clientFullName}
                  onChange={(event) => setForm((current) => ({ ...current, clientFullName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>الاسم المختصر</span>
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
                <span>الرقم الشخصي / التجاري</span>
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
                <span>ملاحظات على الخصومة</span>
                <textarea
                  rows={3}
                  value={form.opposingNotes}
                  onChange={(event) => setForm((current) => ({ ...current, opposingNotes: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>3) متطلبات التمثيل القانوني</h2>
              <label style={fieldStyle}>
                <span>نتيجة فحص تعارض المصالح *</span>
                <select
                  required
                  value={form.conflictCheckStatus}
                  onChange={(event) => {
                    const value = event.target.value as ConflictCheckStatus;
                    setForm((current) => ({ ...current, conflictCheckStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">قيد الفحص</option>
                  <option value="clear">سليم</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>اتفاقية الأتعاب *</span>
                <select
                  required
                  value={form.engagementAgreementStatus}
                  onChange={(event) => {
                    const value = event.target.value as EngagementAgreementStatus;
                    setForm((current) => ({ ...current, engagementAgreementStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">غير موقّعة</option>
                  <option value="signed">موقّعة</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>سند الوكالة *</span>
                <select
                  required
                  value={form.poaStatus}
                  onChange={(event) => {
                    const value = event.target.value as PoaStatus;
                    setForm((current) => ({ ...current, poaStatus: value }));
                  }}
                  style={inputStyle}
                >
                  <option value="pending">غير مكتمل</option>
                  <option value="valid">ساري/صحيح</option>
                </select>
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>4) بيانات الملف القانوني</h2>
              <label style={fieldStyle}>
                <span>موضوع الملف *</span>
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
                <span>ملخص الوقائع</span>
                <textarea
                  rows={3}
                  value={form.matterDescription}
                  onChange={(event) => setForm((current) => ({ ...current, matterDescription: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>5) الإجراء الافتتاحي</h2>
              <label style={fieldStyle}>
                <span>نوع الإجراء *</span>
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
                  <option value="complaint">بلاغ / شكوى</option>
                </select>
              </label>

              {form.initialAction === "lawsuit" ? (
                <>
                  <label style={fieldStyle}>
                    <span>رقم الدعوى</span>
                    <input
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
                    <span>القسم</span>
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
                    <span>تصنيف الشكوى / البلاغ *</span>
                    <select
                      required
                      value={form.complaintActionType}
                      onChange={(event) => {
                        const value = event.target.value as ComplaintActionType;
                        setForm((current) => ({ ...current, complaintActionType: value }));
                      }}
                      style={inputStyle}
                    >
                      <option value="police_report">بلاغ لدى الشرطة</option>
                      <option value="public_prosecution_complaint">شكوى لدى النيابة العامة</option>
                      <option value="cybercrime_report">بلاغ جرائم إلكترونية</option>
                      <option value="labor_complaint">شكوى عمالية</option>
                      <option value="administrative_complaint">شكوى إدارية</option>
                      <option value="regulatory_complaint">شكوى تنظيمية</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>الجهة المختصة</span>
                    <input
                      value={form.complaintAuthority}
                      onChange={(event) => setForm((current) => ({ ...current, complaintAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم الشكوى / البلاغ</span>
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
                    <span>اسم المشتكي</span>
                    <input
                      value={form.complaintComplainant}
                      onChange={(event) => setForm((current) => ({ ...current, complaintComplainant: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>اسم المشكو في حقه</span>
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
                    <span>المركز الأمني / الجهة</span>
                    <input
                      value={form.complaintPoliceStation}
                      onChange={(event) => setForm((current) => ({ ...current, complaintPoliceStation: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </>
              )}
            </section>

            {validationMessages.length > 0 ? (
              <div role="alert" style={validationBoxStyle}>
                <strong>يرجى استكمال المتطلبات التالية:</strong>
                <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {configurationError || errorMessage ? (
              <p role="alert" style={{ color: "#b42318", margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
                <ShieldAlert size={16} />
                {configurationError ?? errorMessage}
              </p>
            ) : null}

            <div className="actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="button button-secondary"
                disabled={isSubmitting || !!configurationError}
                onClick={() => void submit("draft")}
              >
                {isSubmitting && lastMode === "draft" ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
                {isSubmitting && lastMode === "draft" ? "جارٍ حفظ المسودة..." : "حفظ كمسودة"}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting || !!configurationError}
              >
                {isSubmitting && lastMode === "activate" ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
                {isSubmitting && lastMode === "activate" ? "جارٍ التفعيل..." : "حفظ وتفعيل الملف"}
              </button>
            </div>
          </form>
        </section>
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

const statusGuideStyle: CSSProperties = {
  border: "1px dashed var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  background: "rgba(255, 255, 255, 0.7)",
};

const validationBoxStyle: CSSProperties = {
  border: "1px solid #f9b5b5",
  background: "#fff7f7",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#912018",
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function isRepresentationReady(form: IntakeFormState) {
  return form.conflictCheckStatus === "clear"
    && form.engagementAgreementStatus === "signed"
    && form.poaStatus === "valid";
}

function validateForm(form: IntakeFormState, mode: SaveMode) {
  const messages: string[] = [];

  if (!form.clientFullName.trim()) {
    messages.push("يجب إدخال اسم الموكل الكامل.");
  }

  if (!form.opposingFullName.trim()) {
    messages.push("يجب إدخال اسم الخصم.");
  }

  if (!form.matterTitle.trim()) {
    messages.push("يجب إدخال موضوع الملف القانوني.");
  }

  if (mode === "activate") {
    if (form.initialAction === "lawsuit" && !form.lawsuitCaseNumber.trim()) {
      messages.push("عند التفعيل كدعوى، يجب إدخال رقم الدعوى.");
    }

    if (form.initialAction === "complaint" && !form.complaintAuthority.trim()) {
      messages.push("عند التفعيل كبلاغ/شكوى، يجب إدخال الجهة المختصة.");
    }

    if (!isRepresentationReady(form)) {
      if (form.conflictCheckStatus !== "clear") {
        messages.push("لا يمكن تفعيل الملف قبل اعتماد فحص تعارض المصالح (سليم).");
      }

      if (form.engagementAgreementStatus !== "signed") {
        messages.push("لا يمكن تفعيل الملف قبل توقيع اتفاقية الأتعاب.");
      }

      if (form.poaStatus !== "valid") {
        messages.push("لا يمكن تفعيل الملف قبل اعتماد سند الوكالة.");
      }
    }
  }

  return messages;
}

function projectedStatusLabel(status: IntakeWorkflowStatus) {
  if (status === "draft") return "draft (مسودة)";
  if (status === "pending_documents") return "pending documents (بانتظار استكمال المستندات)";
  return "active (نشط)";
}
